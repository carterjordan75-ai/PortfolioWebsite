# XOXO — 39 styles, one motion, and the match cut itself

Twenty standalone exports of the same mark for match-cut edits: identical
viewBox (`-133.0 -226.3 1266.2 695.8`), identical clocks and seeds
(seed 1, eye seed 1, round 3400ms, boil 0.40 @ 8/s), row layout, eyes on,
no arms. Cut between any two files at the same timestamp and the boil,
the texture step, the eyes and the blinks carry straight through — only
the skin changes. Verified: one distinct viewBox and one distinct
eye-track signature across all files.

`00-matchcut.html` IS the match cut: the hero flicking through fifteen
skins on a randomised loop, hero first and last — one file, ready to
record. Build your own in the tool under the **Logos** section: every
skin below is a pickable pill there now, the ink-texture and outline
recipes included (each slot bakes its own filters), not just the
constructions. The hero is a pill like any other — a set without it
loops without it; picked, it still bookends a randomised order. A
**Registration** slider knocks each letter a touch off true on every
cut, per slot per letter, so no two frames of the flick sit
identically — the pupil rides its letter's plate, which keeps a pixel
eye on its lattice. Exports carry a one-line load sync so every
letter's flick shares one clock (a big file parses progressively and
CSS animations otherwise start per element, cutting up to 50ms apart).
The EYES match the construction — a pixel logo has a pixel pupil on
the same grid, a glitched one shreds its pupil on the same rows, haze
and glow blur the whole eye.

Open `index.html` for the live contact sheet. (Eight near-duplicate
overlay styles were retired when the construction families arrived.) Each file loops forever;
the resting loop follows the arrival. To rebuild or tweak any style in
the tuner, apply its recipe below over a sleep mark with the pinned
settings above (texture kind / Amount / Scale / Contrast under Global effects → Colour →
Ink texture; construction under Letters → Built as, with Detail for cell
size, bar pitch or the hand's looseness). 01-clean is the hero; 21-44
rebuild the letterforms themselves — pixel grids, fused bits, halftone
mosaics, scanline rasters, hand redraws — in the same place at the same
size, so the motion carries through a cut exactly as before.

| file | recipe |
|---|---|
| 01-clean | no texture |
| 02-lino-coarse | lino .55 / 1.6 / .6 |
| 03-lino-fine | lino .45 / 0.5 / .6 |
| 04-woodblock | lino .68 / 2.6 / .9 |
| 05-dry-brush | brush .5 / 1.2 / .5 |
| 06-brush-heavy | brush .75 / 2.2 / .6 |
| 07-halftone | halftone .5 / 0.5 / .8 |
| 08-newsprint | halftone .32 / 0.26 / .9 |
| 09-paper | paper .45 / 1.4 / .5 |
| 10-dust | paper .3 / 0.35 / .7 |
| 11-mottle | mottle .4 / 1.6 / .5 |
| 12-torn | mottle .6 / 2.4 / 1.0 |
| 13-static | noise .5 / 0.5 / .9 |
| 14-grain-soft | noise .3 / 1.2 / .3 |
| 15-outline | outline 7, fill 0, no texture |
| 16-sketch | outline 5, fill 0, brush .4 / 1.1 / .5 |
| 17-dusk | linear gradient #ffffff → #7c5cff @ 115° |
| 18-radial-glow | radial gradient #ffffff → #6b6b6b |
| 19-gradient-lino | dusk gradient + lino .45 / 1.0 / .6 |
| 20-blockline | outline 5 + fill + lino .42 / 1.5 / .7 |
| 21-pixel | built as pixel / detail 1 |
| 22-pixel-fine | pixel / 0.55 |
| 23-bits | bits / 1.05 — fused rounded units |
| 24-mosaic | mosaic / 1 — halftone-dither edges |
| 25-mosaic-coarse | mosaic / 1.7 |
| 26-scanlines | scanline / 1 |
| 27-scan-fine | scanline / 0.6 |
| 28-hand | hand / 1 — one naive redraw |
| 29-hand-line | hand / 1.3 + outline 5, fill 0 |
| 30-hand-rough | hand / 1 + lino .35 / 1.1 / .5 |
| 31-pixel-dust | pixel / 0.8 + paper .3 / 0.4 / .7 |
| 32-bits-dusk | bits / 1.05 + dusk gradient |
| 33-dots | dots / 1 — halftone dot build |
| 34-dots-coarse | dots / 1.9 |
| 35-mega-pixel | pixel / 2.4 — barely-there resolution |
| 36-slices | slices / 1 — horizontal shred |
| 37-glitch | glitch / 1 — bands shoved off-register |
| 38-rings | rings / 1 — contour topography |
| 39-spray | spray / 1 — stipple |
| 40-misprint | misprint / 1 — the press hit three times |
| 41-haze | haze / 1.4 — the letter as fog |
| 42-glow | glow / 1 — soft halo, burning core |
| 43-glitch-dusk | glitch / 1 + dusk gradient |
| 44-dots-dusk | dots / 1 + dusk gradient |
| 45-tenprint | 10 PRINT maze cells |
| 46-stitch | cross-stitch cells |
| 47-hollow | outlined pixel cells |
| 00-matchcut | the flick itself: 15 skins incl. the hand-drawn family, randomised, 0.32s, registration 0.5, cut spread 0.35 |

A note on dark ink: a near-black solid ink reads as MONO to the site
importer and follows the viewer's OS theme, so it is not a stable style
for a controlled edit — that is why there is no "black print" file here.
