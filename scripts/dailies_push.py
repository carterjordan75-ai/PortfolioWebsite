#!/usr/bin/env python3
"""Motion Dailies client for the render PC. Standard library only.

    export DAILIES_API_KEY=...

    dailies_push.py push --date 2026-08-04 --title "Loop 05" \
        --note "Overnight pass." --video out/loop05.mp4 \
        --sheet out/loop05_contact.png --questions questions.json

    dailies_push.py pull --since 2026-08-01 --download-refs ./refs

Uploads are two-phase because Vercel caps request bodies at 4.5 MB and a
daily is 10-60 MB: ask for a scoped, one-hour upload ticket, PUT the bytes
straight to Blob, then POST the metadata with the resulting URLs. See
docs/motion-dailies.md.
"""

import argparse
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get("DAILIES_BASE_URL", "https://xoxo.studio").rstrip("/")
API_KEY = os.environ.get("DAILIES_API_KEY", "")


def _request(url, *, method="GET", body=None, headers=None, timeout=600):
    req = urllib.request.Request(url, data=body, method=method)
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", "replace")[:500]
        raise SystemExit(f"{method} {url} -> HTTP {err.code}\n{detail}") from None


def _api(path, *, method="GET", payload=None):
    return _request(
        f"{BASE_URL}{path}",
        method=method,
        body=json.dumps(payload).encode() if payload is not None else None,
        headers={
            "authorization": f"Bearer {API_KEY}",
            **({"content-type": "application/json"} if payload is not None else {}),
        },
    )


def upload(path: Path, date: str, kind: str) -> str:
    """Ticket -> direct PUT -> public URL."""
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    ticket = _api(
        "/api/dailies/upload-url",
        method="POST",
        payload={
            "date": date,
            "kind": kind,
            "filename": path.name,
            "content_type": content_type,
        },
    )

    size_mb = path.stat().st_size / 1_048_576
    print(f"  uploading {path.name} ({size_mb:.1f} MB) -> {ticket['pathname']}")

    # The body IS the file: no multipart, no form encoding.
    result = _request(
        ticket["put_url"],
        method=ticket.get("method", "PUT"),
        body=path.read_bytes(),
        headers=ticket["headers"],
    )
    return result["url"]


def cmd_push(args):
    questions = None
    if args.questions:
        questions = json.loads(Path(args.questions).read_text())
        if not isinstance(questions, list):
            raise SystemExit("--questions file must contain a JSON array")

    payload = {"date": args.date}
    if args.title is not None:
        payload["title"] = args.title
    if args.note is not None:
        payload["note"] = args.note
    elif args.note_file:
        payload["note"] = Path(args.note_file).read_text().strip()
    if questions is not None:
        payload["questions"] = questions

    if args.video:
        payload["video_url"] = upload(Path(args.video), args.date, "video")
    if args.sheet:
        payload["contact_sheet_url"] = upload(Path(args.sheet), args.date, "contact_sheet")

    result = _api("/api/dailies", method="POST", payload=payload)
    verb = "Created" if result.get("created") else "Updated"
    print(f"{verb} {args.date} — {BASE_URL}/dailies")


def cmd_pull(args):
    entries = _api(f"/api/feedback?since={args.since}")

    if args.download_refs:
        out = Path(args.download_refs)
        out.mkdir(parents=True, exist_ok=True)
        for entry in entries:
            for url in entry.get("reference_images", []):
                dest = out / f"{entry['date']}_{url.rsplit('/', 1)[-1]}"
                with urllib.request.urlopen(url, timeout=120) as res:
                    dest.write_bytes(res.read())
                print(f"  saved {dest}")

    json.dump(entries, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)

    push = sub.add_parser("push", help="upload a daily")
    push.add_argument("--date", required=True, help="YYYY-MM-DD (the record's identity)")
    push.add_argument("--title")
    push.add_argument("--note")
    push.add_argument("--note-file", help="read the note from a text file instead")
    push.add_argument("--video")
    push.add_argument("--sheet", help="contact sheet image")
    push.add_argument("--questions", help="JSON file: array of {id, prompt, type, options?}")
    push.set_defaults(func=cmd_push)

    pull = sub.add_parser("pull", help="fetch feedback")
    pull.add_argument("--since", required=True, help="YYYY-MM-DD, inclusive, on submission date")
    pull.add_argument("--download-refs", help="directory to save reference images into")
    pull.set_defaults(func=cmd_pull)

    args = parser.parse_args()
    if not API_KEY:
        raise SystemExit("Set DAILIES_API_KEY in the environment first.")
    args.func(args)


if __name__ == "__main__":
    main()
