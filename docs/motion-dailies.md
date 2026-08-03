# Motion Dailies — machine API

Private review portal. One human reviewer (the browser, password-gated) and
one machine client (the render PC, Bearer-key-gated).

Base URL: `https://xoxo.studio`

Work is organised by **project**, not by date. An unattended overnight run
produces many entries and several projects can be live at once, so a date
identifies nothing — it's metadata on each entry.

```
Project ── references[]   material the reviewer uploads; the PC builds from it
        ├─ brief          standing direction for the whole project
        ├─ hero           the image that identifies it in the grid
        └─ Entry[]        what the PC produced (video + contact sheet + note)
             └─ Feedback  the reviewer's answer to that entry
```

| What | Method + path | Auth |
| --- | --- | --- |
| Work list | `GET /api/dailies/projects` | either |
| Create/update a project | `POST /api/dailies/projects` | either |
| Delete a project | `DELETE /api/dailies/projects?id=` | session |
| Push an entry | `POST /api/dailies` | Bearer |
| List for the page | `GET /api/dailies[?project=]` | session |
| Delete an entry | `DELETE /api/dailies?id=` | session |
| Pull feedback | `GET /api/feedback[?since=][&project=]` | Bearer |
| Submit feedback | `POST /api/feedback` | session |
| Upload ticket | `POST /api/dailies/upload-url` | either |
| Log in / out | `POST` / `DELETE /api/dailies/login` | password |

Pages: `/dailies` is the project grid, `/dailies/<projectId>` is one project.
Neither is linked from the site and both carry `robots: noindex, nofollow`.

Destructive routes are session-only on purpose — a buggy overnight script
holding the machine key cannot delete anything.

---

## Why uploads are two-phase

Vercel caps a serverless request body at **4.5 MB**. A render is 10–60 MB, so
the file can never travel through `POST /api/dailies`. Blob's own multipart
API doesn't rescue this either — its parts must be **at least 5 MB**, which is
larger than the body limit, so proxying is impossible in both directions.

The PC therefore uploads **straight to Vercel Blob** using a short-lived,
path-scoped token that `/api/dailies/upload-url` mints. The API key never
leaves the PC, the token expires in an hour, and it can only write to the one
path it was issued for.

```
1. mint an entry id locally      (so a retry reuses it instead of duplicating)
2. POST /api/dailies/upload-url  →  ticket (URL + headers, valid 1 h)
3. PUT  <ticket.put_url>         →  the bytes; response body has .url
4. POST /api/dailies             →  metadata + those .url values
```

### Which credential may upload what

| kind | who | lands at |
| --- | --- | --- |
| `video` | machine | `media/dailies/<project>/entries/<entry>/video.mp4` |
| `contact_sheet` | machine | `media/dailies/<project>/entries/<entry>/contact.png` |
| `reference` | session | `media/dailies/<project>/refs/<name>-<random>.<ext>` |
| `hero` | either | `media/dailies/<project>/hero.<ext>` |

The page can't fake a render and the PC can't write references — references
are input *for* the PC, so it has no business producing them.

---

## 1. Get the work list

```http
GET /api/dailies/projects
Authorization: Bearer <API key>
```

```json
{ "projects": [ {
  "id": "kinetic-type",
  "title": "Kinetic Type",
  "brief": "Type that moves. Mono palette, hard cuts, no drop shadows.",
  "hero_url": "https://…/hero.png?v=1785749256330",
  "references": [
    { "url": "https://…/refs/board-kduF73Ja.png",
      "filename": "board.png", "note": "the wipe timing I want",
      "added_at": "2026-08-03T09:22:13.924Z" }
  ],
  "archived": false,
  "entry_count": 4,
  "latest_entry_at": "2026-08-03T09:21:27.000Z",
  "created_at": "…", "updated_at": "…"
} ] }
```

`brief` plus `references` is the whole input contract: read the words,
download the images, build. `hero_url` falls back to the newest contact sheet
when no hero has been set, so a project always has a face in the grid.

## 2. Get an upload ticket

```http
POST /api/dailies/upload-url
Authorization: Bearer <API key>
Content-Type: application/json

{ "project_id": "kinetic-type",
  "entry_id": "kinetic-type-20260804091244-a7f3",
  "kind": "video", "filename": "loop05.mp4", "content_type": "video/mp4" }
```

`entry_id` is required for `video` and `contact_sheet`, and is minted by the
client so an interrupted upload can be retried onto the same entry rather than
creating a duplicate. Response:

```json
{
  "put_url": "https://blob.vercel-storage.com/?pathname=media%2Fdailies%2F…%2Fvideo.mp4",
  "method": "PUT",
  "headers": {
    "authorization": "Bearer vercel_blob_client_…",
    "x-api-version": "12",
    "x-content-type": "video/mp4",
    "x-vercel-blob-access": "public"
  },
  "pathname": "media/dailies/kinetic-type/entries/…/video.mp4",
  "expires_in_seconds": 3600,
  "read_public_url_from": "PUT response body .url"
}
```

## 3. PUT the bytes

Send the raw file body to `put_url` with exactly the headers returned. No
multipart, no form encoding — the body *is* the file.

```bash
curl -X PUT "$PUT_URL" \
  -H "authorization: $AUTH" \
  -H "x-api-version: 12" \
  -H "x-content-type: video/mp4" \
  -H "x-vercel-blob-access: public" \
  --data-binary @loop05.mp4
```

The JSON response contains `url` — the public, permanent URL. Keep it.

## 4. POST the entry

```http
POST /api/dailies
Authorization: Bearer <API key>
Content-Type: application/json

{
  "project_id": "kinetic-type",
  "id": "kinetic-type-20260804091244-a7f3",
  "date": "2026-08-04",
  "title": "Loop 05",
  "note": "Overnight pass. Three colourway alts on the sheet.",
  "video_url": "https://…/video.mp4",
  "contact_sheet_url": "https://…/contact.png",
  "questions": [
    { "id": "direction", "prompt": "Which direction should I push?", "type": "choice",
      "options": ["A — warm", "B — mono", "C — high contrast"] },
    { "id": "energy", "prompt": "Energy level", "type": "scale" },
    { "id": "jarring", "prompt": "Anything jarring?", "type": "text" }
  ]
}
```

`project_id` must already exist (404 otherwise). `id` is optional — omit it and
the server mints one; supply it to make the call idempotent. `date` defaults to
today and is display metadata only. Re-POSTing the same `id` updates that
entry, and omitted fields keep their stored values, so the PC can correct a
note without re-uploading 60 MB.

`type` is `choice` | `scale` | `text`. A `choice` question must carry a
non-empty `options` array (400 otherwise). `scale` is always 1–5.

Response: `{ "success": true, "created": true, "entry": { … } }`

---

## 5. Pull feedback

```http
GET /api/feedback?since=2026-08-01&project=kinetic-type
Authorization: Bearer <API key>
```

Both params optional. `since` is inclusive and filters on **submission** date,
not the entry's date, so a re-reviewed older entry still comes back. Returns a
bare JSON array:

```json
[
  {
    "entry_id": "kinetic-type-20260804091244-a7f3",
    "project_id": "kinetic-type",
    "entry_title": "Loop 05",
    "date": "2026-08-04",
    "answers": { "direction": "B — mono", "energy": 4, "jarring": "the wipe at 0:03" },
    "brief": "Push the mono further. Kill the drop shadow.",
    "reference_images": ["https://…/refs/mood-RpwCpUt791ev.png"],
    "render_master": true,
    "submitted_at": "2026-08-04T09:12:44.108Z"
  }
]
```

`answers` is keyed by the `id` of each question that entry carried. Scale
answers are numbers; choice and text answers are strings. Unanswered questions
are absent, and any key that doesn't match a question is dropped on write.

`reference_images` are plain public URLs — `GET` them with no auth. They carry
a random suffix so they aren't guessable.

`render_master` is the yes/no toggle: `true` means kick off the full render.

---

## Client

`scripts/dailies_push.py` covers every step. Standard library only.

```bash
export DAILIES_API_KEY=...

python3 scripts/dailies_push.py projects
python3 scripts/dailies_push.py refs --project kinetic-type --into ./refs
python3 scripts/dailies_push.py push --project kinetic-type --title "Loop 05" \
    --note "Overnight pass." --video out/05.mp4 --sheet out/05.png \
    --questions questions.json
python3 scripts/dailies_push.py pull --since 2026-08-01 --download-refs ./feedback-refs
```

`refs` writes `BRIEF.txt` and `NOTES.txt` alongside the downloaded images, so
whatever reads that folder gets the words as well as the pictures.

## Storage consistency

Portal state uses the versioned helpers in `src/lib/blobStore.ts`
(`writeVersionedJson` / `readVersionedJson` / `listVersionedJson`), not plain
`writeJsonBlob`.

Overwriting a blob keeps the same URL, and that URL sits behind a CDN that
serves the previous body for up to a minute — measured directly:
`x-vercel-cache: HIT`, `age: 93` on a blob written seconds earlier. Appending a
`?cb=` query string does **not** help; the CDN ignores the query when keying
its cache. For read-modify-write state that's data loss, not just lag: read
stale → append a reference → write back → the reference added a moment ago is
gone.

The versioned helpers never overwrite. Each write lands on a new pathname
carrying a timestamp, so its URL has nothing cached against it, and readers
find the newest version through `list()` — an API call against the control
plane, which *is* immediately consistent. Superseded versions are pruned after
each write.

## Rotating credentials

Set `DAILIES_API_KEY` and/or `DAILIES_PASSWORD` in the Vercel project's
environment variables. When set, they take precedence over the stored hashes
and the old credential stops working immediately.

Only SHA-256 hashes are stored server-side (`state/dailies-auth.json`) — the
Blob store is public with guessable paths, so no secret is ever written there.

---

## Unattended runs

`scripts/dailies_watch.py` is the loop that connects the phone to the PC.

```bash
export DAILIES_API_KEY=...
python3 scripts/dailies_watch.py --project kinetic-type --dir ~/work/kinetic
```

Each cycle it syncs the brief and references down, pulls any feedback
submitted since last time (with its images), runs the agent in `--dir` with
all of that in the prompt, then uploads anything new in `<dir>/out/`.

Conventions inside the working directory:

| Path | Meaning |
| --- | --- |
| `out/name.mp4` | the piece — becomes an entry |
| `out/name.png` | same stem as a video → that entry's contact sheet |
| `out/name.txt` | same stem → the note shown under it |
| `questions.json` | attached to every entry this project pushes |
| `references/` | written by the watcher; the agent reads it |
| `.dailies-watch.json` | what's been handled — delete to replay everything |
| `.dailies-last-prompt.txt` | exactly what the agent was last told |

Flags: `--once` (single cycle), `--idle-run` (work from the brief even with no
feedback — the overnight mode), `--interval` (seconds, default 300),
`--timeout` (per agent run, default 3600), `--agent-cmd` (defaults to
`claude -p --permission-mode acceptEdits`; override if your install differs).

Feedback is marked handled only after the agent has been given it, so a crash
mid-cycle replays it rather than dropping it. Outputs are fingerprinted by
name, size and mtime, so a file already pushed isn't pushed again.

This runs an agent unattended on instructions typed from a phone. Point
`--dir` at a project directory rather than a home folder, and keep it under
git so every change is visible and reversible.

### The queue

Every project has a status, set from the dropdown on its page:

| Status | Meaning |
| --- | --- |
| `draft` | Not started — the machine ignores it entirely |
| `active` | In progress |
| `done` | Finished |

The machine works on **exactly one project**: the oldest `active` one. Both
`GET /api/dailies` and `GET /api/dailies/projects` report it as
`current_project_id`, with `is_current` on each project.

Marking the current project Done is what advances the queue. `draft` is the
half of it that matters — a finished project hands off to the next *started*
one, never to a project whose brief is still being written. New projects are
created as `draft` for that reason.

Run the watcher without `--project` to follow the queue; each project gets its
own folder under `--dir`. Pass `--project` to ignore the queue and pin to one,
in which case `--dir` is that project's folder directly.

### Publishing to /misc

Marking a project **Done** copies its entries onto `/misc`, tagged
`Generative`. That exact string matters — the Misc page splits its two panels
on it, so a looser label would show up but sort onto the wrong side.

One item per entry: the video if there is one, otherwise the contact sheet.
Pushing both would double up, since the sheet is a working artefact of the
same piece. Oldest first, so the run reads as a progression.

It fires on the transition only, and skips anything already on `/misc` or
tombstoned there. So re-saving a finished project doesn't duplicate it, and an
item you deliberately deleted from Misc doesn't come back if the project is
re-completed. `POST /api/dailies/projects` reports how many were added as
`mirrored_to_misc`.

Prune before you finish: entries deleted from the project never reach Misc,
so an overnight run's rejects can be cleared first.

### Upload-only mode

When the machine is already producing work by itself, `--upload-only` skips
the agent entirely and just publishes what appears:

```bash
python3 scripts/dailies_watch.py --dir ~/state --out ~/renders --upload-only
```

`--out` is the folder the finished files land in; `--dir` only holds the
record of what's been sent. Nothing is run and nothing is downloaded — the
same naming rules apply (`name.mp4` + optional `name.png` + optional
`name.txt`), files already sent are never sent twice, and entries go to
whichever project is currently In progress.
