# Send to Look — phone Shortcut + Pinterest bookmarklet

Two ways to push media onto the /look moodboard from outside the admin
panel. Both talk to `/api/look-share`, which authenticates each request
against `SITE_PASSCODE` (no gate cookie needed).

## iOS Shortcut (Instagram / any image)

1. Shortcuts app → new shortcut → name it **Send to Look**
2. ⓘ → enable **Show in Share Sheet** → types: **Images**
3. One action — **Get Contents of URL**:
   - URL: `https://xoxo.studio/api/look-share`
   - Method **POST** → Request Body **Form**
   - fields: `token` = the site passcode · `file` = Shortcut Input
     (field type *File*) · optional `credit` = `Instagram`

Usage: screenshot/save the post → share the image → **Send to Look**.

## Pinterest video bookmarklet (desktop Chrome)

Make a bookmark named **Send to Look** whose URL is the one-liner
below. Usage: open a video pin's own page (logged in), click the
bookmark, wait for "✓ Sent to Look". The video file is downloaded into
the site's own storage and plays natively on /look.

v2 — normalizes JSON-escaped URLs (`\/`, `/`), scans page HTML +
script tags + video elements + the performance resource log, prefers
720p MP4, and reports HLS-only pins distinctly so the matcher can be
extended when one appears.

```
javascript:(async()=>{try{const parts=[document.documentElement.outerHTML];document.querySelectorAll('script').forEach(s=>{if(s.textContent)parts.push(s.textContent)});document.querySelectorAll('video').forEach(v=>{if(v.currentSrc)parts.push(v.currentSrc);if(v.src)parts.push(v.src)});performance.getEntriesByType('resource').forEach(e=>parts.push(e.name));const text=parts.join('\n').replace(/\\u002F/gi,'/').replace(/\\\//g,'/');const mp4s=text.match(/https:\/\/v\.pinimg\.com[^"'\s\\<>]+?\.mp4[^"'\s\\<>]*/g)||[];const uniq=Array.from(new Set(mp4s));const pick=uniq.find(u=>u.includes('720p'))||uniq[0];if(!pick){const hls=(text.match(/https:\/\/v\.pinimg\.com[^"'\s\\<>]+?\.m3u8[^"'\s\\<>]*/g)||[])[0];alert(hls?'Streaming-only (HLS) pin - send Jordan this URL + the pin link:\n'+hls:'No video found - make sure the video is playing on screen, then try again.');return}const r=await fetch('https://xoxo.studio/api/look-share',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({token:'3432',mediaUrl:pick,link:location.href,credit:'Pinterest'})});const d=await r.json();alert(d.success?'✓ Sent to Look':'Failed: '+(d.error||r.status))}catch(e){alert('Failed: '+e)}})();
```
