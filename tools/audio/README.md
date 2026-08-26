# The home-page loop

`/public/assets/audio/home-loop.m4a` — an original 150.000-second ambient
piece, composed in code to sit where the reference track
(`individuation.mp3`) sits, and built to loop forever without a seam.

## What the reference measured as (analyze.py)

- 198.6s, RMS −16.1 dBFS, ~16 dB frame dynamics; a slow build peaking
  around two-thirds in, then a release.
- Extremely dark spectrum: centroid 319 Hz, 85% rolloff at 420 Hz,
  almost nothing above 4 kHz. Very tonal (flatness ~0.001), very wide
  (side/mid 0.9).
- C# minor. Bass roots drifting E2 → F#2 → A2 with C# home; strongest
  pitch classes G#, A, F#, C#, E.
- A soft ~103 bpm pulse living in the 150–600 Hz band — no drums, no
  low-frequency attacks; onset density ~1.4/s.

## What the loop is

- 64 bars of 4/4 at 102.4 bpm = exactly 150.000 s. C# minor, eight-chord
  cycle (C#m, A, E, F#m twice around with m7/6/add9 colour), sub + bass
  gliding between roots with whole-cycle phase so the seam is silent.
- Wide detuned harmonic-stack pads (low-passed hard), an eighth-note
  mid-band throb instead of drums, sparse pentatonic wisps with
  wrap-around echoes, and a breath of low-passed air.
- The build/pulse/melody arcs are periodic splines — value AND slope
  match across the seam. All filtering is wrap-padded and the reverb is
  a circular FFT convolution, so even the tail folds back into bar one.
- Master lands at RMS −16.8 dBFS, rolloff85 415 Hz, C# minor 0.80 —
  bracketing the reference on every measured axis.

## Regenerate

    python3 tools/audio/compose.py /tmp/loop.wav
    afconvert -f m4af -d aac -b 160000 -q 127 /tmp/loop.wav public/assets/audio/home-loop.m4a
    python3 tools/audio/analyze.py /tmp/loop.wav   # compare against the table above

Needs numpy + scipy only. The AAC's 2112-sample priming is handled at
runtime by `src/lib/ambientAudio.ts`, which picks loop points from the
decoded duration — see the comments there before changing the encode.
