import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { makeWorld } from './helpers.mjs'

/**
 * The Adventure Log: appreciation and comments with the same limits, filters
 * and blocks as everything else people write; posts that carry a quest, duel,
 * achievement or focus session only when the server's records back it; and
 * reports that keep what was said, for comments and whole conversations.
 */

const ROOT = new URL('../server/', import.meta.url).href

describe('adventure log', () => {
  const world = makeWorld()
  let ana
  let ben
  let cy
  let dee
  let eve
  let fay
  let moderator
  let postId

  before(async () => {
    ana = world.seedPlayer({ username: 'ana', displayName: 'Ana' })
    ben = world.seedPlayer({ username: 'ben', displayName: 'Ben' })
    cy = world.seedPlayer({ username: 'cy' })
    dee = world.seedPlayer({ username: 'dee' })
    eve = world.seedPlayer({ username: 'eve' })
    fay = world.seedPlayer({ username: 'fay' })
    moderator = world.seedPlayer({ username: 'warden', role: 'admin' })
    const now = new Date().toISOString()
    world.seed(`
      const { ensureGame } = await import(${JSON.stringify(ROOT + 'game/migrate.js')})
      const { startRewards, transaction } = await import(${JSON.stringify(ROOT + 'game/rewards.js')})
      const ana = ${JSON.stringify(ana.id)}
      const ben = ${JSON.stringify(ben.id)}
      const now = ${JSON.stringify(now)}
      ensureGame(ana, 'UTC')
      transaction(() => {
        const rewards = startRewards(ana, { quiet: true })
        rewards.pay({ source: 'test', sourceId: 'grant', xp: 900, label: 'Test grant' })
        rewards.finish()
      })
      const quest = (id, userId, status) => db.db.run(
        "INSERT INTO quests (id, user_id, type, origin, title, xp_reward, rarity, status, created_at, updated_at, completed_at, verified_by) VALUES (?, ?, 'side', 'user', 'Read three chapters', 60, 'rare', ?, ?, ?, ?, 'self')",
        [id, userId, status, now, now, status === 'completed' ? now : null],
      )
      quest('q-ana-done', ana, 'completed')
      quest('q-ana-open', ana, 'active')
      quest('q-ben-done', ben, 'completed')
      const focus = (id, userId, status, minutes) => db.db.run(
        "INSERT INTO focus_sessions (id, user_id, label, kind, status, started_at, ended_at, active_ms, day) VALUES (?, ?, 'Deep work', 'timer', ?, ?, ?, ?, '2026-01-01')",
        [id, userId, status, now, now, minutes * 60000],
      )
      focus('f-long', ana, 'completed', 30)
      focus('f-short', ana, 'ended', 3)
      db.db.run("INSERT INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, 'first_quest', ?)", [ana, now])
      db.db.run(
        "INSERT INTO challenges (id, creator_id, opponent_id, name, objective, rules, duration_days, reward_xp, proof, min_checkins, start_mode, status, created_at, expires_at, completed_at, creator_reward, opponent_reward) VALUES ('duel-1', ?, ?, 'Morning Pages', 'Write every morning', 'Check in daily', 5, 40, 'checkin', 4, 'now', 'completed', ?, ?, ?, 40, 0)",
        [ana, ben, now, now, now],
      )
    `)
    await world.start()
  })

  after(async () => {
    await world.destroy()
  })

  it('lets others appreciate a post, once each, and tells the author', async () => {
    const posted = await ana.client('POST', '/api/posts', { kind: 'update', body: 'Shipped the first page of my portfolio' })
    assert.equal(posted.status, 201)
    postId = posted.body.post.id
    assert.deepEqual(posted.body.post.appreciations, { count: 0, mine: false })
    assert.equal(posted.body.post.comments, 0)

    const own = await ana.client('POST', `/api/posts/${postId}/appreciate`, { on: true })
    assert.equal(own.status, 400, 'not your own post')

    const first = await ben.client('POST', `/api/posts/${postId}/appreciate`, { on: true })
    assert.equal(first.status, 200)
    assert.deepEqual(first.body.appreciations, { count: 1, mine: true })
    const twice = await ben.client('POST', `/api/posts/${postId}/appreciate`, { on: true })
    assert.deepEqual(twice.body.appreciations, { count: 1, mine: true }, 'appreciating again changes nothing')
    await dee.client('POST', `/api/posts/${postId}/appreciate`, {})

    const seen = await eve.client('GET', `/api/posts/${postId}`)
    assert.equal(seen.status, 200)
    assert.deepEqual(seen.body.post.appreciations, { count: 2, mine: false })

    const notes = await ana.client('GET', '/api/notifications')
    const nods = notes.body.notifications.filter((n) => n.kind === 'post_appreciated')
    assert.equal(nods.length, 1, 'one notice for the post, updated rather than repeated')
    assert.match(nods[0].title, /and 1 other appreciated your post/)

    const undone = await ben.client('POST', `/api/posts/${postId}/appreciate`, { on: false })
    assert.deepEqual(undone.body.appreciations, { count: 1, mine: false })

    assert.equal((await ben.client('POST', '/api/posts/not-a-post/appreciate', {})).status, 404)
  })

  it('takes comments through the filters and lets the right people remove them', async () => {
    const empty = await ben.client('POST', `/api/posts/${postId}/comments`, { body: '   ' })
    assert.equal(empty.status, 400)
    const long = await ben.client('POST', `/api/posts/${postId}/comments`, { body: 'a'.repeat(501) })
    assert.equal(long.status, 400)
    const threat = await ben.client('POST', `/api/posts/${postId}/comments`, { body: 'I will kill you' })
    assert.equal(threat.status, 400)
    const contact = await ben.client('POST', `/api/posts/${postId}/comments`, { body: 'nice, email me at ben.writes@gmail.com' })
    assert.equal(contact.status, 400)
    assert.equal(contact.body.code, 'unsafe')
    const age = await ben.client('POST', `/api/posts/${postId}/comments`, { body: 'cool! how old are you?' })
    assert.equal(age.status, 400)

    const good = await ben.client('POST', `/api/posts/${postId}/comments`, { body: 'This looks great, the colours work' })
    assert.equal(good.status, 201)
    assert.equal(good.body.comments, 1)
    const benComment = good.body.comment
    assert.equal(benComment.author.username, 'ben')
    assert.equal(benComment.mine, true)
    const deeComment = (await dee.client('POST', `/api/posts/${postId}/comments`, { body: 'Well done!' })).body.comment
    const anaReply = (await ana.client('POST', `/api/posts/${postId}/comments`, { body: 'Thank you both' })).body.comment

    const listed = await eve.client('GET', `/api/posts/${postId}/comments`)
    assert.equal(listed.status, 200)
    assert.deepEqual(listed.body.comments.map((c) => c.body), ['This looks great, the colours work', 'Well done!', 'Thank you both'])
    assert.ok(listed.body.comments.every((c) => !c.canDelete), 'a bystander can remove nothing')

    const notes = await ana.client('GET', '/api/notifications')
    assert.equal(notes.body.notifications.filter((n) => n.kind === 'post_comment').length, 1, 'comment notices collapse per post')
    assert.equal(notes.body.notifications.find((n) => n.kind === 'post_comment').link, `/social/post/${postId}`)

    assert.equal((await eve.client('DELETE', `/api/posts/${postId}/comments/${benComment.id}`)).status, 403)
    assert.equal((await dee.client('DELETE', `/api/posts/${postId}/comments/${anaReply.id}`)).status, 403)
    assert.equal((await ben.client('DELETE', `/api/posts/other-post/comments/${benComment.id}`)).status, 404, 'the comment must belong to that post')
    assert.equal((await ben.client('DELETE', `/api/posts/${postId}/comments/${benComment.id}`)).status, 204, 'your own comment')
    assert.equal((await ana.client('DELETE', `/api/posts/${postId}/comments/${deeComment.id}`)).status, 204, 'a comment on your own post')

    const after = await eve.client('GET', `/api/posts/${postId}`)
    assert.equal(after.body.post.comments, 1)
  })

  it('limits how fast one player can comment', async () => {
    const posted = await ben.client('POST', '/api/posts', { kind: 'progress', body: 'Day twelve of my reading streak' })
    const id = posted.body.post.id
    for (let i = 0; i < 20; i++) {
      const res = await fay.client('POST', `/api/posts/${id}/comments`, { body: `Keep going, day ${i + 13} next` })
      assert.equal(res.status, 201)
    }
    const over = await fay.client('POST', `/api/posts/${id}/comments`, { body: 'One more for luck' })
    assert.equal(over.status, 429)
  })

  it('hides posts and comments across a block', async () => {
    const posted = await cy.client('POST', '/api/posts', { kind: 'learned', body: 'Learned how binary search really works' })
    const id = posted.body.post.id
    await eve.client('POST', `/api/posts/${id}/comments`, { body: 'Nice explanation' })
    await ben.client('POST', `/api/posts/${id}/comments`, { body: 'Same, it finally clicked for me' })

    assert.equal((await cy.client('POST', '/api/users/eve/block')).status, 200)
    for (const [method, path, body] of [
      ['GET', `/api/posts/${id}`],
      ['POST', `/api/posts/${id}/appreciate`, { on: true }],
      ['GET', `/api/posts/${id}/comments`],
      ['POST', `/api/posts/${id}/comments`, { body: 'Hello again' }],
    ]) {
      assert.equal((await eve.client(method, path, body)).status, 404, `${method} ${path} after a block`)
    }
    const seen = await cy.client('GET', `/api/posts/${id}/comments`)
    assert.deepEqual(seen.body.comments.map((c) => c.author.username), ['ben'], 'the blocked player’s comment is out of sight')
  })

  it('keeps club posts to club members', async () => {
    const club = await ana.client('POST', '/api/clubs', { name: 'Portfolio Guild', description: 'Designers building their first portfolio.', rules: 'Be kind. Post weekly.', region: 'creators_quarter', minLevel: 1, consequence: 'warning' })
    assert.equal(club.status, 201)
    const posted = await ana.client('POST', '/api/posts', { kind: 'update', body: 'Critique night is on Thursday', club: club.body.club.slug })
    assert.equal(posted.status, 201)
    const id = posted.body.post.id
    assert.equal(posted.body.post.canRespond, true)
    assert.equal((await ben.client('GET', `/api/posts/${id}`)).body.post.canRespond, false, 'an outsider is told they cannot answer')
    assert.equal((await ben.client('POST', `/api/posts/${id}/comments`, { body: 'Can I come?' })).status, 403)
    assert.equal((await ben.client('POST', `/api/posts/${id}/appreciate`, { on: true })).status, 403)
    assert.equal((await ana.client('POST', `/api/posts/${id}/comments`, { body: 'Bring two pieces' })).status, 201)
  })

  it('attaches only what the server can vouch for, once', async () => {
    const quest = await ana.client('POST', '/api/posts', { kind: 'achievement', body: 'Done with my reading quest', ref: { kind: 'quest', id: 'q-ana-done' } })
    assert.equal(quest.status, 201)
    assert.equal(quest.body.post.ref.kind, 'quest')
    assert.equal(quest.body.post.ref.title, 'Read three chapters')
    assert.equal(quest.body.post.ref.xp, 60)
    assert.equal(quest.body.post.ref.rarity, 'rare')

    const again = await ana.client('POST', '/api/posts', { kind: 'achievement', body: 'Posting it twice', ref: { kind: 'quest', id: 'q-ana-done' } })
    assert.equal(again.status, 409)
    assert.equal(again.body.code, 'already_shared')

    const refused = [
      [{ kind: 'quest', id: 'q-ben-done' }, 'someone else’s quest'],
      [{ kind: 'quest', id: 'q-ana-open' }, 'an unfinished quest'],
      [{ kind: 'focus', id: 'f-short' }, 'a three-minute session'],
      [{ kind: 'achievement', id: 'quests_100' }, 'a locked achievement'],
      [{ kind: 'wallet', id: 'x' }, 'an unknown kind'],
    ]
    for (const [ref, what] of refused) {
      const res = await ana.client('POST', '/api/posts', { kind: 'progress', body: 'Look at this', ref })
      assert.equal(res.status, 400, what)
    }
    const theirs = await eve.client('POST', '/api/posts', { kind: 'progress', body: 'Look at this', ref: { kind: 'duel', id: 'duel-1' } })
    assert.equal(theirs.status, 400, 'a duel you were not in')

    const duel = await ben.client('POST', '/api/posts', { kind: 'progress', body: 'Ana beat me this time', ref: { kind: 'duel', id: 'duel-1' } })
    assert.equal(duel.status, 201)
    assert.equal(duel.body.post.ref.result, 'failed')
    assert.equal(duel.body.post.ref.opponent, 'Ana')

    // A client cannot dress up what it attaches: the numbers come from the session itself.
    const focus = await ana.client('POST', '/api/posts', { kind: 'progress', body: 'Half an hour, no phone', ref: { kind: 'focus', id: 'f-long', minutes: 900, completed: false } })
    assert.equal(focus.status, 201)
    assert.equal(focus.body.post.ref.minutes, 30)
    assert.equal(focus.body.post.ref.completed, true)

    const badge = await ana.client('POST', '/api/posts', { kind: 'achievement', body: 'My first badge', ref: { kind: 'achievement', id: 'first_quest' } })
    assert.equal(badge.status, 201)
    assert.equal(badge.body.post.ref.title, 'First Steps')

    const feed = await ana.client('GET', '/api/feed')
    assert.deepEqual([...feed.body.shared].sort(), ['achievement:first_quest', 'focus:f-long', 'quest:q-ana-done'], 'the feed says what has been shared already')
    assert.equal((await ben.client('GET', '/api/feed')).body.shared.includes('quest:q-ana-done'), false, 'and only your own')

  })

  it('queues comment reports and lets a moderator remove the comment', async () => {
    const posted = await ben.client('POST', '/api/posts', { kind: 'update', body: 'Asked for feedback on my essay' })
    const id = posted.body.post.id
    const rude = (await eve.client('POST', `/api/posts/${id}/comments`, { body: 'This is boring and so are you' })).body.comment

    assert.equal((await eve.client('POST', `/api/comments/${rude.id}/report`, { reason: 'test' })).status, 404, 'not your own comment')
    assert.equal((await ben.client('POST', `/api/comments/${rude.id}/report`, { reason: 'rude' })).status, 200)

    const queue = await moderator.client('GET', '/api/admin/reports')
    const report = queue.body.reports.find((r) => r.kind === 'comment' && r.targetId === rude.id)
    assert.ok(report)
    assert.equal(report.snapshot.body, 'This is boring and so are you')
    assert.equal(report.snapshot.author, 'eve')

    const wrong = await moderator.client('POST', `/api/admin/reports/${report.id}/resolve`, { outcome: 'actioned', removePost: true })
    assert.equal(wrong.status, 400, 'a comment report cannot take a post down')
    const done = await moderator.client('POST', `/api/admin/reports/${report.id}/resolve`, { outcome: 'actioned', removeComment: true })
    assert.equal(done.status, 200)
    assert.equal(done.body.report.action, 'comment_removed')

    const listed = await ben.client('GET', `/api/posts/${id}/comments`)
    assert.equal(listed.body.comments.length, 0)
  })

  it('reports a conversation with what the other person wrote, and only by someone in it', async () => {
    const started = await dee.client('POST', '/api/messages/start', { username: 'ana', body: 'Hi Ana, loved your portfolio post' })
    assert.equal(started.status, 201)
    const conversationId = started.body.conversation.id
    await dee.client('POST', `/api/messages/${conversationId}`, { body: 'Can you review mine?' })
    await ana.client('POST', `/api/messages/${conversationId}`, { body: 'Sure, send it over here' })

    assert.equal((await eve.client('POST', `/api/messages/${conversationId}/report`, { reason: 'nosy' })).status, 404, 'an outsider cannot touch the conversation')

    // Blocking first does not stop the report.
    assert.equal((await ana.client('POST', '/api/users/dee/block')).status, 200)
    assert.equal((await ana.client('POST', `/api/messages/${conversationId}/report`, { reason: 'pushy' })).status, 200)

    const queue = await moderator.client('GET', '/api/admin/reports')
    const report = queue.body.reports.find((r) => r.kind === 'message' && r.targetId === conversationId)
    assert.ok(report)
    assert.equal(report.snapshot.username, 'dee')
    assert.deepEqual(report.snapshot.messages.map((m) => m.body), ['Hi Ana, loved your portfolio post', 'Can you review mine?'], 'only the reported person’s messages')
    assert.equal(report.target.username, 'dee')
  })
})
