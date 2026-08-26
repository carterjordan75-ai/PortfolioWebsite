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
sixteenth pickups (note rate 3.99/s against the reference's 4.09); the
pluck is a SYNTH voice by request — a saw-rich source through a
resonant low-pass that opens at the strike and closes into the dark
(the filter envelope is what stops it reading as a piano), with a
quiet sub-octave sine under each note; clean attack, gentled wow, a
steadier image. Under the roll sits what the
reference does not have and the ear asked for: a dark drone bed — root
an octave below the arp, octave/twelfth/fifth on top, low-passed at
560 Hz, breathing on whole-cycle LFOs, crossfading at the chord turns.
Under those, the rhythm section the ear asked for: a deep muffled kick
(a 95→33 Hz fall, low-passed at 170 — boom, not punch) on beats one and
three with an occasional ghost, fading in after the intro and receding
into the seam; and a proper bassline an octave below the arp — the root
held low, restruck mid-bar, walking a fifth at each chord turn. Bass
and drone duck gently around the kick so the low end pockets. The tape
surface is a whisper (hiss −60 dB, a few dust ticks) and the bus is
nearly clean — parallel tanh at drive 1.7, blend 0.38, a soft ceiling
eased to 1.18. And cut in from another room, six times across the
loop: the distorted sound of a home tape. The talk slots now play REAL
audio: any WAV dropped into `tools/audio/tape/` is wrecked through the
tape chain and cut in, in order (currently eight moments from a 1990s
family tape the owner supplied and directed be used, after the
concern about sampling it was raised and they reaffirmed — clips are
verified voiced speech, 240-330 Hz register, and the wreck chain keeps
words unintelligible and voices unidentifiable). The music leans back
32% while the tape speaks, radio static finds the channel first, and
the tape joins after every corrective stage. When the folder is empty
the synthesis returns.

Passing through the field, eight times: quick resonant glides — a
second or so each — far in the background now, more room than source,
sweeping the panorama and gone in a tenth of a second. At six chord
turns a LOW BRASS swell blooms quietly — the root an octave down,
harmonics arriving the way a section leans into a crescendo, the
growl kept low — while the bass and drone lean back a quarter to make
its pocket. Eight
tape moments spread evenly across the loop (about nineteen seconds
apart, 9s to 141s), every phrase ending on a long soft exhale (2.4 s or half the clip,
whichever is shorter, with the music returning over 1.3 s) — and each slot
carries its own CLARITY (0..1): the wreck's bandwidth, drive and
dropout depth follow it — but its LEVEL barely does, so the moments
differ in texture, not loudness. The bed leans darker still: pluck
filter at 3.2k, strings at 4.2k, one gentle pole at 5.6k across the
bus — the voices join after that pole on purpose, staying present
against the darker music.
Murmured talk at several pitches (a jittering glottal pulse through
three wandering formants at syllable cadence) and, twice, a young
girl's laugh — staccato voiced bursts falling in pitch and force, a
breath between bouts — all narrowed, driven and given dropouts, with
radio static finding the channel before most phrases (chopped squelch,
a falling heterodyne whistle, the click of the switch). The tape joins
the mix at the very end of the chain, after every corrective stage.

Above the roll, a string section pitched DEEP by request — a cello
choir: four low voices per chord (A2-C#4 territory) under a written
tenor line, two long notes per chord (E4-C#4 / B3-E4 / C#4-A3 /
G#3-B3), octave-doubled downward into the C-string growl, deeper
vibrato, bow-breath for the sheen. It is present from the first bar and full
by seventy seconds, receding at the seam. The roll itself also
reaches higher as it builds — octave leaps and off-beat sparkle
ghosts. (The first attempt buried a chord pad in the same register as
the wash and doubling its gain changed nothing measurable — the line
is what fixed it.)

The match EQ that once pinned the bus to the reference's curve is
retired: the ear steered the piece away (strings, kicks, voices), and
measurement showed the EQ quietly erasing every addition inside its
band. The reference lives on in the sources — key, register, tempo,
density, level, arc — and a push into a soft ceiling still lands its
frame density (RMS −16.1 vs −16.1).

Where it lands: low end deliberately FULLER than the reference (sub
−39 vs −41), the top deliberately cleaner (pres −100 vs −68), mids
tracking it within a couple of dB, the same build-crest-release arc, a
bar-pulse autocorrelation of 0.76 with kick density breathing 12→54→23
per 30 s across the arc, and a seam step smaller than an ordinary
sample-to-sample move.

## Regenerate

    python3 tools/audio/compose.py /tmp/loop.wav
    afconvert -f m4af -d aac -b 160000 -q 127 /tmp/loop.wav public/assets/audio/home-loop.m4a
    python3 tools/audio/analyze.py /tmp/loop.wav   # aggregate comparison
    python3 tools/audio/deep.py /tmp/loop.wav      # event-level comparison

Needs numpy + scipy only. The AAC's 2112-sample priming is handled at runtime by
`src/lib/ambientAudio.ts`, which picks loop points from the decoded
duration — see the comments there before changing the encode.
