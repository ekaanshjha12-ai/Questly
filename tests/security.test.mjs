import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { makeWorld } from './helpers.mjs'
import { stripImageMetadata } from '../server/imagemeta.js'

/**
 * Hardening: hashed session tokens, per-account login backoff, picture
 * metadata, card designs shown to others, and the moderation queue.
 */

/* --- synthetic pictures ---------------------------------------------------- */

function segment(marker, payload) {
  const head = Buffer.alloc(4)
  head.writeUInt16BE(0xff00 | marker, 0)
  head.writeUInt16BE(payload.length + 2, 2)
  return Buffer.concat([head, payload])
}

/** EXIF with orientation 6 and a GPS tag pointing at a block carrying a marker string. */
function exifPayload() {
  const tiff = Buffer.alloc(64)
  tiff.write('II', 0, 'binary')
  tiff.writeUInt16LE(42, 2)
  tiff.writeUInt32LE(8, 4)
  tiff.writeUInt16LE(2, 8)
  // Orientation, SHORT, 1, value 6
  tiff.writeUInt16LE(0x0112, 10)
  tiff.writeUInt16LE(3, 12)
  tiff.writeUInt32LE(1, 14)
  tiff.writeUInt16LE(6, 18)
  // GPS IFD pointer, LONG, 1, offset 38
  tiff.writeUInt16LE(0x8825, 22)
  tiff.writeUInt16LE(4, 24)
  tiff.writeUInt32LE(1, 26)
  tiff.writeUInt32LE(38, 30)
  tiff.writeUInt32LE(0, 34)
  tiff.write('GPS-51.5007N-0.1246W', 38, 'binary')
  return Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff])
}

function jpegWithMetadata() {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'binary')),
    segment(0xe1, exifPayload()),
    segment(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Camera Owner</x:xmpmeta>', 'binary')),
    segment(0xed, Buffer.from('Photoshop 3.0\0IPTC-City-London', 'binary')),
    segment(0xfe, Buffer.from('secret comment', 'binary')),
    segment(0xdb, Buffer.alloc(65, 1)),
    Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x12, 0x34, 0x56, 0xff, 0xd9]),
  ])
}

function pngChunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'binary')
  return Buffer.concat([head, data, Buffer.alloc(4)])
}

function pngWithMetadata() {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', Buffer.alloc(13, 1)),
    pngChunk('tEXt', Buffer.from('Author\0Someone private', 'binary')),
    pngChunk('eXIf', Buffer.from('GPS-LOCATION', 'binary')),
    pngChunk('IDAT', Buffer.alloc(10, 2)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function webpWithMetadata() {
  const chunk = (type, data) => {
    const head = Buffer.alloc(8)
    head.write(type, 0, 'binary')
    head.writeUInt32LE(data.length, 4)
    return Buffer.concat([head, data, Buffer.alloc(data.length % 2)])
  }
  const vp8x = Buffer.alloc(10)
  vp8x[0] = 0x08 | 0x04
  const body = Buffer.concat([chunk('VP8X', vp8x), chunk('VP8 ', Buffer.alloc(12, 3)), chunk('EXIF', Buffer.from('GPS-LOCATION', 'binary')), chunk('XMP ', Buffer.from('<xmp/>', 'binary'))])
  const head = Buffer.alloc(12)
  head.write('RIFF', 0, 'binary')
  head.writeUInt32LE(4 + body.length, 4)
  head.write('WEBP', 8, 'binary')
  return Buffer.concat([head, body])
}

describe('picture metadata', () => {
  it('strips location, comments and camera data from a JPEG but keeps its orientation', () => {
    const out = stripImageMetadata(jpegWithMetadata(), 'image/jpeg')
    assert.ok(out)
    const text = out.toString('binary')
    for (const leak of ['GPS-51', 'Camera Owner', 'IPTC-City', 'secret comment']) assert.ok(!text.includes(leak), `${leak} should be gone`)
    assert.ok(text.includes('JFIF'), 'JFIF header kept')
    const exifAt = text.indexOf('Exif\0\0')
    assert.ok(exifAt > 0, 'a minimal EXIF block remains for orientation')
    // Orientation value in the minimal block: big-endian SHORT 18 bytes after the TIFF start.
    assert.equal(out.readUInt16BE(exifAt + 6 + 18), 6)
    assert.ok(out.subarray(-3).equals(Buffer.from([0x56, 0xff, 0xd9])), 'image data copied untouched')
  })

  it('strips text and EXIF chunks from PNG and WebP', () => {
    const png = stripImageMetadata(pngWithMetadata(), 'image/png')
    assert.ok(png && !png.toString('binary').includes('Someone private') && !png.toString('binary').includes('GPS-LOCATION'))
    assert.ok(png.toString('binary').includes('IDAT') && png.toString('binary').includes('IEND'))
    const webp = stripImageMetadata(webpWithMetadata(), 'image/webp')
    assert.ok(webp && !webp.toString('binary').includes('GPS-LOCATION') && !webp.toString('binary').includes('<xmp/>'))
    assert.equal(webp.readUInt32LE(4), webp.length - 8, 'RIFF size rewritten')
    assert.equal(webp[20] & 0x0c, 0, 'metadata flags cleared')
  })

  it('refuses a file whose structure cannot be walked', () => {
    assert.equal(stripImageMetadata(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]), 'image/jpeg'), null)
  })
})

describe('hardening', () => {
  const world = makeWorld()
  const legacyToken = randomBytes(32).toString('hex')
  let legacyId
  let author
  let reporter
  let moderator

  before(async () => {
    author = world.seedPlayer({ username: 'poster' })
    reporter = world.seedPlayer({ username: 'watcher' })
    moderator = world.seedPlayer({ username: 'mod', role: 'admin' })
    legacyId = randomUUID()
    // A session written the old way, token in plain text, before the server
    // that hashes them first starts.
    world.seed(`
      db.insertUser({ id: ${JSON.stringify(legacyId)}, email: 'old-session@example.test', passwordHash: '', salt: '', recoveryHash: null, recoverySalt: null }, 'user')
      db.setProfile(${JSON.stringify(legacyId)}, { username: 'oldsession', displayName: 'Old Session', birthdate: '1990-01-01' })
      db.db.run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [${JSON.stringify(legacyToken)}, ${JSON.stringify(legacyId)}, new Date().toISOString(), new Date(Date.now() + 86400000).toISOString()])
    `)
    await world.start()
  })

  after(async () => {
    await world.destroy()
  })

  it('keeps session tokens hashed, and old sessions keep working', async () => {
    const me = await world.client(legacyToken)('GET', '/api/me')
    assert.equal(me.status, 200)
    assert.equal(me.body.user.username, 'oldsession')
    await world.stop()
    const stored = JSON.parse(world.seed(`console.log(JSON.stringify(db.db.all('SELECT token FROM sessions').map((r) => r.token)))`))
    await world.start()
    assert.ok(stored.length >= 4)
    assert.ok(stored.every((t) => t.startsWith('s256:')), 'every stored token is a hash')
    assert.ok(!stored.includes(legacyToken) && !stored.includes(author.token))
    assert.equal((await author.client('GET', '/api/me')).status, 200, 'seeded sessions still sign in')
  })

  it('backs off repeated wrong passwords for one account', async () => {
    const anon = world.client()
    const signup = await anon('POST', '/api/auth/signup', {
      email: 'lockme@example.test', password: 'correct horse battery', name: 'Lock Me', username: 'lockme', birthdate: '1994-04-04', acceptTerms: true,
    })
    assert.equal(signup.status, 201)
    for (let i = 0; i < 5; i += 1) {
      const wrong = await anon('POST', '/api/auth/login', { email: 'lockme@example.test', password: 'wrong password' })
      assert.equal(wrong.status, 401)
    }
    const locked = await anon('POST', '/api/auth/login', { email: 'LockMe@example.test', password: 'correct horse battery' })
    assert.equal(locked.status, 429, 'even the right password waits out the lock')
    assert.equal(locked.body.code, 'login_locked')
    assert.ok(locked.body.retryAfter > 0)
  })

  it('checks card designs before other players see them', async () => {
    const saved = await author.client('PUT', '/api/state', {
      state: {
        onboarded: true,
        player: { name: 'Poster', character: 'female', createdAt: new Date().toISOString() },
        goals: [], schedule: [], decks: [], reports: [], outlook: null, habits: [], habitMarks: {}, moods: {},
        card: {
          background: 'url(javascript:alert(1))',
          items: [
            { id: 'a', kind: 'field', field: 'email', x: 0.5, y: 0.5, scale: 1, rotate: 0 },
            { id: 'b', kind: 'field', field: 'name', x: 99, y: -4, scale: 50, rotate: 900 },
            { id: 'c', kind: 'text', text: 'Hello there', color: 'red; background: url(x)', x: 0.2, y: 0.2, scale: 1, rotate: 0 },
            { id: 'd', kind: 'sticker', emoji: '<img src=x onerror=alert(1)>', x: 0.1, y: 0.1, scale: 1, rotate: 0 },
            { id: 'e', kind: 'script', x: 0, y: 0, scale: 1, rotate: 0 },
          ],
          strokes: [{ color: '#ffffff', size: 999, points: [0, 0, 5000, 5000, 'x', 3] }],
        },
      },
    })
    assert.equal(saved.status, 200)
    const seen = await reporter.client('GET', '/api/users/poster')
    assert.equal(seen.status, 200)
    const card = seen.body.player.card
    assert.equal(card.background, 'rank')
    assert.deepEqual(card.items.map((i) => i.id), ['b', 'c'])
    assert.deepEqual([card.items[0].x, card.items[0].y, card.items[0].scale, card.items[0].rotate], [1, 0, 4, 180])
    assert.equal(card.items[1].color, '#ffffff')
    assert.deepEqual(card.strokes, [{ color: '#ffffff', size: 60, points: [0, 0, 1000, 1400] }])
    // The owner keeps their own private fields.
    const own = await author.client('GET', '/api/state')
    assert.ok(own.body.state.card.items.some((i) => i.field === 'email'))
  })

  it('queues reports for moderators, once, and acts on them server-side', async () => {
    const posted = await author.client('POST', '/api/posts', { kind: 'update', body: 'Finished my first week of study quests' })
    assert.equal(posted.status, 201)
    const postId = posted.body.post.id

    assert.equal((await reporter.client('POST', `/api/posts/${postId}/report`, { reason: 'spam' })).status, 200)
    assert.equal((await reporter.client('POST', `/api/posts/${postId}/report`, { reason: 'spam again' })).status, 200)

    assert.equal((await reporter.client('GET', '/api/admin/reports')).status, 404, 'not for ordinary accounts')

    const queue = await moderator.client('GET', '/api/admin/reports')
    assert.equal(queue.status, 200)
    const mine = queue.body.reports.filter((r) => r.targetId === postId)
    assert.equal(mine.length, 1, 'a second report from the same person does not queue twice')
    assert.equal(mine[0].snapshot.body, 'Finished my first week of study quests')

    const bad = await moderator.client('POST', `/api/admin/reports/${mine[0].id}/resolve`, { outcome: 'actioned' })
    assert.equal(bad.status, 400, 'acting needs an action')

    const done = await moderator.client('POST', `/api/admin/reports/${mine[0].id}/resolve`, { outcome: 'actioned', removePost: true, note: 'spam link' })
    assert.equal(done.status, 200)
    assert.equal(done.body.report.status, 'actioned')
    assert.equal(done.body.report.action, 'post_removed')

    const again = await moderator.client('POST', `/api/admin/reports/${mine[0].id}/resolve`, { outcome: 'dismissed' })
    assert.equal(again.status, 409)

    const feed = await reporter.client('GET', '/api/feed')
    assert.ok(!feed.body.posts.some((p) => p.id === postId), 'the post is gone from the feed')
    const notes = await reporter.client('GET', '/api/notifications')
    assert.ok(notes.body.notifications.some((n) => n.title === 'Your report was reviewed'))
  })
})

// A server of its own: the suite above spends most of a minute's sign-in allowance.
describe('recovery and failure', () => {
  const world = makeWorld()
  const url = (path) => `http://127.0.0.1:${world.port}${path}`

  before(async () => {
    await world.start()
  })

  after(async () => {
    await world.destroy()
  })

  it('spends a recovery code once, signs every device out and issues the next', async () => {
    const anon = world.client()
    const email = 'forgetful@example.test'
    const signup = await anon('POST', '/api/auth/signup', {
      email, password: 'correct horse battery', name: 'Forgetful', username: 'forgetful', birthdate: '1994-04-04', acceptTerms: true,
    })
    assert.equal(signup.status, 201)
    const first = signup.body.recoveryCode

    const login = await fetch(url('/api/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'correct horse battery' }) })
    const device = world.client(login.headers.get('set-cookie').match(/questly_session=([^;]+)/)[1])
    assert.equal((await device('GET', '/api/me')).status, 200)

    const reset = await anon('POST', '/api/auth/reset', { email, code: first.toLowerCase(), password: 'a brand new passphrase' })
    assert.equal(reset.status, 200, 'case and dashes do not matter')
    assert.match(reset.body.recoveryCode, /^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/)
    assert.notEqual(reset.body.recoveryCode, first)
    assert.equal((await device('GET', '/api/me')).status, 401, 'the device signed in before the reset is signed out')

    const replay = await anon('POST', '/api/auth/reset', { email, code: first, password: 'somebody elses passphrase' })
    assert.equal(replay.status, 401, 'the spent code opens nothing')
    assert.equal((await anon('POST', '/api/auth/login', { email, password: 'somebody elses passphrase' })).status, 401)

    const again = await anon('POST', '/api/auth/reset', { email, code: reset.body.recoveryCode, password: 'and another passphrase' })
    assert.equal(again.status, 200, 'the new code works, once')
    assert.equal((await anon('POST', '/api/auth/login', { email, password: 'and another passphrase' })).status, 200)
  })

  it('answers a malformed request in JSON, without the server’s insides', async () => {
    for (const path of ['/api/users/%E0%A4%A', '/api/clubs/%ZZ', '/api/posts/%E0%A4%A/comments']) {
      const res = await fetch(url(path))
      const text = await res.text()
      assert.equal(res.status, 400, path)
      assert.match(res.headers.get('content-type') ?? '', /application\/json/, path)
      assert.doesNotMatch(text, /URIError|node_modules|at \w+ \(|[\\/]server[\\/]/, `${path} gives away nothing`)
    }
    const garbled = await fetch(url('/api/auth/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email": ' })
    assert.equal(garbled.status, 400)
    assert.deepEqual(await garbled.json(), { error: 'That request could not be read.' })
    const huge = await fetch(url('/api/support'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'x'.repeat(300_000) }) })
    assert.equal(huge.status, 413)
  })
})
