// Writes Brotli and gzip copies of the built text files, so the server can send
// a compressed file straight from disk instead of compressing on every request.
// Runs after `vite build`.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const TEXT = /\.(?:js|mjs|css|html|svg|json|webmanifest|txt|map)$/

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else yield path
  }
}

let before = 0
let after = 0
let count = 0
for (const path of files(dist)) {
  if (!TEXT.test(path)) continue
  const data = readFileSync(path)
  // Tiny files gain nothing and cost a header.
  if (data.length < 1024) continue
  const br = brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } })
  const gz = gzipSync(data, { level: 9 })
  if (br.length < data.length) writeFileSync(`${path}.br`, br)
  if (gz.length < data.length) writeFileSync(`${path}.gz`, gz)
  before += data.length
  after += Math.min(br.length, data.length)
  count++
}
console.log(`compressed ${count} files: ${(before / 1024).toFixed(0)} kB -> ${(after / 1024).toFixed(0)} kB with Brotli`)
