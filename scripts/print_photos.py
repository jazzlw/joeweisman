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

SIZES = {"4x6": (6.0, 4.0), "5x7": (7.0, 5.0), "8x10": (10.0, 8.0)}


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

    caption = (entry.get("caption") or "").strip()
    lines = wrap(draw, caption, caption_font, W - 2 * margin) if caption else []

    bits = []
    if entry.get("taken_year"):
        bits.append(str(entry["taken_year"]))
    if entry.get("submitter"):
        bits.append(f"— {entry['submitter'].strip()}")
    credit = "  ".join(bits)

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
    cards = sorted(cards_dir.glob("*.jpg"))
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


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--size", choices=sorted(SIZES), default="5x7")
    ap.add_argument("--dpi", type=int, default=300, help="output resolution (default 300)")
    ap.add_argument("--min-dpi", type=float, default=150,
                    help="skip a photo that would print below this; 0 for all (default 150)")
    ap.add_argument("--force", action="store_true", help="redo cards that already exist")
    ap.add_argument("--manifest", default=str(ROOT / "media" / "print" / "manifest.json"))
    ap.add_argument("--out", default=None)
    ap.add_argument("--contact-sheet", action="store_true",
                    help="tile the finished cards onto sheets for a rotation check")
    args = ap.parse_args()

    out_default = ROOT / "media" / "print" / args.size
    if args.contact_sheet:
        ensure_fonts()
        return contact_sheets(
            pathlib.Path(args.out) if args.out else out_default,
            ROOT / "media" / "print" / "review",
        )

    mf = pathlib.Path(args.manifest)
    if not mf.exists():
        print(f"No manifest at {mf}. Run: npm run print:manifest", file=sys.stderr)
        return 1
    entries = json.loads(mf.read_text())
    ensure_fonts()

    out = pathlib.Path(args.out) if args.out else ROOT / "media" / "print" / args.size
    out.mkdir(parents=True, exist_ok=True)

    made = skipped = existing = missing = toosoft = 0
    soft: list[str] = []

    for e in entries:
        name = f"{slug(e.get('caption'), e['id'][:8])}--{e['id'][:8]}.jpg"
        dest = out / name
        # Re-measure even when the card exists, so a photograph that no longer
        # clears --min-dpi has its stale card cleared rather than silently kept.
        if dest.exists() and not args.force and not args.min_dpi:
            existing += 1
            continue

        built = build(e, args, SIZES[args.size])
        if built is None:
            missing += 1
            continue
        canvas, eff = built

        if args.min_dpi and eff < args.min_dpi:
            toosoft += 1
            soft.append(f"{eff:6.0f} dpi  {(e.get('caption') or '')[:44]}")
            # Clear any card left from an earlier run at a looser setting.
            # Skipping without doing so leaves a file behind that nothing
            # mentions again, and the folder is the print order.
            if dest.exists():
                dest.unlink()
                soft[-1] += "   [removed stale card]"
            continue

        canvas.save(dest, "JPEG", quality=94, dpi=(args.dpi, args.dpi), subsampling=0)
        made += 1

    print(f"\n  {args.size} at {args.dpi} dpi -> {out.relative_to(ROOT)}")
    print(f"    written .............. {made}")
    if existing:
        print(f"    already there ........ {existing}   (--force to redo)")
    if toosoft:
        print(f"    below {args.min_dpi:.0f} dpi ......... {toosoft}   (--min-dpi 0 to include)")
    if missing:
        print(f"    not pulled yet ....... {missing}   (npm run archive -- --pull)")
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
