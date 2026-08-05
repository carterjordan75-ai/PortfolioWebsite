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


def past_learnings(projects: list, current_id: str, limit_chars: int = 24_000) -> list:
    """
    Learnings from every other project, newest first.

    Capped as a whole: a prompt that carries a year of notes crowds out
    the brief it's supposed to serve.
    """
    out, used = [], 0
    others = [p for p in projects if p["id"] != current_id and (p.get("learnings") or "").strip()]
    for p in sorted(others, key=lambda p: p.get("updated_at") or "", reverse=True):
        text = p["learnings"].strip()
        if used + len(text) > limit_chars:
            break
        out.append((p.get("title") or p["id"], text))
        used += len(text)
    return out


def _sync_collection(project: dict, key: str, out: Path, kindLabel: str):
    """
    Pull one collection down.

    A link is not a file, so it can't be downloaded as one. Its resolved
    images are — a Pinterest board arrives as its pins. The link itself is
    written to LINKS.txt so an agent with web access can go and look
    properly rather than working only from what we could scrape.
    """
    items = project.get(key) or []
    out.mkdir(parents=True, exist_ok=True)
    notes, links, n = [], [], 0

    for i, item in enumerate(items, 1):
        if item.get("type") == "link":
            label = item.get("title") or item["url"]
            links.append(f"{label}\n  {item['url']}" + (f"\n  note: {item['note']}" if item.get("note") else ""))
            for j, img in enumerate(item.get("images") or [], 1):
                name = img.rsplit("/", 1)[-1].split("?")[0] or f"img{j}"
                dest = out / f"{i:02d}_{j:02d}_{name}"
                if not dest.exists():
                    try:
                        _download(img, dest)
                        n += 1
                        log(f"  new {kindLabel} (from link): {dest.name}")
                    except Exception as err:
                        # Scraped pages often hotlink-protect their images.
                        # Say so — a reference that silently isn't there is
                        # worse than one you know is missing.
                        log(f"  skipped (unreachable): {name} — {err}")
                        continue
                if item.get("note"):
                    notes.append(f"{dest.name}: {item['note']} [from {label}]")
            continue

        name = item["url"].rsplit("/", 1)[-1].split("?")[0]
        dest = out / f"{i:02d}_{name}"
        if not dest.exists():
            _download(item["url"], dest)
            n += 1
            log(f"  new {kindLabel}: {dest.name}")
        if item.get("note"):
            notes.append(f"{dest.name}: {item['note']}")

    (out / "NOTES.txt").write_text("\n".join(notes) + ("\n" if notes else ""), encoding="utf-8")
    if links:
        (out / "LINKS.txt").write_text("\n\n".join(links) + "\n", encoding="utf-8")
    return len(items)


def sync_project(project: dict, work: Path) -> dict:
    """Brief, references and source material onto disk. Returns the project."""
    brief = brief_text(project)
    if project.get("styles"):
        brief = f"STYLE: {', '.join(project['styles'])}\n\n{brief}"
    (work / "BRIEF.txt").write_text(brief, encoding="utf-8")
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


PITCH_COUNT = 4

# Mirrors BRIEF_QUESTIONS in src/lib/dailies.ts — the labels the answers
# are rendered under, in the order they're asked.
BRIEF_LABELS = [
    ("what", "What it is"),
    ("where", "Where it ends up"),
    ("feel", "How it should move"),
    ("must", "Non-negotiables"),
    ("avoid", "What would make it generic"),
]


def brief_text(project: dict) -> str:
    """The answered questions, then anything extra, as one block."""
    answers = project.get("brief_answers") or {}
    lines = []
    for key, heading in BRIEF_LABELS:
        val = (answers.get(key) or "").strip()
        if val:
            lines.append(f"{heading}: {val}")
    extra = (project.get("brief") or "").strip()
    if extra:
        if lines:
            lines.append("")
        lines.append(extra)
    return "\n".join(lines) or "(none set)"


def build_pitch_prompt(project: dict, past: list = None) -> str:
    """
    Ask for concepts, not renders.

    A render costs hours and a concept costs nothing, so the choice
    between directions should be made in words. It also changes the
    posture: something that has to commit to an idea and defend it
    produces less middling work than something serving a description.
    """
    parts = [
        f"Project: \"{project['title']}\".",
        "",
        "BRIEF:",
        brief_text(project),
    ]
    if project.get("styles"):
        parts += ["", "STYLE: " + ", ".join(project["styles"])]

    parts += [
        "",
        "Reference material is in ./references/, source material in ./source/.",
        "Look at them before you write anything.",
    ]

    if past:
        parts += ["", "=" * 60, "WHAT YOU LEARNED ON EARLIER PROJECTS"]
        for title, text in past:
            parts += ["", f"--- {title} ---", text.strip()]
        parts += ["=" * 60]

    rejected = project.get("rejected_pitches") or []
    if rejected:
        parts += [
            "",
            "ALREADY REJECTED — do not come back with these, or with the same",
            "idea under a different name:",
        ] + [f"  - {t}" for t in rejected]

    parts += [
        "",
        "=" * 60,
        f"PITCH {PITCH_COUNT} CONCEPTS. Do not render anything yet.",
        "",
        "Each one needs a CONSTRAINT, not just a description. A description",
        "invites the default version of itself; a hard rule forces invention.",
        "\"Particles that dissolve\" is a description. \"One continuous shot,",
        "two colours, everything built from a single primitive\" is a constraint.",
        "",
        "Make them genuinely incompatible with each other. If two of them could",
        "sit in the same deck, you haven't gone far enough — push one until it's",
        "uncomfortable. One of the four should be the idea you'd normally talk",
        "yourself out of.",
        "",
        "Be honest in `risk`. Say what might make it fail, not a token worry.",
        "",
        "Write them to ./out/pitches.json, exactly this shape:",
        "[",
        '  {"id": "a", "title": "...", "concept": "...",',
        '   "constraint": "...", "why": "...", "risk": "..."}',
        "]",
        "Nothing else in ./out/ this round.",
        "=" * 60,
    ]
    return "\n".join(parts)


def build_prompt(project: dict, feedback: list, work: Path, past: list = None) -> str:
    parts = [
        f"You are working on the project \"{project['title']}\".",
        "",
        "STANDING BRIEF:",
        brief_text(project),
    ]

    chosen = next(
        (p for p in (project.get("pitches") or []) if p.get("id") == project.get("chosen_pitch_id")),
        None,
    )
    if chosen:
        parts += [
            "",
            "=" * 60,
            f"THE CONCEPT YOU ARE BUILDING: {chosen.get('title', '')}",
            "",
            chosen.get("concept", ""),
            "",
            f"CONSTRAINT — hold to this, it's the point: {chosen.get('constraint', '')}",
        ]
        if chosen.get("risk"):
            parts += ["", f"Known risk: {chosen['risk']}"]
        parts += ["=" * 60]

    styles = project.get("styles") or []
    if styles:
        parts += [
            "",
            "STYLE — what kind of thing this is:",
            "  " + ", ".join(styles),
            "These are the discipline, tools and look the reviewer picked. Treat",
            "them as constraints, not suggestions.",
        ]

    parts += [
        "",
        "REFERENCES — ./references/",
        "Direction only: match the feel, the pacing, the palette. Do NOT reuse",
        "these files in the piece itself. NOTES.txt says what each one is for.",
        "LINKS.txt, if present, lists boards and pages the reviewer pointed at —",
        "open them if you can browse; the images already pulled from them are here.",
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

    # Everything earlier projects worked out, so this one doesn't start
    # from nothing and rediscover the same dead ends.
    if past:
        parts += ["", "=" * 60, "WHAT YOU LEARNED ON EARLIER PROJECTS"]
        for title, text in past:
            parts += ["", f"--- {title} ---", text.strip()]
        parts += ["=" * 60]

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
            "Each ratio needs BOTH a video and its own still contact sheet,",
            "the sheet in that same ratio — a 9:16 cut gets a 9:16 sheet, not a",
            "square one. Six media files in total.",
            "",
            "AND write out/final_learnings.md — what you take away from this",
            "project. Not a summary of what you made; what you now KNOW.",
            "Techniques that worked and why, dead ends and what went wrong,",
            "settings and numbers worth reusing, things you'd do differently.",
            "Write it for yourself starting the next project cold. Be specific:",
            "\"displacement above 0.4 tore the mesh\" beats \"tune displacement\".",
            "",
            "Name them exactly — the .png beside each .mp4 is picked up as",
            "that cut's contact sheet, so the names must match:",
            "  out/final_16x9.mp4    out/final_16x9.png",
            "  out/final_9x16.mp4    out/final_9x16.png",
            "  out/final_1x1.mp4     out/final_1x1.png",
            "  out/final_learnings.md",
            "=" * 60,
        ]

    parts += [
        "",
        "=" * 60,
        "BEFORE YOU SHOW ME ANYTHING — CRITIQUE YOUR OWN WORK.",
        "",
        "Make more than you intend to show. Then look at what you made, as",
        "harshly as you'd look at someone else's, and answer:",
        "",
        "  - Is this actually interesting, or just competent? Be honest. Most",
        "    first attempts are competent. Competent is not the bar.",
        "  - Does it hold to the constraint, or did the constraint quietly slip?",
        "  - What's the weakest second of it? Fix that, don't average it out.",
        "  - Would this read at a glance on a phone, small and muted?",
        "  - Have I made the obvious version of this brief? If yes, that's a",
        "    reason to throw it away, not to polish it.",
        "",
        "Then fix what you found and look again. Iterate on the piece itself",
        "before it ever reaches me — a round trip to me costs a day, a round",
        "trip to yourself costs minutes.",
        "",
        "Show me the best one or two, NOT everything you made. In the note,",
        "say what you killed and why. Killing things is the job.",
        "=" * 60,
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


# One stem per delivered ratio. The .mp4 and the .png share it, so the
# existing pairing rule files them as one entry carrying both.
FINAL_STEMS = {"final_16x9", "final_9x16", "final_1x1"}


def push_output(project_id: str, path: Path, work: Path, agent_output: str, questions,
                stage: str = "wip"):
    """Returns (entry_id, sheet_attached) — the caller needs to know when a
    video went up without its contact sheet, so a later one can catch up."""
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
        "stage": stage,
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
    return entry_id, bool(sheet) or not is_video


def attach_late_sheets(project_id: str, out_dir: Path, state: dict) -> None:
    """
    Attach contact sheets that showed up after their video.

    collect_outputs skips an image whose video partner exists, on the
    assumption they arrive together. Over a delivery that isn't true —
    the cuts can land one cycle and the sheets the next — and without
    this the sheet is skipped forever and never reaches the site.
    """
    pending = state.get("pending_sheets") or {}
    for stem, entry_id in list(pending.items()):
        sheet = next((out_dir / (stem + e) for e in IMAGE_EXT if (out_dir / (stem + e)).exists()), None)
        if not sheet:
            continue
        try:
            url = upload(sheet, project=project_id, kind="contact_sheet", entry_id=entry_id)
            _api("/api/dailies", method="POST",
                 payload={"project_id": project_id, "id": entry_id, "contact_sheet_url": url})
            log(f"  attached late sheet: {sheet.name} -> {entry_id}")
            pending.pop(stem, None)
        except SystemExit as err:
            log(f"  could not attach {sheet.name}: {err}")
    state["pending_sheets"] = pending


# ── the loop ────────────────────────────────────────────────────────


def cycle(args, root: Path, log_state: dict) -> None:
    """
    One pass.

    Unpinned, this follows the queue: the site marks exactly one project
    as current — the oldest still open — and the machine works on that
    and nothing else. Marking it Done on the phone is what releases it to
    the next, which is also what stops it picking up a project whose
    brief isn't written yet.
    """
    data = _api("/api/dailies/projects")
    projects = data.get("projects", [])
    target = args.project or data.get("current_project_id")
    project = next((p for p in projects if p["id"] == target), None) if target else None
    if args.project and project is None:
        raise SystemExit(f"No project '{args.project}'. Create it at {BASE_URL}/dailies")
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
        # Sheets that arrived after their video, before anything new.
        attach_late_sheets(project_id, out_dir, state)
        found = collect_outputs(out_dir, state)
        if not found:
            save_state(work, state)
            if log_state.get("empty_notice") != project_id:
                log(f"  {project_id}: watching {out_dir} — nothing new yet")
                log_state["empty_notice"] = project_id
            return
        log_state.pop("empty_notice", None)
        for path, key in found:
            try:
                entry_id, had_sheet = push_output(
                    project_id, path, out_dir, "", questions,
                    stage="final" if path.stem in FINAL_STEMS else "wip",
                )
                if not had_sheet:
                    state.setdefault("pending_sheets", {})[path.stem] = entry_id
                state.setdefault("pushed", []).append(key)
                log(f"  pushed {path.name} -> {entry_id}")
            except SystemExit as err:
                log(f"  failed to push {path.name}: {err}")
        save_state(work, state)
        return

    sync_project(project, work)

    # ── pitch gate ───────────────────────────────────────────────
    # Nothing is rendered until a concept has been chosen. Producing
    # straight from a brief is what converges on the competent middle.
    #
    # Only for projects that haven't produced anything yet: a project
    # already twenty entries deep is underway, and stopping it to pitch
    # would throw away the direction it's already found.
    if (
        project.get("status") == "active"
        and not project.get("chosen_pitch_id")
        and (project.get("entry_count") or 0) == 0
    ):
        if project.get("pitches"):
            if log_state.get("pitch_notice") != project_id:
                log(f"  {project_id}: {len(project['pitches'])} concepts waiting — pick one on the site")
                log_state["pitch_notice"] = project_id
            return
        log_state.pop("pitch_notice", None)
        log(f"  {project_id}: pitching {PITCH_COUNT} concepts")
        prompt = build_pitch_prompt(project, past_learnings(projects, project_id))
        (work / ".dailies-last-prompt.txt").write_text(prompt, encoding="utf-8")
        run_agent(args.agent_cmd, prompt, work, args.timeout)

        pitch_file = out_dir / "pitches.json"
        if not pitch_file.exists():
            log("  no pitches.json written — will try again next cycle")
            return
        try:
            pitches = json.loads(pitch_file.read_text(encoding="utf-8"))
            if not isinstance(pitches, list) or not pitches:
                raise ValueError("expected a non-empty array")
        except (ValueError, OSError) as err:
            log(f"  pitches.json unreadable ({err}) — leaving it for next cycle")
            return
        _api("/api/dailies/projects", method="POST",
             payload={"id": project_id, "pitches": pitches})
        pitch_file.unlink()
        log(f"  {project_id}: {len(pitches)} concepts posted — pick one at {BASE_URL}/dailies/{project_id}")
        return

    log_state.pop("pitch_notice", None)
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

    prompt = build_prompt(project, feedback, work, past_learnings(projects, project_id))
    (work / ".dailies-last-prompt.txt").write_text(prompt, encoding="utf-8")
    output = run_agent(args.agent_cmd, prompt, work, args.timeout)

    # Only mark feedback as handled once the agent has actually seen it,
    # so a crash mid-cycle replays it instead of dropping it.
    if feedback:
        state["last_feedback_at"] = feedback[-1]["submitted_at"]

    # final_learnings.md is a document, not a piece: it belongs on the
    # project so later runs can read it, not in the media grid.
    learnings_file = out_dir / "final_learnings.md"
    if learnings_file.exists():
        text = learnings_file.read_text(encoding="utf-8", errors="replace").strip()
        if text and text != (project.get("learnings") or "").strip():
            _api("/api/dailies/projects", method="POST",
                 payload={"id": project_id, "learnings": text})
            log(f"  {project_id}: learnings saved ({len(text)} chars)")

    attach_late_sheets(project_id, out_dir, state)

    pushed_names = []
    for path, key in collect_outputs(out_dir, state):
        try:
            # The named masters go in FINAL; everything else is WIP.
            entry_id, had_sheet = push_output(
                project_id, path, out_dir, output, questions,
                stage="final" if path.stem in FINAL_STEMS else "wip",
            )
            if not had_sheet:
                state.setdefault("pending_sheets", {})[path.stem] = entry_id
            state.setdefault("pushed", []).append(key)
            pushed_names.append(path.name)
            log(f"  pushed {path.name} -> {entry_id}")
        except SystemExit as err:
            log(f"  failed to push {path.name}: {err}")

    # Close the finishing job once all four masters are in, so the queue
    # can move on. Anything short of the full set leaves it open.
    delivery = project.get("delivery") or {}
    if delivery.get("requested_at") and not delivery.get("done_at"):
        # Checked against the files on disk rather than what got pushed:
        # a video whose sheet never arrived would otherwise look complete,
        # since the pair collapses into one entry either way.
        required = [f"{stem}{ext}" for stem in sorted(FINAL_STEMS) for ext in (".mp4", ".png")]
        missing = [name for name in required if not (out_dir / name).exists()]
        # The write-up counts as a deliverable; without it the next
        # project starts blind.
        learnings_in = bool((project.get("learnings") or "").strip()) or learnings_file.exists()
        if not missing and learnings_in:
            _api("/api/dailies/projects", method="POST",
                 payload={"id": project_id, "delivery_done": True})
            log(f"  {project_id}: final deliverables complete")
        else:
            if not learnings_in:
                missing.append("final_learnings.md")
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
