# Motion Dailies — machine API

Private review portal. One human reviewer (the browser, password-gated) and
one machine client (the render PC, Bearer-key-gated).

Base URL: `https://xoxo.studio`

| What | Method + path | Auth |
| --- | --- | --- |
| Push a daily | `POST /api/dailies` | `Authorization: Bearer <API key>` |
| Pull feedback | `GET /api/feedback?since=YYYY-MM-DD` | `Authorization: Bearer <API key>` |
| Get an upload ticket | `POST /api/dailies/upload-url` | Bearer (machine) **or** session cookie (browser) |
| List dailies | `GET /api/dailies` | session cookie |
| Submit feedback | `POST /api/feedback` | session cookie |
| Log in / out | `POST` / `DELETE /api/dailies/login` | password in body |

The portal page is `https://xoxo.studio/dailies`. It is not linked from
anywhere on the site and carries `robots: noindex, nofollow`.

---

## Why uploads are two-phase

Vercel caps a serverless request body at **4.5 MB**. A daily is 10–60 MB, so
the file can never travel through `POST /api/dailies`. Blob's own multipart
API doesn't rescue this either — its parts must be **at least 5 MB**, which is
larger than the body limit, so proxying is impossible in both directions.

The PC therefore uploads **straight to Vercel Blob** using a short-lived,
path-scoped token that `/api/dailies/upload-url` mints. The API key never
leaves the PC, the token expires in an hour, and it can only write to the one
path it was issued for.

```
1. POST /api/dailies/upload-url   →  ticket (URL + headers, valid 1 h)
2. PUT  <ticket.put_url>          →  the bytes; response body has .url
3. POST /api/dailies              →  metadata + those .url values
```

---

## 1. Get an upload ticket

```http
POST /api/dailies/upload-url
Authorization: Bearer <API key>
Content-Type: application/json

{ "date": "2026-08-04", "kind": "video", "filename": "loop05.mp4", "content_type": "video/mp4" }
```

`kind` is `"video"` or `"contact_sheet"` for the machine. (The browser uses
`"reference"` with its session cookie; the machine cannot request that kind,
and the browser cannot request the machine's kinds.)

Response:

```json
{
  "put_url": "https://blob.vercel-storage.com/?pathname=media%2Fdailies%2F2026-08-04%2Fvideo.mp4",
  "method": "PUT",
  "headers": {
    "authorization": "Bearer vercel_blob_client_...",
    "x-api-version": "12",
    "x-content-type": "video/mp4",
    "x-vercel-blob-access": "public"
  },
  "pathname": "media/dailies/2026-08-04/video.mp4",
  "expires_in_seconds": 3600,
  "read_public_url_from": "PUT response body .url"
}
```

## 2. PUT the bytes

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

The JSON response contains `url` — the public, permanent URL of the file.
Keep it for step 3.

## 3. POST the daily

```http
POST /api/dailies
Authorization: Bearer <API key>
Content-Type: application/json

{
  "date": "2026-08-04",
  "title": "Kinetic Type — Loop 05",
  "note": "Overnight pass. Three colourway alts on the sheet.",
  "video_url": "https://<store>.public.blob.vercel-storage.com/media/dailies/2026-08-04/video.mp4",
  "contact_sheet_url": "https://<store>.public.blob.vercel-storage.com/media/dailies/2026-08-04/contact.png",
  "questions": [
    { "id": "direction", "prompt": "Which direction should I push?", "type": "choice",
      "options": ["A — warm", "B — mono", "C — high contrast"] },
    { "id": "energy", "prompt": "Energy level", "type": "scale" },
    { "id": "jarring", "prompt": "Anything jarring?", "type": "text" }
  ]
}
```

`date` is the record's identity — re-POSTing the same date **updates** it.
Every other field is optional on an update: omit `note` and the stored note
survives, so the PC can correct one field without re-uploading 60 MB.

`type` is `choice` | `scale` | `text`. A `choice` question must carry a
non-empty `options` array (400 otherwise). `scale` is always 1–5.

Response: `{ "success": true, "created": true, "daily": { ... } }`

---

## 4. Pull feedback

```http
GET /api/feedback?since=2026-08-01
Authorization: Bearer <API key>
```

`since` is inclusive and filters on **submission date**, not the daily's date —
so re-reviewed older dailies still come back. Returns a bare JSON array:

```json
[
  {
    "date": "2026-08-04",
    "answers": { "direction": "B — mono", "energy": 4, "jarring": "the wipe at 0:03" },
    "brief": "Push the mono further. Kill the drop shadow.",
    "reference_images": [
      "https://<store>.public.blob.vercel-storage.com/media/dailies/refs/mood-RpwCpUt791ev.png"
    ],
    "render_master": true,
    "submitted_at": "2026-08-04T09:12:44.108Z"
  }
]
```

`answers` is keyed by the `id` of each question the PC sent. Scale answers are
numbers, choice and text answers are strings. Unanswered questions are absent.
Answers whose key doesn't match a question on that daily are dropped on write.

`reference_images` are plain public URLs — `GET` them with no auth. They carry
a random suffix so they aren't guessable.

`render_master` is the yes/no toggle: `true` means kick off the full-quality
render.

---

## Client

`scripts/dailies_push.py` does all three upload steps and the feedback pull.
Standard library only — no pip install.

```bash
export DAILIES_API_KEY=...

python3 scripts/dailies_push.py push \
  --date 2026-08-04 \
  --title "Kinetic Type — Loop 05" \
  --note "Overnight pass." \
  --video out/loop05.mp4 \
  --sheet out/loop05_contact.png \
  --questions questions.json

python3 scripts/dailies_push.py pull --since 2026-08-01 --download-refs ./refs
```

## Rotating credentials

Set `DAILIES_API_KEY` and/or `DAILIES_PASSWORD` in the Vercel project's
environment variables. When set, they take precedence over the stored hashes
and the old credential stops working immediately.

Only SHA-256 hashes are stored server-side (`state/dailies-auth.json`) — the
Blob store is public with guessable paths, so no secret is ever written there.
