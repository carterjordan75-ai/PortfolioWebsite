# XOXO — 20 styles, one motion

Twenty standalone exports of the same mark for match-cut edits: identical
viewBox (`-133.0 -226.3 1266.2 695.8`), identical clocks and seeds
(seed 1, eye seed 1, round 3400ms, boil 0.40 @ 8/s), row layout, eyes on,
no arms. Cut between any two files at the same timestamp and the boil,
the texture step, the eyes and the blinks carry straight through — only
the skin changes. Verified: one distinct viewBox and one distinct
eye-track signature across all twenty files.

Open `index.html` for the live contact sheet. Each file loops forever;
the resting loop follows the arrival. To rebuild or tweak any style in
the tuner, apply its recipe below over a sleep mark with the pinned
settings above (texture kind / Amount / Scale / Contrast under
Global effects → Colour → Ink texture).

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

A note on dark ink: a near-black solid ink reads as MONO to the site
importer and follows the viewer's OS theme, so it is not a stable style
for a controlled edit — that is why there is no "black print" file here.
