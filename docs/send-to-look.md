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

v3 — matches the real CDN host (v1.pinimg.com etc.), normalizes
JSON-escaped URLs, scans page HTML + script tags + video elements +
the performance resource log. Direct MP4s import as-is; modern CMAF
pins send their HLS master playlist to the server, which stitches the
fMP4 segments into one playable file (video-only — Pinterest streams
audio as a separate track that cannot be merged without ffmpeg, so
imported pin videos are silent; the /look grid autoplays muted anyway).
Tip: let the video play a few seconds before clicking.

```
javascript:(async()=>{try{const parts=[document.documentElement.outerHTML];document.querySelectorAll('script').forEach(s=>{if(s.textContent)parts.push(s.textContent)});document.querySelectorAll('video').forEach(v=>{if(v.currentSrc)parts.push(v.currentSrc);if(v.src)parts.push(v.src)});performance.getEntriesByType('resource').forEach(e=>parts.push(e.name));const text=parts.join('\n').replace(/\\u002F/gi,'/').replace(/\\\//g,'/');const post=async(payload,okMsg)=>{const r=await fetch('https://xoxo.studio/api/look-share',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(Object.assign({token:'3432',link:location.href,credit:'Pinterest'},payload))});const d=await r.json();alert(d.success?okMsg:'Failed: '+(d.error||r.status))};const mp4s=text.match(/https:\/\/v\d*\.pinimg\.com[^"'\s\\<>]+?\.mp4[^"'\s\\<>]*/g)||[];if(mp4s.length){const u=Array.from(new Set(mp4s));await post({mediaUrl:u.find(x=>x.includes('720p'))||u[0]},'✓ Sent to Look');return}let m=(text.match(/https:\/\/v\d*\.pinimg\.com[^"'\s\\<>]+?\.m3u8[^"'\s\\<>]*/g)||[]).map(u=>u.split('?')[0]);(text.match(/https:\/\/v\d*\.pinimg\.com[^"'\s\\<>]+?\.(?:cmfv|cmfa|ts|m4s)[^"'\s\\<>]*/g)||[]).forEach(u=>{const b=u.split('?')[0].replace(/_(?:audio|\d+w)[^/]*\.(?:cmfv|cmfa|ts|m4s)$/,'.m3u8');if(b.endsWith('.m3u8'))m.push(b)});m=Array.from(new Set(m)).filter(u=>!/_audio/.test(u));const master=m.find(u=>!/_\d+w\./.test(u))||m[0];if(master){await post({hlsUrl:master},'✓ Sent to Look (video will be silent)');return}alert('No video found - play the video for a few seconds, then try again.')}catch(e){alert('Failed: '+e)}})();
```
