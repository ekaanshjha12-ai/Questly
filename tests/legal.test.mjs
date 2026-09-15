import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { makeWorld } from './helpers.mjs'

/**
 * Terms, privacy, guidelines and safety: readable by anyone, filled in from
 * the environment, versioned when edited, accepted at sign-up and again after a
 * material change. Contact & support from inside and outside an account. And
 * the retention sweep that erases what is past its time.
 */

describe('legal, support and retention', () => {
  const world = makeWorld()
  let player
  let admin
  let owner
  const old = (days) => new Date(Date.now() - days * 86_400_000).toISOString()
  const saved = {}

  before(async () => {
    for (const [key, value] of Object.entries({ QUESTLY_OPERATOR_NAME: 'Questly Test Ltd', QUESTLY_CONTACT_EMAIL: 'help@questly.test' })) {
      saved[key] = process.env[key]
      process.env[key] = value
    }
    player = world.seedPlayer({ username: 'reader' })
    admin = world.seedPlayer({ username: 'moderator', role: 'admin' })
    owner = world.seedPlayer({ username: 'founder', role: 'superadmin' })
    // Things past their time, and one that is not yet allowed to go.
    world.seed(`
      const p = ${JSON.stringify(player.id)}
      db.db.run("INSERT INTO post_images (id, user_id, mime, data, created_at) VALUES ('img-old', ?, 'image/jpeg', 'AAAA', ?)", [p, ${JSON.stringify(old(40))}])
      db.db.run("INSERT INTO posts (id, user_id, kind, body, image_id, created_at, deleted_at) VALUES ('post-old', ?, 'update', 'Old deleted post', 'img-old', ?, ?)", [p, ${JSON.stringify(old(45))}, ${JSON.stringify(old(40))}])
      db.db.run("INSERT INTO posts (id, user_id, kind, body, created_at, deleted_at) VALUES ('post-recent', ?, 'update', 'Deleted yesterday', ?, ?)", [p, ${JSON.stringify(old(3))}, ${JSON.stringify(old(1))}])
      db.db.run("INSERT INTO posts (id, user_id, kind, body, created_at) VALUES ('post-live', ?, 'update', 'Still here', ?)", [p, ${JSON.stringify(old(50))}])
      db.db.run("INSERT INTO audit_log (at, user_id, email, event, outcome, ip) VALUES (?, ?, 'reader@example.test', 'auth.login', 'success', '203.0.113.9')", [${JSON.stringify(old(200))}, p])
      db.db.run("INSERT INTO audit_log (at, user_id, email, event, outcome, ip) VALUES (?, ?, 'reader@example.test', 'auth.login', 'success', '203.0.113.9')", [${JSON.stringify(old(10))}, p])
      // Reports and support requests are created by their modules when the server starts.
    `)
    await world.start()
    await world.stop()
    world.seed(`
      const p = ${JSON.stringify(player.id)}
      // Seeded after the first start: it must still be here when the sweep meets its open report.
      db.db.run("INSERT INTO posts (id, user_id, kind, body, created_at, deleted_at) VALUES ('post-reported', ?, 'update', 'Deleted but reported', ?, ?)", [p, ${JSON.stringify(old(45))}, ${JSON.stringify(old(40))}])
      db.db.run("INSERT INTO post_comments (id, post_id, user_id, body, created_at, deleted_at) VALUES ('comment-old', 'post-live', ?, 'Old deleted comment', ?, ?)", [p, ${JSON.stringify(old(45))}, ${JSON.stringify(old(40))}])
      db.db.run("INSERT INTO reports (id, reporter_id, target_kind, target_id, target_user_id, status, created_at) VALUES ('report-open', ?, 'post', 'post-reported', ?, 'open', ?)", [${JSON.stringify(admin.id)}, p, ${JSON.stringify(old(41))}])
      db.db.run("INSERT INTO reports (id, reporter_id, target_kind, target_id, status, created_at, resolved_at) VALUES ('report-closed-old', ?, 'player', 'x', 'dismissed', ?, ?)", [${JSON.stringify(admin.id)}, ${JSON.stringify(old(420))}, ${JSON.stringify(old(400))}])
      db.db.run("INSERT INTO support_requests (id, user_id, kind, body, status, created_at, closed_at) VALUES ('support-old', ?, 'other', 'An old question that was answered', 'closed', ?, ?)", [p, ${JSON.stringify(old(420))}, ${JSON.stringify(old(400))}])
    `)
    await world.start()
  })

  after(async () => {
    await world.destroy()
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('lets anyone read the documents, filled in for this deployment', async () => {
    const anon = world.client()
    const list = await anon('GET', '/api/policies')
    assert.equal(list.status, 200)
    assert.deepEqual(list.body.policies.map((p) => p.slug), ['terms', 'privacy', 'guidelines', 'safety'])
    assert.deepEqual(list.body.contact, { operator: 'Questly Test Ltd', email: 'help@questly.test' })

    const terms = await anon('GET', '/api/policies/terms')
    assert.equal(terms.status, 200)
    assert.match(terms.body.policy.body, /between you and Questly Test Ltd/)
    assert.match(terms.body.policy.body, /help@questly\.test/)
    assert.ok(!terms.body.policy.body.includes('{{'), 'no placeholder is left showing')
    const headings = [...terms.body.policy.body.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1]))
    assert.deepEqual(headings, headings.map((_, i) => i + 1), 'sections are numbered without gaps')

    const privacy = await anon('GET', '/api/policies/privacy')
    assert.match(privacy.body.policy.body, /erased after 30 days/)
    assert.match(privacy.body.policy.body, /kept for 180 days/)

    assert.equal((await anon('GET', '/api/policies/cookies')).status, 404)
  })

  it('needs the terms agreed to at sign-up, and records it', async () => {
    const anon = world.client()
    const form = { email: 'newbie@example.test', password: 'correct horse battery', name: 'Newbie', username: 'newbie', birthdate: '2001-02-03' }
    const refused = await anon('POST', '/api/auth/signup', form)
    assert.equal(refused.status, 400)
    assert.equal(refused.body.code, 'terms_required')
    const made = await anon('POST', '/api/auth/signup', { ...form, acceptTerms: true })
    assert.equal(made.status, 201)
    assert.deepEqual(made.body.user.policyUpdates, [])

    // An account from before the terms existed is asked once.
    const me = await player.client('GET', '/api/me')
    assert.deepEqual(me.body.user.policyUpdates.map((p) => p.slug), ['terms', 'privacy'])
    const accepted = await player.client('POST', '/api/policies/accept')
    assert.deepEqual(accepted.body.pending, [])
    assert.deepEqual((await player.client('GET', '/api/me')).body.user.policyUpdates, [])
  })

  it('versions edits, asks again only after a material change, and keeps editing to the superadmin', async () => {
    const view = await admin.client('GET', '/api/admin/policies')
    assert.equal(view.status, 200)
    assert.equal(view.body.canEdit, false)
    const terms = view.body.policies.find((p) => p.slug === 'terms')
    assert.equal(terms.fromFile, true)

    assert.equal((await player.client('GET', '/api/admin/policies')).status, 404, 'not for players')
    assert.equal((await admin.client('PUT', '/api/admin/policies/terms', { title: 'Terms', body: terms.body })).status, 404, 'admins cannot edit')

    const typo = await owner.client('PUT', '/api/admin/policies/privacy', { title: 'Privacy Policy', body: `${view.body.policies.find((p) => p.slug === 'privacy').body}\n\nA small clarification.` })
    assert.equal(typo.status, 200)
    assert.deepEqual((await player.client('GET', '/api/me')).body.user.policyUpdates, [], 'a small edit asks nobody to accept again')

    const unchanged = await owner.client('PUT', '/api/admin/policies/terms', { title: terms.title, body: terms.body })
    assert.equal(unchanged.status, 400)
    const material = await owner.client('PUT', '/api/admin/policies/terms', { title: terms.title, body: `${terms.body}\n\n## New section\n\nSomething important changed.`, material: true, note: 'New section' })
    assert.equal(material.status, 200)
    const edited = material.body.policies.find((p) => p.slug === 'terms')
    assert.equal(edited.version, 2)
    assert.equal(edited.fromFile, false)
    assert.equal(edited.history[0].by, 'founder@example.test')
    assert.equal(edited.history[0].note, 'New section')

    assert.deepEqual((await player.client('GET', '/api/me')).body.user.policyUpdates.map((p) => p.slug), ['terms'])
    const readable = await world.client()('GET', '/api/policies/terms')
    assert.match(readable.body.policy.body, /Something important changed/)
    await player.client('POST', '/api/policies/accept')
    assert.deepEqual((await player.client('GET', '/api/me')).body.user.policyUpdates, [])

    const reset = await owner.client('POST', '/api/admin/policies/terms/reset')
    assert.equal(reset.status, 200)
    assert.equal(reset.body.policies.find((p) => p.slug === 'terms').fromFile, true)
    assert.equal((await owner.client('POST', '/api/admin/policies/terms/reset')).status, 400, 'already the default')
  })

  it('takes support requests from players and from people who cannot sign in, and answers them', async () => {
    const anon = world.client()
    const noEmail = await anon('POST', '/api/support', { kind: 'account', body: 'I lost my recovery code and cannot get in.' })
    assert.equal(noEmail.status, 400)
    const outside = await anon('POST', '/api/support', { kind: 'account', body: 'I lost my recovery code and cannot get in.', contact: 'Locked.Out@example.test' })
    assert.equal(outside.status, 201)
    assert.equal((await anon('POST', '/api/support', { kind: 'nonsense', body: 'Hello there, this is a test', contact: 'a@example.test' })).status, 400)

    const inside = await player.client('POST', '/api/support', { kind: 'problem', body: 'The quest board did not load this morning.', page: '/quests?x=1' })
    assert.equal(inside.status, 201)
    const mine = await player.client('GET', '/api/support/mine')
    assert.equal(mine.body.requests.length, 1)
    assert.equal(mine.body.requests[0].page, null, 'only a plain path is kept')

    assert.equal((await player.client('GET', '/api/admin/support')).status, 404)
    const queue = await admin.client('GET', '/api/admin/support')
    assert.equal(queue.status, 200)
    const fromOutside = queue.body.requests.find((r) => r.id === outside.body.id)
    assert.equal(fromOutside.contact, 'locked.out@example.test')
    assert.equal(fromOutside.from, null)

    assert.equal((await admin.client('POST', `/api/admin/support/${outside.body.id}/close`, { reply: 'Hi!' })).status, 400, 'no account to reply to')
    assert.equal((await admin.client('POST', `/api/admin/support/${outside.body.id}/close`, {})).status, 200)

    const answered = await admin.client('POST', `/api/admin/support/${inside.body.id}/close`, { reply: 'Thanks — fixed now.' })
    assert.equal(answered.status, 200)
    assert.equal((await admin.client('POST', `/api/admin/support/${inside.body.id}/close`, {})).status, 409)
    const notes = await player.client('GET', '/api/notifications')
    assert.ok(notes.body.notifications.some((n) => n.title === 'The Questly team replied' && n.body === 'Thanks — fixed now.'))
    assert.equal((await player.client('GET', '/api/support/mine')).body.requests[0].reply, 'Thanks — fixed now.')
  })

  it('erases what is past its time and keeps what is not', async () => {
    await world.stop()
    const counts = JSON.parse(
      world.seed(`
        const one = (sql, args = []) => db.db.get(sql, args)?.n ?? 0
        console.log(JSON.stringify({
          oldPost: one("SELECT COUNT(*) AS n FROM posts WHERE id = 'post-old'"),
          oldImage: one("SELECT COUNT(*) AS n FROM post_images WHERE id = 'img-old'"),
          reportedPost: one("SELECT COUNT(*) AS n FROM posts WHERE id = 'post-reported'"),
          recentPost: one("SELECT COUNT(*) AS n FROM posts WHERE id = 'post-recent'"),
          livePost: one("SELECT COUNT(*) AS n FROM posts WHERE id = 'post-live'"),
          oldComment: one("SELECT COUNT(*) AS n FROM post_comments WHERE id = 'comment-old'"),
          oldAudit: one("SELECT COUNT(*) AS n FROM audit_log WHERE at < ?", [${JSON.stringify(old(180))}]),
          recentAudit: one("SELECT COUNT(*) AS n FROM audit_log WHERE event = 'auth.login' AND at > ?", [${JSON.stringify(old(30))}]),
          oldReport: one("SELECT COUNT(*) AS n FROM reports WHERE id = 'report-closed-old'"),
          openReport: one("SELECT COUNT(*) AS n FROM reports WHERE id = 'report-open'"),
          oldSupport: one("SELECT COUNT(*) AS n FROM support_requests WHERE id = 'support-old'"),
        }))
      `),
    )
    await world.start()
    assert.deepEqual(counts, {
      oldPost: 0,
      oldImage: 0,
      reportedPost: 1,
      recentPost: 1,
      livePost: 1,
      oldComment: 0,
      oldAudit: 0,
      recentAudit: 1,
      oldReport: 0,
      openReport: 1,
      oldSupport: 0,
    })
  })
})
