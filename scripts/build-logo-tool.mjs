#!/usr/bin/env node
/**
 * Bundles the logo tuner into the app.
 *
 * The tuner used to exist only as the base64 string in tuner.ts, with no
 * readable source anywhere — every change meant editing a blob. The
 * source now lives at tools/logo/logo.html and this regenerates the
 * blob from it. Edit the HTML, run this, commit both.
 *
 * Base64 rather than a template literal because the page contains both
 * backticks and ${ } inside its own JavaScript, and rather than public/
 * because a file there is served straight off the CDN with nothing in
 * front of it — coming through a route means the session check runs
 * first.
 *
 *   node scripts/build-logo-tool.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(root, 'tools/logo/logo.html')
const OUT = resolve(root, 'src/app/api/logo-tool/tuner.ts')

const html = readFileSync(SRC, 'utf8')
const b64 = Buffer.from(html, 'utf8').toString('base64')

// One long literal, not a concatenation: a multi-thousand-term `+`
// chain overflows the ESLint parser's stack.
writeFileSync(OUT, `/* GENERATED — do not edit.
 * Source: tools/logo/logo.html
 * Rebuild: node scripts/build-logo-tool.mjs
 */
export const LOGO_TOOL_B64 =
  '${b64}'
`)

const kb = n => (n / 1024).toFixed(1) + 'KB'
console.log(`logo tuner: ${kb(html.length)} source -> ${kb(b64.length)} base64`)
console.log(`wrote ${OUT.replace(root + '/', '')}`)
