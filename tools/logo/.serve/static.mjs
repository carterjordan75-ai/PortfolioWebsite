// Serves tools/logo over http so the tuner can be opened and driven in a
// browser on its own — the /logo route carries the studio password gate,
// which is right for the site and only in the way when the thing being
// checked is this file.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
const ROOT = new URL('..', import.meta.url).pathname
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png' }
import { writeFile, mkdir } from 'node:fs/promises'
createServer(async (req, res) => {
  // Dev-only: the page can hand back a rendered frame (PNG bytes) to
  // .serve/out/<name> — used to build contact sheets from the browser.
  if (req.method === 'POST' && req.url.startsWith('/__save')) {
    const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'frame.png').replace(/[^a-zA-Z0-9._-]/g, '_')
    const chunks = []; for await (const c of req) chunks.push(c)
    await mkdir(join(ROOT, '.serve/out'), { recursive: true })
    await writeFile(join(ROOT, '.serve/out', name), Buffer.concat(chunks))
    res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('saved ' + name)
  }
  const p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '')
  const file = join(ROOT, p === '/' ? 'logo.html' : p)
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404).end('not found') }
}).listen(5177, () => console.log('logo tuner on http://localhost:5177'))
