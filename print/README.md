# Print assets

Things that end up on paper. Kept here rather than in `media/`, which is
gitignored — a QR code that goes on a printed invitation needs to be
reproducible years later, by whoever still has the repository.

## The QR codes

| File | Encodes |
|---|---|
| `qr-joeweisman-org.svg` | `https://joeweisman.org` |
| `qr-joeweisman-org-service.svg` | `https://joeweisman.org/service` |

Regenerate both with:

```bash
npm run qr
```

The addresses and the settings live in `scripts/qr.mjs`. Add a code by adding a
line to the list there. `qrcode` is a pinned devDependency rather than an `npx`
call, so this still works years from now with no network.

### These are static, and that is the point

Most free "QR code generator" sites hand you a **dynamic** code: it encodes a
redirect through *their* domain, not yours, so they can sell you scan analytics
later. It works until that company folds, rebrands, or starts charging — and
then every printed invitation is a dead link. You cannot patch paper.

A static code encodes the address itself. It depends on nothing but the domain
continuing to exist, which is the same bet the whole site makes.

### Why the settings are what they are

- **SVG**, not PNG. Vector scales to any size on the press. A PNG generated at
  the wrong resolution prints soft, and nobody notices until the box arrives.
- **`-e H`** — 30% error correction, the highest. A thumbprint, a fold or a
  scuff on a card still scans. The URL is short enough that the code stays
  small anyway: 37×37 modules for the domain, 41×41 for `/service`.
- **The four-module white margin is part of the file.** That blank border is
  required by the spec, and a designer tidying up the layout by cropping to the
  black edge will stop it scanning. Do not trim it.

### For whoever lays out the card

- **Print the address in text next to it as well.** Much of this audience is
  older; some will not scan a QR code, and some will read the card long after
  the phone that could scan it. The text is what still works.
- Around **2 cm / ¾ inch** square is a safe minimum at arm's length.
- Keep it black on white or another high-contrast pair. Pale grey on cream
  looks better and scans worse.
- **Scan the actual proof before the full run.** Not the screen — the printed
  proof, in ordinary light, with an ordinary phone.
