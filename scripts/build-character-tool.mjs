#!/usr/bin/env node
/**
 * Bundles the character animator into the app.
 *
 * The tool is a self-contained HTML page, and it stays that way: what
 * ships is the same artefact you can open from disk, so there is no
 * second implementation to drift from the one being tested.
 *
 * It is base64'd into a .ts module rather than dropped in public/ for
 * two reasons. A file in public/ is served straight off the CDN with
 * nothing in front of it, so anyone who guessed the name could open it;
 * coming through a route means the session check runs first. And the
 * page contains both backticks and ${ } inside its own JavaScript, so
 * embedding it as a template literal would mean escaping the source —
 * base64 has nothing to escape.
 *
 * Unlike the logo tuner, the readable source is committed
 * (tools/character/character.html) and this regenerates the blob from
 * it. Edit the HTML, run this, commit both.
 *
 *   node scripts/build-character-tool.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(root, 'tools/character/character.html')
const OUT = resolve(root, 'src/app/api/character-tool/tool.ts')

const html = readFileSync(SRC, 'utf8')
const b64 = Buffer.from(html, 'utf8').toString('base64')

// One long literal rather than a concatenation: a multi-thousand-term
// `+` chain overflows the ESLint parser's stack, which is a confusing
// way to find out about a build artefact.
const out = `/* GENERATED — do not edit.
 * Source: tools/character/character.html
 * Rebuild: node scripts/build-character-tool.mjs
 */
export const CHARACTER_TOOL_B64 =
  '${b64}'
`

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, out)

const kb = (n) => (n / 1024).toFixed(1) + 'KB'
console.log(`character tool: ${kb(html.length)} source -> ${kb(b64.length)} base64`)
console.log(`wrote ${OUT.replace(root + '/', '')}`)
