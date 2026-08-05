#!/usr/bin/env python3
"""Motion Dailies client for the render PC. Standard library only.

    export DAILIES_API_KEY=...

    # what should I work on, and what am I building from?
    dailies_push.py projects
    dailies_push.py refs --project kinetic-type --into ./inputs

    # post something it made (repeatable — a run posts many)
    dailies_push.py push --project kinetic-type --title "Loop 05" \
        --note "Overnight pass." --video out/05.mp4 --sheet out/05.png \
        --questions questions.json

    # read the reviewer's notes back
    dailies_push.py pull --since 2026-08-01 --download-refs ./feedback-refs

Work is organised by PROJECT, not by date: an overnight run produces many
entries and several projects can be live at once, so a date identifies
nothing. Uploads are two-phase because Vercel caps request bodies at
4.5 MB and a render is 10-60 MB: ask for a scoped one-hour upload ticket,
PUT the bytes straight to Blob, then POST the metadata with the resulting
URLs. See docs/motion-dailies.md.
"""

import argparse
import json
import mimetypes
import os
import random
import string
import sys
import time
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


def new_entry_id(project):
    """Minted here so an interrupted upload can be retried onto the same
    entry instead of creating a duplicate."""
    stamp = time.strftime("%Y%m%d%H%M%S", time.gmtime())
    tail = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(4))
    return f"{project[:44]}-{stamp}-{tail}"


def upload(path: Path, *, project, kind, entry_id=None) -> str:
    """Ticket -> direct PUT -> public URL."""
    content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    payload = {
        "project_id": project,
        "kind": kind,
        "filename": path.name,
        "content_type": content_type,
    }
    if entry_id:
        payload["entry_id"] = entry_id
    ticket = _api("/api/dailies/upload-url", method="POST", payload=payload)

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


def _download(url, dest: Path):
    with urllib.request.urlopen(url, timeout=120) as res:
        dest.write_bytes(res.read())


# ── commands ────────────────────────────────────────────────────────


def cmd_projects(args):
    data = _api("/api/dailies/projects")
    projects = data.get("projects", [])
    if args.json:
        json.dump(projects, sys.stdout, indent=2, ensure_ascii=False)
        sys.stdout.write("\n")
        return
    if not projects:
        print("No projects yet — make one at", f"{BASE_URL}/dailies")
        return
    labels = {"draft": "not started", "active": "in progress", "done": "done"}
    for p in projects:
        mark = " <- PC is on this" if p.get("is_current") else ""
        print(f"{p['id']}  —  {p['title']}  [{labels.get(p.get('status'), '?')}]{mark}")
        print(f"    {p['entry_count']} entries, "
              f"{len(p.get('references', []))} references, "
              f"{len(p.get('sources', []))} source files")
        if p.get("styles"):
            print(f"    style: {', '.join(p['styles'])}")
        summary = (p.get("brief_answers") or {}).get("what") or p.get("brief") or ""
        if summary.strip():
            print(f"    brief: {summary.strip().splitlines()[0][:100]}")


def download_collection(project, key, out: Path) -> int:
    """Pull one collection down, with a NOTES.txt of what each file is for."""
    items = project.get(key) or []
    if not items:
        return 0
    out.mkdir(parents=True, exist_ok=True)
    notes, links = [], []
    for i, item in enumerate(items, 1):
        # A link isn't a file. Its resolved images are; the URL goes to
        # LINKS.txt so it can be visited properly.
        if item.get("type") == "link":
            label = item.get("title") or item["url"]
            links.append(f"{label}\n  {item['url']}")
            for j, img in enumerate(item.get("images") or [], 1):
                name = img.rsplit("/", 1)[-1].split("?")[0] or f"img{j}"
                dest = out / f"{i:02d}_{j:02d}_{name}"
                if not dest.exists():
                    try:
                        _download(img, dest)
                        print(f"  saved {dest}")
                    except Exception as err:
                        # Scraped pages often hotlink-protect their images.
                        # Say so — a reference that silently isn't there is
                        # worse than one you know is missing.
                        print(f"  skipped (unreachable): {name} — {err}")
                        continue
            continue
        name = item["url"].rsplit("/", 1)[-1].split("?")[0]
        dest = out / f"{i:02d}_{name}"
        if not dest.exists():
            _download(item["url"], dest)
            print(f"  saved {dest}")
        if item.get("note"):
            notes.append(f"{dest.name}: {item['note']}")
    if notes:
        (out / "NOTES.txt").write_text("\n".join(notes) + "\n", encoding="utf-8")
    if links:
        (out / "LINKS.txt").write_text("\n\n".join(links) + "\n", encoding="utf-8")
    return len(items)


def cmd_refs(args):
    data = _api("/api/dailies/projects")
    project = next((p for p in data.get("projects", []) if p["id"] == args.project), None)
    if project is None:
        raise SystemExit(f"No project '{args.project}'. Run `projects` to list them.")

    out = Path(args.into)
    out.mkdir(parents=True, exist_ok=True)

    # The brief is the standing instruction — write it next to the files
    # so whatever reads this folder gets the words as well as the media.
    answers = project.get("brief_answers") or {}
    labels = [("what", "What it is"), ("where", "Where it ends up"),
              ("feel", "How it should move"), ("must", "Non-negotiables"),
              ("avoid", "What would make it generic")]
    lines = [f"{h}: {answers[k].strip()}" for k, h in labels if (answers.get(k) or "").strip()]
    if (project.get("brief") or "").strip():
        if lines:
            lines.append("")
        lines.append(project["brief"].strip())
    brief = "\n".join(lines)
    if project.get("styles"):
        brief = f"STYLE: {', '.join(project['styles'])}\n\n{brief}"
    (out / "BRIEF.txt").write_text(brief, encoding="utf-8")

    # Kept apart on disk as well as in the data: references are direction,
    # sources are the material the piece is built from. Mixing them is how
    # a mood clip ends up spliced into the edit.
    n_refs = download_collection(project, "references", out / "references")
    n_src = download_collection(project, "sources", out / "source")
    print(f"{n_refs} references, {n_src} source files -> {out}")


def cmd_push(args):
    questions = None
    if args.questions:
        questions = json.loads(Path(args.questions).read_text())
        if not isinstance(questions, list):
            raise SystemExit("--questions file must contain a JSON array")

    entry_id = args.entry_id or new_entry_id(args.project)

    payload = {"project_id": args.project, "id": entry_id}
    if args.date:
        payload["date"] = args.date
    if args.title is not None:
        payload["title"] = args.title
    if args.note is not None:
        payload["note"] = args.note
    elif args.note_file:
        payload["note"] = Path(args.note_file).read_text().strip()
    if questions is not None:
        payload["questions"] = questions

    if args.video:
        payload["video_url"] = upload(
            Path(args.video), project=args.project, kind="video", entry_id=entry_id
        )
    if args.sheet:
        payload["contact_sheet_url"] = upload(
            Path(args.sheet), project=args.project, kind="contact_sheet", entry_id=entry_id
        )

    result = _api("/api/dailies", method="POST", payload=payload)
    verb = "Created" if result.get("created") else "Updated"
    print(f"{verb} {result['entry']['id']} — {BASE_URL}/dailies/{args.project}")


def cmd_pull(args):
    query = f"?since={args.since}" if args.since else ""
    if args.project:
        query = f"{query}{'&' if query else '?'}project={args.project}"
    entries = _api(f"/api/feedback{query}")

    if args.download_refs:
        out = Path(args.download_refs)
        out.mkdir(parents=True, exist_ok=True)
        for entry in entries:
            for url in entry.get("reference_images", []):
                name = url.rsplit("/", 1)[-1].split("?")[0]
                dest = out / f"{entry['entry_id']}_{name}"
                _download(url, dest)
                print(f"  saved {dest}")

    json.dump(entries, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")


def cmd_new_project(args):
    payload = {"title": args.title}
    if args.id:
        payload["id"] = args.id
    if args.brief:
        payload["brief"] = args.brief
    result = _api("/api/dailies/projects", method="POST", payload=payload)
    print(f"{'Created' if result.get('created') else 'Updated'} {result['project']['id']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("projects", help="list projects (the work list)")
    p.add_argument("--json", action="store_true", help="raw JSON instead of a summary")
    p.set_defaults(func=cmd_projects)

    p = sub.add_parser("new-project", help="create a project")
    p.add_argument("--title", required=True)
    p.add_argument("--id", help="explicit slug; derived from the title otherwise")
    p.add_argument("--brief")
    p.set_defaults(func=cmd_new_project)

    p = sub.add_parser("refs", help="download a project's references + brief")
    p.add_argument("--project", required=True)
    p.add_argument("--into", required=True, help="directory to fill")
    p.set_defaults(func=cmd_refs)

    p = sub.add_parser("push", help="post an entry to a project")
    p.add_argument("--project", required=True)
    p.add_argument("--entry-id", help="reuse to retry an interrupted upload")
    p.add_argument("--date", help="YYYY-MM-DD; defaults to today")
    p.add_argument("--title")
    p.add_argument("--note")
    p.add_argument("--note-file", help="read the note from a text file instead")
    p.add_argument("--video")
    p.add_argument("--sheet", help="contact sheet image")
    p.add_argument("--questions", help="JSON file: array of {id, prompt, type, options?}")
    p.set_defaults(func=cmd_push)

    p = sub.add_parser("pull", help="fetch feedback")
    p.add_argument("--since", help="YYYY-MM-DD, inclusive, on submission date")
    p.add_argument("--project", help="limit to one project")
    p.add_argument("--download-refs", help="directory to save reference images into")
    p.set_defaults(func=cmd_pull)

    args = parser.parse_args()
    if not API_KEY:
        raise SystemExit("Set DAILIES_API_KEY in the environment first.")
    args.func(args)


if __name__ == "__main__":
    main()
