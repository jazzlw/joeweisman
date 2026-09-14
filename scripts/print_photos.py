#!/usr/bin/env python3
"""Lay each photograph onto a printable card with its caption.

    .venv/bin/python scripts/print_photos.py                     5x7, skips work already done
    .venv/bin/python scripts/print_photos.py --size 8x10
    .venv/bin/python scripts/print_photos.py --force             redo everything
    .venv/bin/python scripts/print_photos.py --min-dpi 0         include the very soft ones

Run it after `npm run archive -- --pull` and `npm run print:manifest`. It reads
the pulled originals rather than anything the site serves: Cloudflare's public
variant caps at 1536px, which is fine for 5x7 and short of 8x10.

Safe to run repeatedly — a card that already exists is left alone unless
--force, so a second pass before the print order only does the new arrivals.

The card is the paper size; the photograph sits inside a dark border with its
caption underneath, so the image itself is smaller than the paper. Colours and
fonts are the site's own, dark theme.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont, ImageOps

try:
    # Phones send HEIC and Cloudflare keeps the original as sent, so the archive
    # has a few. Pillow needs a plugin to read them; without it they are skipped
    # and reported rather than silently missing from the print run.
    import pillow_heif

    pillow_heif.register_heif_opener()
    HEIC = True
except ImportError:
    HEIC = False

ROOT = pathlib.Path(__file__).resolve().parent.parent

# The site's dark palette, from src/app/tokens.css.
BG = "#17130F"       # --bg
TEXT = "#EDE6DA"     # --text    caption
MUTED = "#ADA294"    # --muted   year and credit

# The site's own faces. They ship as .woff2, which Pillow cannot read, so they
# are unpacked to TTF on first run — into media/, which is gitignored, hence
# rebuilding them rather than committing a second copy. Georgia is the fallback
# if that unpacking is unavailable, and is the site's own declared fallback for
# the body face, so the print still matches what most visitors saw.
FONT_DIR = ROOT / "media" / "print-fonts"
FALLBACK = pathlib.Path("/System/Library/Fonts/Supplemental")
WOFF2_DIR = ROOT / "src" / "app" / "fonts"
FACES = [
    "source-serif-4-latin-400-italic",
    "source-serif-4-latin-400-normal",
    "eb-garamond-latin-400-normal",
]


def ensure_fonts() -> None:
    """Unpack the site's woff2 faces to TTF if they aren't already."""
    missing = [f for f in FACES if not (FONT_DIR / f"{f}.ttf").exists()]
    if not missing:
        return
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        return  # Georgia it is.
    FONT_DIR.mkdir(parents=True, exist_ok=True)
    for face in missing:
        src = WOFF2_DIR / f"{face}.woff2"
        if not src.exists():
            continue
        try:
            f = TTFont(src)
            f.flavor = None
            f.save(FONT_DIR / f"{face}.ttf")
        except Exception as exc:  # noqa: BLE001 - falling back is fine
            print(f"  could not unpack {face}: {exc}", file=sys.stderr)

# Long edge first. 6x8 is 4:3 and 4x6 is 3:2, which between them match 110 of
# the 130 photographs exactly — most of what people sent came off a phone or a
# camera, not a scanner.
SIZES = {
    "4x6": (6.0, 4.0),    # 3:2
    "5x7": (7.0, 5.0),    # 1.4
    "6x8": (8.0, 6.0),    # 4:3
    "8x8": (8.0, 8.0),    # square
    "8x10": (10.0, 8.0),  # 1.25
    "8x12": (12.0, 8.0),  # 3:2, large
}

# What --size auto may choose from, in order of preference when two fit equally
# well. Medium sizes first: these are going on a wall and then home in a hand.
#
# 4x6 is deliberately absent. The border and caption take a fixed bite out of
# whatever paper they land on — about 0.28in a side plus the text — so on the
# smallest sheet the photograph itself is only 4.4 x 2.9in, barely half the
# card, and reads as a stamp in a wide dark mount. The same picture on 5x7 is
# 5.9 x 3.9in: two thirds of the sheet, and nearly twice the area for a third
# less resolution.
#
# 8x12 is absent for the opposite reason: it is also an exact 3:2, so with 4x6
# gone every 3:2 photograph jumped to it and a third of the order became the
# largest sheet on the list. It stays in SIZES for --size 8x12 by hand.
AUTO = ["6x8", "8x10", "8x8", "5x7"]

# Where a photograph goes when it is too soft for any of the above. Six of them
# are 1970s prints scanned at around 400px, and at 5x7 they fall under the bar;
# the choice for those is a small card or no card, and a small card is better.
LAST_RESORT = "4x6"

# Paper chosen by hand, keyed on the first eight characters of the id. The
# automatic choice goes on aspect ratio and then on resolution, which is the
# right default and says nothing about whether a photograph deserves the wall.
# A few do. Anything listed here skips the softness check too, on the grounds
# that somebody looked at it and decided.
PINNED = {
    "5375ad2f": "8x12",   # a rescan with the resolution to carry it
}


def load_font(name: str, fallback: str, pt: float, dpi: int) -> ImageFont.FreeTypeFont:
    px = max(8, int(round(pt * dpi / 72)))
    for path in (FONT_DIR / f"{name}.ttf", FALLBACK / fallback):
        if path.exists():
            return ImageFont.truetype(str(path), px)
    return ImageFont.load_default()


def wrap(draw: ImageDraw.ImageDraw, text: str, font, width: int) -> list[str]:
    """Greedy wrap. A single word longer than the line is left to overhang
    rather than broken, which reads better than a hyphen in the wrong place."""
    lines: list[str] = []
    for para in text.split("\n"):
        words, line = para.split(), ""
        for w in words:
            trial = f"{line} {w}".strip()
            if line and draw.textlength(trial, font=font) > width:
                lines.append(line)
                line = w
            else:
                line = trial
        lines.append(line)
    return [l for l in lines if l != ""] or [""]


def slug(text: str, fallback: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", (text or "").strip()).strip("-").lower()[:52]
    return s or fallback



def effective_dpi(img_w: int, img_h: int, paper: tuple[float, float], args, caption_lines: int) -> tuple[float, str]:
    """Resolution a photograph would print at on a given paper, and its orientation.

    Computed rather than rendered: scale is min(available/size), and the printed
    resolution is the output dpi divided by that scale, so the whole choice can
    be made without resizing anything six times per photograph.
    """
    margin = 0.28 * args.dpi
    line_h = 1.32 * (10 * args.dpi / 72)
    block = caption_lines * line_h + (1.5 * 8.5 * args.dpi / 72 if caption_lines else 0)
    gap = 0.14 * args.dpi if block else 0

    best = (0.0, "")
    long_in, short_in = paper
    for pw, ph, name in ((short_in, long_in, "portrait"), (long_in, short_in, "landscape")):
        W, H = pw * args.dpi, ph * args.dpi
        aw, ah = W - 2 * margin, H - 2 * margin - gap - block
        if aw <= 0 or ah <= 0:
            continue
        scale = min(aw / img_w, ah / img_h)
        area = (img_w * scale) * (img_h * scale)
        if area > best[0]:
            best = (area, name)
            dpi_here = args.dpi / scale
    return (dpi_here if best[1] else 0.0), best[1]


LINK = re.compile(r"\[([^\]]+)\]\((https?://[^\s)]+)\)")


def plain_caption(entry: dict) -> str:
    """The caption as it should read on paper.

    A caption may carry one hand-typed `[label](url)` link — the gallery turns
    it into something clickable. Paper cannot be clicked, so the card would
    otherwise print the brackets and a URL nobody can follow, in the middle of a
    sentence. Keep the label and drop the address.
    """
    return LINK.sub(r"\1", (entry.get("caption") or "").strip()).strip()


def pick_size(entry: dict, args) -> str | None:
    """Choose the paper that suits one photograph.

    Best aspect match first, so a 4:3 photograph lands on 6x8 and a 3:2 one on
    4x6 with almost no border either side, and only then by what stays sharp
    enough. A photograph too soft for every candidate gets the smallest, and is
    reported rather than quietly dropped.
    """
    if entry["id"][:8] in PINNED:
        return PINNED[entry["id"][:8]]

    w, h = entry.get("width"), entry.get("height")
    if not w or not h:
        return None
    if entry.get("rotation") in (90, 270):
        w, h = h, w
    ratio = max(w, h) / min(w, h)
    text = plain_caption(entry)
    lines = max(1, len(text) // 52 + 1) if text else 0

    def key(name: str):
        long_in, short_in = SIZES[name]
        paper_ratio = long_in / short_in
        mismatch = abs(paper_ratio - ratio) / max(paper_ratio, ratio)
        return (round(mismatch, 3), AUTO.index(name))

    for name in sorted(AUTO, key=key):
        dpi_here, _ = effective_dpi(w, h, SIZES[name], args, lines)
        if not args.min_dpi or dpi_here >= args.min_dpi:
            return name

    # Nothing in the preferred set holds up. Take the small card if it clears
    # the bar, and only give up if even that is too soft.
    dpi_here, _ = effective_dpi(w, h, SIZES[LAST_RESORT], args, lines)
    if not args.min_dpi or dpi_here >= args.min_dpi:
        return LAST_RESORT
    return None


def compose(img: Image.Image, entry: dict, args, W: int, H: int):
    """Lay the photograph and its caption onto one W x H card.

    Returns the card and the printed area, so the caller can try both paper
    orientations and keep whichever prints larger.
    """
    canvas = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(canvas)

    margin = int(0.28 * args.dpi)
    caption_font = load_font("source-serif-4-latin-400-italic", "Georgia Italic.ttf", 10, args.dpi)
    credit_font = load_font("source-serif-4-latin-400-normal", "Georgia.ttf", 8.5, args.dpi)

    caption = plain_caption(entry)
    lines = wrap(draw, caption, caption_font, W - 2 * margin) if caption else []

    # The year only. Who sent a photograph in is useful in the admin queue and
    # beside it in the gallery, but on a print somebody takes home it reads as a
    # byline on someone else's memory.
    #
    # Suppressed when the caption already says it — most of them do, and
    # "Joe in Ashland, 2013" above a line reading "2013" is just clutter. Same
    # rule as yearWorthShowing() in the gallery.
    year = entry.get("taken_year")
    credit = str(year) if year and str(year) not in caption else ""

    line_h = int(1.32 * caption_font.size)
    credit_h = int(1.5 * credit_font.size) if credit else 0
    block_h = len(lines) * line_h + credit_h
    gap = int(0.14 * args.dpi) if block_h else 0

    avail_w = W - 2 * margin
    avail_h = H - 2 * margin - gap - block_h
    if avail_w <= 0 or avail_h <= 0:
        return None

    # Fill the space rather than refusing to enlarge. Capping at the original
    # size left a 640x480 printing barely two inches wide, marooned in a large
    # dark card. How soft is too soft is a judgement, and --min-dpi is where it
    # is made: this fills the card and reports the resulting resolution so a
    # photograph that ends up below the bar is set aside for a smaller size.
    scale = min(avail_w / img.width, avail_h / img.height)
    iw, ih = max(1, int(img.width * scale)), max(1, int(img.height * scale))

    # Centre the photograph and its caption together. Centring the picture alone
    # pinned the words below it and left all the slack at the foot of the card.
    block = ih + gap + block_h
    top = margin + (H - 2 * margin - block) // 2

    photo = img.resize((iw, ih), Image.LANCZOS)
    x = (W - iw) // 2
    canvas.paste(photo, (x, top))

    ty = top + ih + gap
    for line in lines:
        draw.text((margin, ty), line, font=caption_font, fill=TEXT)
        ty += line_h
    if credit:
        draw.text((margin, ty + int(0.2 * credit_font.size)), credit, font=credit_font, fill=MUTED)

    effective_dpi = img.width / (iw / args.dpi)
    return canvas, iw * ih, effective_dpi


def build(entry: dict, args, paper: tuple[float, float]):
    src = ROOT / "media" / "archive" / entry["archive_key"]
    if not src.exists():
        return None

    try:
        img = Image.open(src)
    except Exception as exc:  # noqa: BLE001 - reported, not swallowed
        print(f"  could not read {src.name}: {exc}", file=sys.stderr)
        return None

    # EXIF orientation first — the file's pixels may be sideways with a tag
    # saying so, and nothing downstream reads that tag.
    img = ImageOps.exif_transpose(img)
    # Then whatever an admin set by hand, which is stored clockwise while
    # Pillow rotates anticlockwise.
    if entry.get("rotation"):
        img = img.rotate(-entry["rotation"], expand=True)
    img = img.convert("RGB")

    # Try the paper both ways up and keep whichever prints the photograph
    # larger. Choosing by which side is longer breaks down on a near-square
    # photograph, where a few pixels' difference would decide the whole layout
    # and leave wide bars down both sides.
    long_in, short_in = paper
    best = None
    for pw, ph in ((short_in, long_in), (long_in, short_in)):
        out = compose(img, entry, args, int(pw * args.dpi), int(ph * args.dpi))
        if out and (best is None or out[1] > best[1]):
            best = out
    if best is None:
        return None
    canvas, _area, eff = best
    return canvas, eff



def contact_sheets(cards_dir: pathlib.Path, out_dir: pathlib.Path, cols: int = 4, rows: int = 3) -> int:
    """Tile finished cards onto review sheets.

    The point is catching a photograph that is still on its side. The caption is
    fixed to the bottom edge of the card, so a sideways picture means turning the
    card to look at it and finding the words running up the side — which is worth
    a few minutes of checking before an order rather than after.

    Each cell is labelled with the id shown in /admin, so a wrong one can be
    found, turned there, and the tool re-run.
    """
    # Cards live in one folder per paper size, so gather across all of them —
    # the point is looking at every photograph, not at one order.
    cards = sorted(cards_dir.glob("*.jpg"))
    if not cards:
        cards = sorted(
            f for d in cards_dir.iterdir() if d.is_dir() and d.name != "review"
            for f in d.glob("*.jpg")
        )
    if not cards:
        print(f"  no cards in {cards_dir}", file=sys.stderr)
        return 1

    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("sheet-*.jpg"):
        old.unlink()

    cell_w, cell_h, pad, label_h = 460, 460, 18, 30
    W = cols * (cell_w + pad) + pad
    H = rows * (cell_h + label_h + pad) + pad
    font = load_font("source-serif-4-latin-400-normal", "Georgia.ttf", 9, 96)

    per = cols * rows
    made = 0
    for n in range(0, len(cards), per):
        sheet_img = Image.new("RGB", (W, H), "#0E0B08")
        draw = ImageDraw.Draw(sheet_img)
        for i, card in enumerate(cards[n : n + per]):
            r, c = divmod(i, cols)
            x = pad + c * (cell_w + pad)
            y = pad + r * (cell_h + label_h + pad)
            im = Image.open(card)
            im.thumbnail((cell_w, cell_h), Image.LANCZOS)
            sheet_img.paste(im, (x + (cell_w - im.width) // 2, y + (cell_h - im.height) // 2))
            draw.text((x, y + cell_h + 6), card.stem[-8:], font=font, fill="#ADA294")
        dest = out_dir / f"sheet-{n // per + 1:02d}.jpg"
        sheet_img.save(dest, "JPEG", quality=88)
        made += 1

    print(f"\n  {len(cards)} cards on {made} review sheet(s) -> {out_dir.relative_to(ROOT)}")
    print("  Look for anything on its side. Fix it in /admin, then:")
    print("    npm run print:manifest && python scripts/print_photos.py --force\n")
    return 0


def load_source(entry: dict):
    """The archived original, turned the right way up. None if unreadable."""
    src = ROOT / "media" / "archive" / entry["archive_key"]
    if not src.exists():
        return None
    try:
        img = Image.open(src)
    except Exception as exc:  # noqa: BLE001 - reported, not swallowed
        print(f"  could not read {src.name}: {exc}", file=sys.stderr)
        return None
    img = ImageOps.exif_transpose(img)
    if entry.get("rotation"):
        img = img.rotate(-entry["rotation"], expand=True)
    return img.convert("RGB")


def compose_slide(img: Image.Image, entry: dict, W: int, H: int) -> Image.Image:
    """One photograph on a 16:9 screen, captioned.

    Sized for reading across a room rather than in the hand, which is the only
    real difference from a card: the type is proportionally much larger, and
    the caption is centred and held to two thirds of the width, because a line
    of text run edge to edge on a wide screen is tiring to follow.
    """
    canvas = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(canvas)

    margin = int(H * 0.052)
    cap_font = load_font("source-serif-4-latin-400-italic", "Georgia Italic.ttf", H * 0.0315, 72)
    yr_font = load_font("source-serif-4-latin-400-normal", "Georgia.ttf", H * 0.023, 72)

    caption = plain_caption(entry)
    lines = wrap(draw, caption, cap_font, int(W * 0.66)) if caption else []
    year = entry.get("taken_year")
    yr = str(year) if year and str(year) not in caption else ""

    line_h = int(cap_font.size * 1.34)
    yr_h = int(yr_font.size * 1.7) if yr else 0
    block_h = len(lines) * line_h + yr_h
    gap = int(H * 0.035) if block_h else 0

    avail_w, avail_h = W - 2 * margin, H - 2 * margin - gap - block_h
    scale = min(avail_w / img.width, avail_h / img.height)
    iw, ih = max(1, int(img.width * scale)), max(1, int(img.height * scale))

    top = margin + (H - 2 * margin - (ih + gap + block_h)) // 2
    canvas.paste(img.resize((iw, ih), Image.LANCZOS), ((W - iw) // 2, top))

    y = top + ih + gap
    for line in lines:
        draw.text((W // 2, y), line, font=cap_font, fill=TEXT, anchor="ma")
        y += line_h
    if yr:
        draw.text((W // 2, y + int(yr_font.size * 0.3)), yr, font=yr_font, fill=MUTED, anchor="ma")
    return canvas


def make_slides(entries: list[dict], out: pathlib.Path, W: int, H: int) -> int:
    """Render every photograph as a slide, in date order.

    Ordered by the year on the record, with the undated ones as a coda at the
    end rather than guessed into the sequence. The order is baked into the
    filenames so that anything which plays a folder — ffmpeg, a television's
    own USB slideshow, Preview — gets the chronology for free, with no playlist
    to keep in step.
    """
    dated = sorted((e for e in entries if e.get("taken_year")), key=lambda e: e["taken_year"])
    undated = [e for e in entries if not e.get("taken_year")]

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    made = 0
    for i, e in enumerate(dated + undated, 1):
        img = load_source(e)
        if img is None:
            continue
        compose_slide(img, e, W, H).save(
            out / f"{i:04d}--{e['id'][:8]}.jpg", "JPEG", quality=92, subsampling=0)
        made += 1

    span = f"{dated[0]['taken_year']}-{dated[-1]['taken_year']}" if dated else "no dates"
    print(f"\n  {made} slides at {W}x{H} -> {out.relative_to(ROOT)}")
    print(f"    {len(dated)} in date order ({span}), {len(undated)} undated at the end")
    return 0


def make_video(entries: list[dict], slides: pathlib.Path, dest: pathlib.Path, base: float) -> int:
    """Encode the slides into one looping file to hand to whoever runs the screen.

    A video rather than a folder or a browser tab: it plays off a memory stick
    in a television, loops with one setting in any player, and cannot show a
    URL bar, a notification, or a screensaver twenty minutes in.

    Each slide is held for as long as its caption needs. A fixed interval is
    either too short for the long ones or leaves the wordless ones sitting
    there, and several of these captions are two full lines.
    """
    if not slides.is_dir() or not any(slides.glob("*.jpg")):
        print(f"No slides in {slides}. Run: --slides", file=sys.stderr)
        return 1

    # The interpreter's own environment first, then PATH. A Homebrew ffmpeg can
    # be on PATH and not run at all — a missing dylib from some unrelated
    # upgrade — and the one beside a conda python is the one that matches it.
    beside = pathlib.Path(sys.executable).parent / "ffmpeg"
    ffmpeg = str(beside) if beside.exists() else shutil.which("ffmpeg")
    if not ffmpeg:
        print("No ffmpeg found.", file=sys.stderr)
        return 1

    words = {e["id"][:8]: len(plain_caption(e).split()) for e in entries}
    files = sorted(slides.glob("*.jpg"))

    lines, total = [], 0.0
    for p in files:
        hold = min(13.0, base + 0.3 * words.get(p.stem[-8:], 0))
        lines.append(f"file '{p.name}'\nduration {hold:.2f}")
        total += hold
    # The concat demuxer drops the final entry's duration, so the last file is
    # named twice: once with its hold, once to close the list.
    lines.append(f"file '{files[-1].name}'")
    listing = slides / "concat.txt"
    listing.write_text("\n".join(lines) + "\n")

    dest.parent.mkdir(parents=True, exist_ok=True)
    # Broadcast range, tagged. JPEG is full-range, and an untagged full-range
    # file handed to a television is read as limited: every level shifts, and
    # on a design that is mostly one dark colour that shows up as a grey wash
    # where the black should be. Converting and saying so costs nothing.
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
           "-i", str(listing),
           "-vf", "fps=30,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
           "-c:v", "libx264", "-crf", "20", "-preset", "medium",
           "-colorspace", "bt709", "-color_primaries", "bt709",
           "-color_trc", "bt709", "-color_range", "tv",
           "-movflags", "+faststart", str(dest)]
    print(f"\n  encoding {len(files)} slides, {total/60:.1f} minutes ...")
    if subprocess.run(cmd).returncode != 0:
        print("  ffmpeg failed", file=sys.stderr)
        return 1
    listing.unlink()

    mb = dest.stat().st_size / 1e6
    print(f"  {dest.relative_to(ROOT)}  —  {total/60:.1f} min, {mb:.0f} MB")
    print(f"    holds run {base:.0f}s for a bare caption to 13s for the longest")
    return 0


def make_batches(root: pathlib.Path, limit: int) -> int:
    """Copy the finished order into upload batches a lab will accept.

    Labs cap how many files go up at once. Splitting has to happen somewhere
    other than the size folders themselves: a re-render writes back into those,
    and would not see cards that had been moved down a level — it would draw
    them again alongside, and the order would quietly hold two of everything.
    So this builds a separate tree and the size folders stay canonical.

    Copies rather than links, because a re-render replaces a card with a new
    file: a link would still be pointing at the old one, showing the correct
    name and the wrong picture. The tree is rebuilt from scratch each time for
    the same reason — it is a snapshot of the order, and a stale one is worse
    than none.
    """
    dest = root / "upload"
    if dest.exists():
        shutil.rmtree(dest)

    plan, total = [], 0
    for size in sorted(SIZES, key=lambda s: SIZES[s][0] * SIZES[s][1]):
        cards = sorted((root / size).glob("*.jpg")) if (root / size).is_dir() else []
        if not cards:
            continue
        # Even batches rather than full ones: 60 goes 30 and 30, not 50 and 10.
        # Both are two uploads, and the even pair is easier to keep track of
        # halfway through.
        n = -(-len(cards) // limit)
        per = -(-len(cards) // n)
        for i in range(n):
            chunk = cards[i * per:(i + 1) * per]
            if not chunk:
                continue
            name = size if n == 1 else f"{size}-batch-{i + 1}of{n}"
            folder = dest / name
            folder.mkdir(parents=True)
            for c in chunk:
                shutil.copy2(c, folder / c.name)
            plan.append((name, size, len(chunk)))
            total += len(chunk)

    lines = [f"{total} cards to order, in {len(plan)} upload(s) of at most {limit}.", ""]
    for name, size, count in plan:
        lines.append(f"  {name:22}  {count:3} prints at {size}")
    (dest / "order.txt").write_text("\n".join(lines) + "\n")

    print(f"\n  {total} cards -> {dest.relative_to(ROOT)}")
    for name, size, count in plan:
        print(f"    {name:22} {count:3}  prints at {size}")
    print(f"    {len(plan)} upload(s), none over {limit}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--size", choices=sorted(SIZES) + ["auto"], default="auto",
                    help="auto sorts each photo into the paper that suits it (default)")
    ap.add_argument("--dpi", type=int, default=300, help="output resolution (default 300)")
    ap.add_argument("--min-dpi", type=float, default=150,
                    help="skip a photo that would print below this; 0 for all (default 150)")
    ap.add_argument("--force", action="store_true", help="redo cards that already exist")
    ap.add_argument("--manifest", default=str(ROOT / "media" / "print" / "manifest.json"))
    ap.add_argument("--out", default=None)
    ap.add_argument("--contact-sheet", action="store_true",
                    help="tile the finished cards onto sheets for a rotation check")
    ap.add_argument("--slides", nargs="?", const="1920x1080", default=None,
                    metavar="WxH",
                    help="render every photograph as a captioned 16:9 slide in date "
                         "order, for a screen at the event (default 1920x1080)")
    ap.add_argument("--video", nargs="?", type=float, const=6.0, default=None,
                    metavar="SECONDS",
                    help="encode the rendered slides into one looping mp4, holding "
                         "each for SECONDS plus reading time (default 6)")
    ap.add_argument("--batches", nargs="?", type=int, const=50, default=None,
                    metavar="N",
                    help="copy the order into media/print/upload/ in batches of at "
                         "most N files, for a lab that caps an upload (default 50)")
    args = ap.parse_args()

    out_default = ROOT / "media" / "print" / args.size
    if args.batches:
        return make_batches(ROOT / "media" / "print", args.batches)

    if args.video:
        mf = pathlib.Path(args.manifest)
        if not mf.exists():
            print(f"No manifest at {mf}. Run: npm run print:manifest", file=sys.stderr)
            return 1
        return make_video(json.loads(mf.read_text()),
                          ROOT / "media" / "slides",
                          ROOT / "media" / "slideshow.mp4", args.video)

    if args.slides:
        mf = pathlib.Path(args.manifest)
        if not mf.exists():
            print(f"No manifest at {mf}. Run: npm run print:manifest", file=sys.stderr)
            return 1
        try:
            W, H = (int(n) for n in args.slides.lower().split("x"))
        except ValueError:
            print(f"--slides wants WxH, e.g. 1920x1080 (got {args.slides!r})", file=sys.stderr)
            return 1
        ensure_fonts()
        return make_slides(json.loads(mf.read_text()),
                           pathlib.Path(args.out) if args.out else ROOT / "media" / "slides",
                           W, H)
    if args.contact_sheet:
        ensure_fonts()
        where = pathlib.Path(args.out) if args.out else (
            ROOT / "media" / "print" if args.size == "auto" else out_default
        )
        return contact_sheets(where, ROOT / "media" / "print" / "review")

    mf = pathlib.Path(args.manifest)
    if not mf.exists():
        print(f"No manifest at {mf}. Run: npm run print:manifest", file=sys.stderr)
        return 1
    entries = json.loads(mf.read_text())
    ensure_fonts()

    root_out = pathlib.Path(args.out) if args.out else ROOT / "media" / "print"
    auto = args.size == "auto"

    # What each card was last rendered from. Whether a card is up to date
    # cannot be answered by its filename: the name carries a slug of the
    # caption, so correcting "CFMC" to "CfMC", or a year from 2024 to 2022,
    # changes what belongs on the card without changing what it is called. The
    # run then finds the file already there and skips it, and the wrong card
    # goes to the lab looking exactly like a right one.
    stamp_file = root_out / ".rendered.json"
    try:
        stamps = json.loads(stamp_file.read_text())
    except (OSError, ValueError):
        stamps = {}
    fresh: dict[str, str] = {}

    made = existing = missing = toosoft = 0
    soft: list[str] = []
    tally: dict[str, int] = {}
    # Everything that did not get a card, with the reason. Written out at the
    # end: a photograph silently absent from the order is the one failure here
    # nobody would notice until the prints arrived.
    rejects: list[tuple[str, str, str]] = []

    for e in entries:
        size = pick_size(e, args) if auto else args.size
        if size is None:
            toosoft += 1
            dims = f"{e.get('width')}x{e.get('height')}" if e.get("width") else "no size recorded"
            soft.append(f"  ----   {(e.get('caption') or '')[:46]}")
            rejects.append((e["id"][:8], f"too soft at every size ({dims})", e.get("caption") or ""))
            continue

        out = (root_out / size) if auto else (root_out if args.out else root_out / size)
        out.mkdir(parents=True, exist_ok=True)
        name = f"{slug(plain_caption(e), e['id'][:8])}--{e['id'][:8]}.jpg"
        dest = out / name

        # Everything that decides what the card looks like. A change to any of
        # it is a card that has to be drawn again, whatever the file is called.
        src = ROOT / "media" / "archive" / e["archive_key"]
        fp = json.dumps([plain_caption(e), e.get("taken_year"), size,
                         e.get("rotation"), args.dpi,
                         src.stat().st_mtime_ns if src.exists() else None],
                        sort_keys=True)
        fresh[e["id"][:8]] = fp

        # One card per photograph, matched on the id rather than the filename.
        # A run at a different size, a different softness bar, or an edited
        # caption all leave the old card where it was — and since each folder
        # is an order, the same picture would be printed twice with nothing to
        # say so. The caption is the case that hides: it changes the slug the
        # filename is built from, so the old card sits in the same folder under
        # a name nothing will ever write again.
        for old in root_out.glob(f"*/*--{e['id'][:8]}.jpg"):
            if old != dest and old.parent.name in SIZES:
                old.unlink()

        if dest.exists() and not args.force and not args.min_dpi:
            existing += 1
            tally[size] = tally.get(size, 0) + 1
            continue

        built = build(e, args, SIZES[size])
        if built is None:
            missing += 1
            src = ROOT / "media" / "archive" / e["archive_key"]
            why = "not pulled yet" if not src.exists() else "could not be read"
            rejects.append((e["id"][:8], why, e.get("caption") or ""))
            continue
        canvas, eff = built

        if args.min_dpi and eff < args.min_dpi and e["id"][:8] not in PINNED:
            toosoft += 1
            line = f"{eff:6.0f} dpi  {(e.get('caption') or '')[:46]}"
            # Clear any card left from an earlier run at a looser setting.
            # Skipping without doing so leaves a file behind that nothing
            # mentions again, and the folder is the print order.
            if dest.exists():
                dest.unlink()
                line += "   [removed stale card]"
            soft.append(line)
            rejects.append((e["id"][:8], f"{eff:.0f} dpi at {size}, below the {args.min_dpi:.0f} bar",
                            e.get("caption") or ""))
            # Keep a viewable copy, so a photograph that matters can be looked
            # at and moved into an order by hand rather than just vanishing.
            (root_out / "_rejected").mkdir(parents=True, exist_ok=True)
            canvas.save(root_out / "_rejected" / name, "JPEG", quality=94,
                        dpi=(args.dpi, args.dpi), subsampling=0)
            continue

        if dest.exists() and not args.force and stamps.get(e["id"][:8]) == fp:
            existing += 1
            tally[size] = tally.get(size, 0) + 1
            continue

        canvas.save(dest, "JPEG", quality=94, dpi=(args.dpi, args.dpi), subsampling=0)
        made += 1
        tally[size] = tally.get(size, 0) + 1

    # Cards for photographs that are no longer in the manifest at all — one
    # deleted in the admin, or replaced by a better scan of the same picture,
    # which arrives as a new row with a new id. Nothing in the loop above can
    # reach these: it only ever walks the manifest, so a card whose photograph
    # left it is never looked at again and sits in the order until somebody
    # notices they printed the old copy alongside the new one.
    live = {e["id"][:8] for e in entries}
    orphans = [p for size in SIZES for p in (root_out / size).glob("*.jpg")
               if p.stem[-8:] not in live]
    for p in orphans:
        p.unlink()

    stamp_file.write_text(json.dumps(fresh, indent=1, sort_keys=True))

    for size in SIZES:
        d = root_out / size
        if d.is_dir() and not any(d.iterdir()):
            d.rmdir()

    rej_dir = root_out / "_rejected"
    if rejects:
        rej_dir.mkdir(parents=True, exist_ok=True)
        lines = [f"{len(rejects)} photographs are not in the order.", ""]
        for pid, why, cap in sorted(rejects, key=lambda r: r[1]):
            lines.append(f"{pid}  {why:<44}  {cap[:60]}")
        (rej_dir / "not-printed.txt").write_text("\n".join(lines) + "\n")
    elif (rej_dir / "not-printed.txt").exists():
        (rej_dir / "not-printed.txt").unlink()

    print(f"\n  {args.dpi} dpi -> {root_out.relative_to(ROOT)}")
    for size in sorted(tally, key=lambda k: -tally[k]):
        print(f"    {size:6} .............. {tally[size]:3}  cards")
    print(f"    written this run ..... {made}")
    if existing:
        print(f"    already there ........ {existing}   (--force to redo)")
    if toosoft:
        print(f"    below {args.min_dpi:.0f} dpi ......... {toosoft}   (--min-dpi 0 to include)")
    if missing:
        print(f"    not pulled yet ....... {missing}   (npm run archive -- --pull)")
    if orphans:
        print(f"    withdrawn ............ {len(orphans)}   (no longer in the manifest)")
        for p in orphans:
            print(f"      - {p.parent.name}/{p.name}")
    if rejects:
        print(f"    not in the order ..... {len(rejects)}   (media/print/_rejected/not-printed.txt)")
    if soft:
        print("\n  too soft for this size:")
        for s in sorted(soft)[:12]:
            print(f"    {s}")
        if len(soft) > 12:
            print(f"    … and {len(soft) - 12} more")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
