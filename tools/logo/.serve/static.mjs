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
createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '')
  const file = join(ROOT, p === '/' ? 'logo.html' : p)
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404).end('not found') }
}).listen(5177, () => console.log('logo tuner on http://localhost:5177'))
