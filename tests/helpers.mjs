/**
 * Test harness: a real Questly server on a throwaway database.
 *
 * Each suite gets its own data directory and port. Anything that has to be in
 * the database before the server runs — accounts, sessions, old-style saved
 * progress, a challenge that has already ended — is written by a seed script
 * run in a separate process while the server is stopped, because the SQLite
 * driver does not share a file safely between two live processes.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomBytes, randomUUID } from 'node:crypto'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DB_URL = pathToFileURL(join(ROOT, 'server', 'db.js')).href

let nextPort = 5600 + Math.floor(Math.random() * 300)

export function makeWorld() {
  const dataDir = mkdtempSync(join(tmpdir(), 'questly-test-'))
  const port = nextPort++
  let child = null
  let logs = ''

  /** Runs `body` (a string of ES module code with `db` in scope) against the database. */
  function seed(body) {
    const file = join(dataDir, `seed-${randomUUID()}.mjs`)
    writeFileSync(file, `import * as db from ${JSON.stringify(DB_URL)}\n${body}\n`)
    const out = spawnSync(process.execPath, [file], {
      cwd: ROOT,
      env: { ...process.env, DATA_DIR: dataDir, ANTHROPIC_API_KEY: '' },
      encoding: 'utf8',
    })
    if (out.status !== 0) throw new Error(`seed failed:\n${out.stderr}\n${out.stdout}`)
    return out.stdout.trim()
  }

  async function start() {
    child = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: { ...process.env, DATA_DIR: dataDir, API_PORT: String(port), NODE_ENV: 'test', ANTHROPIC_API_KEY: '', INVITE_CODE: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (d) => (logs += d))
    child.stderr.on('data', (d) => (logs += d))
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`)
        if (res.ok) return
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 150))
    }
    throw new Error(`server did not start:\n${logs}`)
  }

  async function stop() {
    if (!child) return
    const proc = child
    child = null
    await new Promise((resolveStop) => {
      proc.once('exit', resolveStop)
      proc.kill()
    })
  }

  async function destroy() {
    await stop()
    rmSync(dataDir, { recursive: true, force: true })
  }

  /** An account with a live session, written straight into the database. */
  function seedPlayer({ username, birthdate = '1995-05-05', role = 'user', displayName = null } = {}) {
    const id = randomUUID()
    const token = randomBytes(32).toString('hex')
    const name = username ?? `p${randomBytes(3).toString('hex')}`
    seed(`
      db.insertUser({ id: ${JSON.stringify(id)}, email: ${JSON.stringify(`${name}@example.test`)}, passwordHash: '', salt: '', recoveryHash: null, recoverySalt: null }, ${JSON.stringify(role)})
      db.setProfile(${JSON.stringify(id)}, { username: ${JSON.stringify(name)}, displayName: ${JSON.stringify(displayName ?? name)}, birthdate: ${JSON.stringify(birthdate)} })
      db.insertSession({ token: ${JSON.stringify(token)}, userId: ${JSON.stringify(id)}, expiresAt: new Date(Date.now() + 86400000).toISOString() })
    `)
    return { id, token, username: name, client: client(token) }
  }

  function client(token = null) {
    return async function call(method, path, body, headers = {}) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Cookie: `questly_session=${token}` } : {}),
          'x-timezone': 'Asia/Kolkata',
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
      const text = await res.text()
      let json = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = { raw: text }
      }
      return { status: res.status, body: json }
    }
  }

  return { dataDir, port, seed, start, stop, destroy, seedPlayer, client, logs: () => logs }
}
