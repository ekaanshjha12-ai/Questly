import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { makeWorld } from './helpers.mjs'

/**
 * The admin console's moderation and insight routes: removing posts and
 * comments with the author told, cancelling duels that are still open,
 * searching the security log, the service's health, and product analytics
 * worked out from events and daily activity. None of it for anyone but admins.
 */

describe('admin moderation and insights', () => {
  const world = makeWorld()
  let admin
  let poster
  let friend
  let outsider
  const daysAgo = (n) => new Date(Date.now() - n * 86_400_000)
  const day = (n) => daysAgo(n).toISOString().slice(0, 10)

  before(async () => {
    admin = world.seedPlayer({ username: 'overseer', role: 'admin' })
    poster = world.seedPlayer({ username: 'poster' })
    friend = world.seedPlayer({ username: 'friend' })
    outsider = world.seedPlayer({ username: 'outsider' })
    const now = new Date().toISOString()
    world.seed(`
      const run = (sql, args) => db.db.run(sql, args)
      const poster = ${JSON.stringify(poster.id)}
      const friend = ${JSON.stringify(friend.id)}
      // Two accounts from about three weeks ago, one of which kept coming back.
      for (const id of [poster, friend]) run('UPDATE users SET created_at = ? WHERE id = ?', [${JSON.stringify(daysAgo(20).toISOString())}, id])
      const event = (userId, name, at) => run('INSERT INTO analytics_events (at, day, user_id, event) VALUES (?, ?, ?, ?)', [at, at.slice(0, 10), userId, name])
      for (const name of ['onboarding_completed', 'first_quest', 'first_focus_session', 'challenge_created']) event(poster, name, ${JSON.stringify(daysAgo(20).toISOString())})
      event(friend, 'onboarding_completed', ${JSON.stringify(daysAgo(20).toISOString())})
      for (let i = 0; i < 3; i++) event(poster, 'quest_completed', ${JSON.stringify(now)})
      run('INSERT INTO daily_active (user_id, day) VALUES (?, ?)', [poster, ${JSON.stringify(day(19))}])
      run('INSERT INTO daily_active (user_id, day) VALUES (?, ?)', [poster, ${JSON.stringify(day(10))}])
      const duel = (id, status) => run(
        "INSERT INTO challenges (id, creator_id, opponent_id, name, objective, rules, duration_days, reward_xp, proof, min_checkins, start_mode, status, created_at, expires_at) VALUES (?, ?, ?, 'Morning Pages', 'Write every morning', 'Check in daily', 7, 60, 'optional', 5, 'accept', ?, ?, ?)",
        [id, poster, friend, status, ${JSON.stringify(now)}, ${JSON.stringify(new Date(Date.now() + 86_400_000).toISOString())}],
      )
      duel('duel-open', 'pending')
      duel('duel-done', 'completed')
    `)
    await world.start()
  })

  after(async () => {
    await world.destroy()
  })

  it('keeps every console route to admins', async () => {
    for (const [method, path] of [
      ['GET', '/api/admin/posts'],
      ['POST', '/api/admin/posts/x/remove'],
      ['GET', '/api/admin/comments'],
      ['POST', '/api/admin/comments/x/remove'],
      ['GET', '/api/admin/duels'],
      ['POST', '/api/admin/duels/duel-open/cancel'],
      ['GET', '/api/admin/audit'],
      ['GET', '/api/admin/system'],
      ['GET', '/api/admin/analytics'],
    ]) {
      assert.equal((await outsider.client(method, path, method === 'POST' ? {} : undefined)).status, 404, `${method} ${path}`)
    }
    assert.equal((await world.client()('GET', '/api/admin/system')).status, 401)
  })

  it('removes a post or a comment and tells the author why', async () => {
    const post = (await poster.client('POST', '/api/posts', { kind: 'update', body: 'Selling my old notes, message me' })).body.post
    const comment = (await friend.client('POST', `/api/posts/${post.id}/comments`, { body: 'This is spam and you are rubbish' })).body.comment

    const live = await admin.client('GET', '/api/admin/posts')
    const listed = live.body.posts.find((p) => p.id === post.id)
    assert.equal(listed.author.username, 'poster')
    assert.equal(listed.comments, 1)

    const removed = await admin.client('POST', `/api/admin/posts/${post.id}/remove`, { note: 'selling is not allowed' })
    assert.equal(removed.status, 200)
    assert.equal((await admin.client('POST', `/api/admin/posts/${post.id}/remove`, {})).status, 404, 'already gone')
    assert.ok(!(await outsider.client('GET', '/api/feed')).body.posts.some((p) => p.id === post.id))
    assert.ok((await admin.client('GET', '/api/admin/posts?view=removed')).body.posts.some((p) => p.id === post.id))
    const told = (await poster.client('GET', '/api/notifications')).body.notifications.find((n) => n.title === 'One of your posts was removed')
    assert.ok(told)
    assert.match(told.body, /selling is not allowed/)

    const comments = await admin.client('GET', '/api/admin/comments')
    assert.ok(comments.body.comments.some((c) => c.id === comment.id))
    assert.equal((await admin.client('POST', `/api/admin/comments/${comment.id}/remove`, {})).status, 200)
    assert.ok((await friend.client('GET', '/api/notifications')).body.notifications.some((n) => n.title === 'One of your comments was removed'))
  })

  it('cancels a duel that is still open, and only then', async () => {
    const open = await admin.client('GET', '/api/admin/duels')
    const duel = open.body.duels.find((d) => d.id === 'duel-open')
    assert.equal(duel.status, 'pending')
    assert.equal(duel.cancellable, true)
    assert.ok(!open.body.duels.some((d) => d.id === 'duel-done'), 'finished duels are not in the open list')
    assert.equal((await admin.client('GET', '/api/admin/duels?view=recent')).body.duels.find((d) => d.id === 'duel-done').cancellable, false)

    assert.equal((await admin.client('POST', '/api/admin/duels/duel-done/cancel', {})).status, 409)
    assert.equal((await admin.client('POST', '/api/admin/duels/duel-open/cancel', { note: 'Unsafe terms' })).status, 200)
    assert.equal((await admin.client('POST', '/api/admin/duels/duel-open/cancel', {})).status, 409, 'not twice')
    for (const player of [poster, friend]) {
      const note = (await player.client('GET', '/api/notifications')).body.notifications.find((n) => n.title.includes('was cancelled by the Questly team'))
      assert.equal(note?.body, 'Unsafe terms')
    }
  })

  it('searches the security log', async () => {
    const adminActions = await admin.client('GET', '/api/admin/audit?prefix=admin')
    assert.ok(adminActions.body.entries.length >= 3)
    assert.ok(adminActions.body.entries.every((e) => e.event.startsWith('admin.')))
    assert.ok(adminActions.body.entries.some((e) => e.event === 'admin.remove_post' && e.detail.includes('selling is not allowed')))

    const denied = await admin.client('GET', '/api/admin/audit?event=authz.denied')
    assert.ok(denied.body.entries.length > 0, 'the outsider knocking on admin routes was logged')
    assert.ok(denied.body.entries.every((e) => e.email === 'outsider@example.test'))

    const search = await admin.client('GET', '/api/admin/audit?q=OUTSIDER@example')
    assert.ok(search.body.entries.length > 0)
    const first = await admin.client('GET', '/api/admin/audit?limit=2')
    assert.equal(first.body.entries.length, 2)
    assert.equal(first.body.more, true)
    const next = await admin.client('GET', `/api/admin/audit?limit=2&before=${first.body.entries[1].id}`)
    assert.ok(next.body.entries.every((e) => e.id < first.body.entries[1].id))
    assert.equal((await admin.client('GET', "/api/admin/audit?prefix=x';--")).status, 200, 'odd filters are ignored, not run')
  })

  it('reports the service’s health without naming anyone', async () => {
    const health = await admin.client('GET', '/api/admin/system')
    assert.equal(health.status, 200)
    assert.ok(health.body.requests.lastHour > 0)
    assert.equal(health.body.requests.perMinute.length, 60)
    assert.equal(health.body.records.users, 4)
    assert.equal(health.body.records.duels, 2)
    assert.ok(health.body.storage.databaseBytes > 0)
    assert.equal(typeof health.body.features.ai, 'boolean')
    assert.equal(health.body.retention.deletedContentDays, 30)
    assert.ok(health.body.retention.lastSweep?.at)
    assert.ok(!JSON.stringify(health.body).includes('@example.test'), 'no email addresses in the health report')
  })

  it('works out the funnel, retention and trends from what happened', async () => {
    const res = await admin.client('GET', '/api/admin/analytics?force=1')
    assert.equal(res.status, 200)
    const step = (key) => res.body.funnel.find((s) => s.key === key).count
    assert.equal(step('signup'), 4)
    assert.equal(step('onboarding'), 2)
    assert.equal(step('first_quest'), 1)
    assert.equal(step('first_focus'), 1)
    // Both older accounts came back today, if only to read about their removed post and cancelled duel.
    assert.equal(step('returned'), 2)
    assert.equal(step('social'), 1)

    const [newest, cohort] = res.body.retention.cohorts
    assert.equal(res.body.retention.cohorts.length, 2)
    assert.equal(cohort.size, 2, 'the two older accounts form one weekly cohort')
    assert.ok(newest.windows.every((w) => w.rate === null), 'accounts made today have nothing to measure yet')
    const windows = Object.fromEntries(cohort.windows.map((w) => [w.key, w]))
    assert.equal(windows.d1.rate, 50)
    assert.equal(windows.w1.rate, 50)
    assert.equal(windows.w2.rate, 50)
    assert.equal(windows.w4.rate, null, 'week four has not happened yet for them')

    const quests = res.body.trends.find((t) => t.event === 'quest_completed')
    assert.equal(quests.total, 3)
    assert.equal(quests.series.length, 30)
    assert.ok(!JSON.stringify(res.body).includes('@example.test'), 'analytics carry no email addresses')
  })
})
