# The home-page loop

`/public/assets/audio/home-loop.m4a` — an original 150.000-second piece
built to sit as close as measurement allows to the reference track
(`individuation.mp3`), and to loop forever without a seam.

## What the reference actually is (deep.py, micro.py)

The first pass matched aggregate statistics and missed the music. The
event-level analysis is what mattered:

- **A rolling low arpeggio, no pads.** 813 onsets (4.1/s), inter-onset
  times massed at 0.10–0.30 s — constant eighth/sixteenth motion.
  Between notes the spectrum drops to −68 dB: there is no sustained bed;
  the space is the notes plus their room.
- **A dark pluck**, 13 ms attacks, ~1.9 s decay. Partial profile
  1.00 / 0.18 / 0.26 / 0.09 / 0.09 / 0.07 — fundamental-heavy with a
  hollow third.
- **Register F2–B3, median A2**, tops reaching C#4/D#4 as it builds.
  The build is more notes and higher tops, not louder layers.
- **Harmony on an 8 s clock**: A → E → F# → C#m round and round
  (bVI–bIII–iv–i in C# minor), with dorian A# brightening the F# chords
  and D# (the #11) colouring A.
- **Tape**: the whole track runs ~15–19 cents flat; per-note L/R balance
  wanders ±4.5 dB; hiss floor −61 dBFS and ~60 crackle clicks/s.
- **Mastered hot** (peak 0.0 dBFS): saturation of the low fundamentals
  supplies much of the 250 Hz–4 kHz ladder.

## How the loop is built (compose.py)

64 bars of 4/4 at 102.4 bpm = exactly 150.000 s. Four rounds of
A–E–F#–C#m, four bars each. A seeded rolling figure in eighths with
sixteenth pickups (note rate 4.05/s against the reference's 4.09); the
pluck is additive with the measured partial profile, 12 ms attack,
per-partial decay, a felt-strike noise burst; every note carries the
tape's wow/flutter/drift (whole cycles over the loop) and the global
flat tuning. A sub pluck doubles the root at each bar line. Hiss and
crackle run throughout; two slightly different rooms, one per side,
via circular convolution so the tail wraps the seam.

Then the two honest mastering moves: parallel tanh saturation for the
harmonic ladder, and a **match EQ** — the smoothed ratio of the
reference's Welch curve to the bus's, applied circularly — followed by
a push into a soft ceiling to the reference's frame density.

Verified against the reference with analyze.py: every band from sub to
air within ~1.2 dB, RMS −16.1 vs −16.1, rolloff85 409 vs 420 Hz, the
same build-crest-release arc, and a seam step smaller than the crackle
it hides in.

## Regenerate

    afconvert -f WAVE -d LEI16@44100 <reference.mp3> /tmp/ref.wav
    python3 tools/audio/compose.py /tmp/loop.wav /tmp/ref.wav
    afconvert -f m4af -d aac -b 160000 -q 127 /tmp/loop.wav public/assets/audio/home-loop.m4a
    python3 tools/audio/analyze.py /tmp/loop.wav   # aggregate comparison
    python3 tools/audio/deep.py /tmp/loop.wav      # event-level comparison

Needs numpy + scipy only. Without the reference argument the match EQ
stage is skipped. The AAC's 2112-sample priming is handled at runtime by
`src/lib/ambientAudio.ts`, which picks loop points from the decoded
duration — see the comments there before changing the encode.
