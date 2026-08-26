#!/usr/bin/env python3
"""Install an encoded loop into the site, cache-safely.

Production serves /public assets with `max-age=31536000, immutable` —
a browser that has ever fetched a filename keeps it for a year and
never revalidates. Overwriting the same name silently strands every
returning visitor on the old audio (this happened). So: the filename
carries the content hash, and this script rewrites the module's
AUDIO_SRC to match. Usage:

    python3 tools/audio/install.py /path/to/loop.m4a
"""
import hashlib, pathlib, re, shutil, sys

src=pathlib.Path(sys.argv[1])
root=pathlib.Path(__file__).resolve().parents[2]
audio_dir=root/'public'/'assets'/'audio'
module=root/'src'/'lib'/'ambientAudio.ts'

h=hashlib.sha256(src.read_bytes()).hexdigest()[:8]
name=f'home-loop.{h}.m4a'
for old in audio_dir.glob('home-loop*.m4a'):
    if old.name!=name: old.unlink(); print('removed', old.name)
shutil.copy2(src, audio_dir/name)
print('installed', name)

ts=module.read_text()
ts2=re.sub(r"const AUDIO_SRC = '/assets/audio/home-loop[^']*'",
           f"const AUDIO_SRC = '/assets/audio/{name}'", ts)
assert ts2!=ts or name in ts, 'AUDIO_SRC anchor not found'
module.write_text(ts2)
print('AUDIO_SRC ->', f'/assets/audio/{name}')
