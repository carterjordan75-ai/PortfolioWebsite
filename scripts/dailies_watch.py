#!/usr/bin/env python3
"""Connect a machine to a Motion Dailies project. Two modes.

UPLOAD ONLY — something else is already making the work; this just
publishes it. Nothing is run, nothing is downloaded.

    python3 dailies_watch.py --dir ~/state --out ~/renders --upload-only

AGENT LOOP — this drives Claude Code itself, feeding it the brief and
your feedback and publishing whatever it produces.

    python3 dailies_watch.py --dir ~/work --idle-run

Both follow the queue: the site marks exactly one project as current — the
oldest one set to "In progress" — and this works on that and nothing
else. Marking it Done from your phone is what moves it to the next, so a
project you're still writing a brief for is never picked up early.

In UPLOAD ONLY it watches --out and publishes anything new: name.mp4 is
the piece, name.png alongside it becomes the contact sheet, name.txt
becomes the note. Files already sent are never sent twice.

The agent loop additionally pulls the brief and references into
<dir>/<project>/references/, hands the agent any feedback you've left,
and publishes what it writes to ./out/.

The machine only ever makes OUTBOUND calls — nothing needs to reach it.

  --upload-only   don't run anything, just publish what appears
  --out PATH      the folder to watch (default <dir>/<project>/out)
  --once          one cycle, then exit (use this to try it out)
  --idle-run      agent loop: keep working from the brief even when
                  there's no feedback; this is the overnight mode
  --interval N    seconds between cycles (default 300)
  --project ID    ignore the queue and pin to one project
  --agent-cmd     override how the agent is invoked

SAFETY (agent loop only): it runs an agent unattended on instructions
typed from a phone, with whatever file access the command you pass it
allows. Point --dir at a project directory, not your home folder, and
keep it in git so you can see and undo what it did.
"""

# Keeps `str | None` annotations working on Python 3.9, which is still
# what a lot of machines ship with.
from __future__ import annotations

import argparse
import json
import os
import shlex
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dailies_push import (  # noqa: E402  (same directory, shared client)
    BASE_URL,
    _api,
    _download,
    new_entry_id,
    upload,
)

# Overridable because the CLI's flags depend on how it's installed. The
# default asks for non-interactive print mode and lets it apply edits;
# if your install needs different flags, pass --agent-cmd.
DEFAULT_AGENT_CMD = "claude -p --permission-mode acceptEdits"

VIDEO_EXT = {".mp4", ".mov", ".webm", ".m4v"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}
STATE_FILE = ".dailies-watch.json"


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def load_state(work: Path) -> dict:
    path = work / STATE_FILE
    if path.exists():
        try:
            return json.loads(path.read_text())
        except ValueError:
            pass
    return {"last_feedback_at": None, "pushed": []}


def save_state(work: Path, state: dict):
    (work / STATE_FILE).write_text(json.dumps(state, indent=2))


# ── inputs ──────────────────────────────────────────────────────────


def pick_project(pinned: str | None) -> dict | None:
    """
    Which project to work on now.

    Unpinned, this follows the queue: the site marks exactly one project
    as current — the oldest one set to "In progress" — and the machine
    works on that and nothing else. Marking it Done on the phone is what
    releases the machine to the next one, which is also what stops it
    picking up a project whose brief isn't written yet.
    """
    data = _api("/api/dailies/projects")
    projects = data.get("projects", [])

    if pinned:
        project = next((p for p in projects if p["id"] == pinned), None)
        if project is None:
            raise SystemExit(f"No project '{pinned}'. Create it at {BASE_URL}/dailies")
        return project

    current = data.get("current_project_id")
    return next((p for p in projects if p["id"] == current), None) if current else None


def _sync_collection(project: dict, key: str, out: Path, kindLabel: str):
    items = project.get(key) or []
    out.mkdir(parents=True, exist_ok=True)
    notes = []
    for i, item in enumerate(items, 1):
        name = item["url"].rsplit("/", 1)[-1].split("?")[0]
        dest = out / f"{i:02d}_{name}"
        if not dest.exists():
            _download(item["url"], dest)
            log(f"  new {kindLabel}: {dest.name}")
        if item.get("note"):
            notes.append(f"{dest.name}: {item['note']}")
    (out / "NOTES.txt").write_text("\n".join(notes) + ("\n" if notes else ""), encoding="utf-8")
    return len(items)


def sync_project(project: dict, work: Path) -> dict:
    """Brief, references and source material onto disk. Returns the project."""
    (work / "BRIEF.txt").write_text(project.get("brief") or "", encoding="utf-8")
    # Separate folders because they mean different things — see the prompt.
    _sync_collection(project, "references", work / "references", "reference")
    _sync_collection(project, "sources", work / "source", "source file")
    return project


def fetch_feedback(project_id: str, since_iso: str | None) -> list:
    """Feedback newer than what we've already acted on."""
    query = f"?project={project_id}"
    if since_iso:
        query += f"&since={since_iso[:10]}"
    items = _api(f"/api/feedback{query}")
    # `since` filters by day, so trim to strictly-newer by timestamp.
    if since_iso:
        items = [f for f in items if f["submitted_at"] > since_iso]
    return sorted(items, key=lambda f: f["submitted_at"])


def download_feedback_refs(feedback: dict, work: Path) -> Path | None:
    urls = feedback.get("reference_images") or []
    if not urls:
        return None
    out = work / "references" / f"feedback-{feedback['entry_id']}"
    out.mkdir(parents=True, exist_ok=True)
    for url in urls:
        dest = out / url.rsplit("/", 1)[-1].split("?")[0]
        if not dest.exists():
            _download(url, dest)
    return out


def build_prompt(project: dict, feedback: list, work: Path) -> str:
    parts = [
        f"You are working on the project \"{project['title']}\".",
        "",
        "STANDING BRIEF:",
        project.get("brief") or "(none set)",
        "",
        "REFERENCES — ./references/",
        "Direction only: match the feel, the pacing, the palette. Do NOT reuse",
        "these files in the piece itself. NOTES.txt says what each one is for.",
        "",
        "SOURCE MATERIAL — ./source/",
        "The actual footage and plates to build the piece FROM. These are the",
        "assets to cut, composite and grade. NOTES.txt says what each one is.",
    ]

    if feedback:
        parts += ["", "NEW FEEDBACK FROM THE REVIEWER — act on this:"]
        for f in feedback:
            parts.append("")
            parts.append(f"On \"{f.get('entry_title') or f['entry_id']}\":")
            for qid, answer in (f.get("answers") or {}).items():
                parts.append(f"  - {qid}: {answer}")
            if f.get("brief"):
                parts.append(f"  Direction: {f['brief']}")
            folder = download_feedback_refs(f, work)
            if folder:
                rel = folder.relative_to(work)
                parts.append(f"  They attached reference images in ./{rel}/")
            if f.get("render_master"):
                parts.append("  They asked for a FULL-QUALITY MASTER render of this one.")
    else:
        parts += ["", "No new feedback. Continue from the standing brief."]

    delivery = project.get("delivery") or {}
    if delivery.get("requested_at") and not delivery.get("done_at"):
        parts += [
            "",
            "=" * 60,
            "FINAL DELIVERABLES — THE PROJECT HAS BEEN APPROVED.",
            "",
            "Stop exploring. Produce the finished masters, in three shapes:",
            "",
            "  16:9   landscape",
            "  9:16   vertical",
            "  1:1    square",
            "",
            "Recompose each one for its own frame. Reframe the subject, move",
            "and rescale elements, adjust timing if it helps the shape read.",
            "Do NOT centre-crop or letterbox a single master into the other",
            "two — each should look like it was made for that ratio.",
            "",
            "Also produce ONE 1:1 still contact sheet of the piece.",
            "",
            "Name them exactly:",
            "  out/final_16x9.mp4",
            "  out/final_9x16.mp4",
            "  out/final_1x1.mp4",
            "  out/final_sheet.png",
            "=" * 60,
        ]

    parts += [
        "",
        "WHEN YOU HAVE SOMETHING TO SHOW:",
        "Write it into ./out/ — anything you leave there is uploaded to the",
        "review site automatically. A video is the piece itself; an image with",
        "the same name becomes its contact sheet; a .txt with the same name",
        "becomes the note shown under it. Example: out/loop05.mp4,",
        "out/loop05.png, out/loop05.txt.",
        "Only put finished things in ./out/ — scratch files belong elsewhere.",
    ]
    return "\n".join(parts)


# ── the agent ───────────────────────────────────────────────────────


def resolve_command(cmd: list) -> list:
    """
    Make the command actually launchable.

    On Windows, npm installs CLIs as `.cmd` shims and CreateProcess can't
    run those directly — they have to go through the command interpreter,
    or subprocess raises FileNotFoundError even though the command works
    fine when typed by hand.
    """
    exe = shutil.which(cmd[0])
    if exe is None:
        return cmd  # let it fail with the friendly message below
    if os.name == "nt" and exe.lower().endswith((".cmd", ".bat")):
        return ["cmd", "/c", exe] + cmd[1:]
    return [exe] + cmd[1:]


def run_agent(agent_cmd: str, prompt: str, work: Path, timeout: int) -> str:
    # posix=False on Windows so backslashes in paths survive splitting.
    parts = shlex.split(agent_cmd, posix=(os.name != "nt"))
    cmd = resolve_command(parts) + [prompt]
    log(f"  running: {' '.join(shlex.quote(c) for c in cmd[:-1])} <prompt>")
    try:
        proc = subprocess.run(
            cmd, cwd=str(work), capture_output=True, text=True, timeout=timeout
        )
    except FileNotFoundError:
        raise SystemExit(
            f"Could not run '{cmd[0]}'. Install the Claude Code CLI, or pass "
            f"--agent-cmd with the right command for your machine."
        )
    except subprocess.TimeoutExpired:
        log(f"  agent hit the {timeout}s timeout — moving on")
        return ""
    if proc.returncode != 0:
        log(f"  agent exited {proc.returncode}: {(proc.stderr or '').strip()[:300]}")
    return (proc.stdout or "").strip()


# ── outputs ─────────────────────────────────────────────────────────


def collect_outputs(out: Path, state: dict) -> list:
    """Finished pieces in the watched folder that haven't been pushed yet."""
    if not out.is_dir():
        return []
    pushed = set(state.get("pushed", []))
    found = []
    for path in sorted(out.iterdir()):
        if not path.is_file() or path.suffix.lower() not in VIDEO_EXT | IMAGE_EXT:
            continue
        # An image that partners a video is that video's contact sheet.
        if path.suffix.lower() in IMAGE_EXT and any(
            (out / (path.stem + ext)).exists() for ext in VIDEO_EXT
        ):
            continue
        key = f"{path.name}:{path.stat().st_size}:{int(path.stat().st_mtime)}"
        if key in pushed:
            continue
        found.append((path, key))
    return found


def push_output(project_id: str, path: Path, work: Path, agent_output: str, questions) -> str:
    out = path.parent
    entry_id = new_entry_id(project_id)
    is_video = path.suffix.lower() in VIDEO_EXT

    sheet = None
    if is_video:
        sheet = next((out / (path.stem + e) for e in IMAGE_EXT if (out / (path.stem + e)).exists()), None)

    note_file = out / (path.stem + ".txt")
    note = note_file.read_text(encoding="utf-8").strip() if note_file.exists() else ""
    if not note and agent_output:
        note = agent_output[-800:].strip()

    payload = {
        "project_id": project_id,
        "id": entry_id,
        "title": path.stem.replace("_", " ").replace("-", " ").strip() or path.name,
        "note": note,
    }
    if questions:
        payload["questions"] = questions

    if is_video:
        payload["video_url"] = upload(path, project=project_id, kind="video", entry_id=entry_id)
        if sheet:
            payload["contact_sheet_url"] = upload(
                sheet, project=project_id, kind="contact_sheet", entry_id=entry_id
            )
    else:
        payload["contact_sheet_url"] = upload(
            path, project=project_id, kind="contact_sheet", entry_id=entry_id
        )

    _api("/api/dailies", method="POST", payload=payload)
    return entry_id


# ── the loop ────────────────────────────────────────────────────────


def cycle(args, root: Path, log_state: dict) -> None:
    project = pick_project(args.project)
    if project is None:
        # Said once, not every cycle — this is the normal state while
        # you're writing the brief for whatever comes next.
        if log_state.get("idle_notice") != "none":
            log("  no project in progress — mark one 'In progress' on the site")
            log_state["idle_notice"] = "none"
        return
    log_state["idle_notice"] = project["id"]

    project_id = project["id"]
    # Each project gets its own folder, so switching projects never mixes
    # one piece of work into another's directory.
    work = root / project_id if not args.project else root
    work.mkdir(parents=True, exist_ok=True)

    # --out points at wherever the renders actually land. Without it we
    # use ./out under the project's own folder.
    out_dir = Path(args.out).expanduser().resolve() if args.out else work / "out"
    if not args.out:
        out_dir.mkdir(exist_ok=True)

    qfile = work / "questions.json"
    questions = json.loads(qfile.read_text()) if qfile.exists() else None

    state = load_state(work)

    # Upload-only: something else is already making the work, so don't
    # run an agent, don't pull references down, just publish what turns
    # up in the watched folder.
    if args.upload_only:
        found = collect_outputs(out_dir, state)
        if not found:
            if log_state.get("empty_notice") != project_id:
                log(f"  {project_id}: watching {out_dir} — nothing new yet")
                log_state["empty_notice"] = project_id
            return
        log_state.pop("empty_notice", None)
        for path, key in found:
            try:
                entry_id = push_output(project_id, path, out_dir, "", questions)
                state.setdefault("pushed", []).append(key)
                log(f"  pushed {path.name} -> {entry_id}")
            except SystemExit as err:
                log(f"  failed to push {path.name}: {err}")
        save_state(work, state)
        return

    sync_project(project, work)
    feedback = fetch_feedback(project_id, state.get("last_feedback_at"))

    delivery = project.get("delivery") or {}
    owed = bool(delivery.get("requested_at")) and not delivery.get("done_at")

    if feedback:
        log(f"  {project_id}: {len(feedback)} new piece(s) of feedback")
    elif owed:
        # Approval is a standing instruction until the masters land, so
        # this runs whether or not --idle-run was passed.
        log(f"  {project_id}: approved — final deliverables outstanding")
    elif not args.idle_run:
        log(f"  {project_id}: nothing new (pass --idle-run to work anyway)")
        return
    else:
        log(f"  {project_id}: working from the brief")

    prompt = build_prompt(project, feedback, work)
    (work / ".dailies-last-prompt.txt").write_text(prompt, encoding="utf-8")
    output = run_agent(args.agent_cmd, prompt, work, args.timeout)

    # Only mark feedback as handled once the agent has actually seen it,
    # so a crash mid-cycle replays it instead of dropping it.
    if feedback:
        state["last_feedback_at"] = feedback[-1]["submitted_at"]

    pushed_names = []
    for path, key in collect_outputs(out_dir, state):
        try:
            entry_id = push_output(project_id, path, out_dir, output, questions)
            state.setdefault("pushed", []).append(key)
            pushed_names.append(path.name)
            log(f"  pushed {path.name} -> {entry_id}")
        except SystemExit as err:
            log(f"  failed to push {path.name}: {err}")

    # Close the finishing job once all four masters are in, so the queue
    # can move on. Anything short of the full set leaves it open.
    delivery = project.get("delivery") or {}
    if delivery.get("requested_at") and not delivery.get("done_at"):
        want = {"final_16x9", "final_9x16", "final_1x1", "final_sheet"}
        have = {Path(k.split(":")[0]).stem for k in state.get("pushed", [])}
        if want <= have:
            _api("/api/dailies/projects", method="POST",
                 payload={"id": project_id, "delivery_done": True})
            log(f"  {project_id}: final deliverables complete")
        else:
            missing = sorted(want - have)
            log(f"  {project_id}: still owed {', '.join(missing)}")

    save_state(work, state)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--project",
        help="pin to one project; omit to follow the queue (recommended)",
    )
    parser.add_argument(
        "--dir",
        required=True,
        help="workspace root — each project gets its own folder inside it",
    )
    parser.add_argument(
        "--out",
        help="folder the finished files land in (default: <dir>/<project>/out)",
    )
    parser.add_argument(
        "--upload-only",
        action="store_true",
        help="don't run an agent — just publish what appears in --out",
    )
    parser.add_argument("--interval", type=int, default=300, help="seconds between cycles")
    parser.add_argument("--timeout", type=int, default=3600, help="max seconds per agent run")
    parser.add_argument("--once", action="store_true", help="one cycle, then exit")
    parser.add_argument("--idle-run", action="store_true", help="work even with no new feedback")
    parser.add_argument("--agent-cmd", default=DEFAULT_AGENT_CMD)
    args = parser.parse_args()

    if not os.environ.get("DAILIES_API_KEY"):
        raise SystemExit("Set DAILIES_API_KEY in the environment first.")

    root = Path(args.dir).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)

    log(f"mode:      {'upload only' if args.upload_only else 'agent loop'}")
    log(f"workspace: {root}")
    if args.out:
        log(f"watching:  {Path(args.out).expanduser().resolve()}")
    log(f"portal:    {BASE_URL}/dailies")
    log(
        "following the queue — whichever project is 'In progress'"
        if not args.project
        else f"pinned to {args.project}"
    )

    log_state: dict = {}
    while True:
        try:
            cycle(args, root, log_state)
        except (urllib.error.URLError, TimeoutError) as err:
            log(f"  network problem, will retry: {err}")
        except SystemExit as err:
            log(f"  {err}")
        if args.once:
            return
        log(f"  sleeping {args.interval}s")
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
