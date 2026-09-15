import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { makeWorld } from './helpers.mjs'

/**
 * Clubs: who may found and join, trials judged from the server's records,
 * leaders' powers checked on the server, club challenges with their
 * consequences, Club XP that only moves through things that happened, chat
 * and feed rules, and the platform admin's takedown.
 */

const ROOT = new URL('../server/', import.meta.url).href

describe('clubs', () => {
  const world = makeWorld()
  let founder
  let joiner
  let newcomer
  let outsider
  let admin
  let slug
  let clubId

  const seedFocus = (userId, id, minutes) => `
    db.db.run(
      "INSERT INTO focus_sessions (id, user_id, label, kind, status, started_at, ended_at, active_ms, day) VALUES (?, ?, 'Focus', 'timer', 'completed', ?, ?, ?, '2026-01-01')",
      [${JSON.stringify(id)}, ${JSON.stringify(userId)}, new Date(Date.now() + 1000).toISOString(), new Date(Date.now() + ${minutes} * 60000).toISOString(), ${minutes} * 60000],
    )
  `

  before(async () => {
    founder = world.seedPlayer({ username: 'founder' })
    joiner = world.seedPlayer({ username: 'joiner' })
    newcomer = world.seedPlayer({ username: 'newcomer' })
    outsider = world.seedPlayer({ username: 'outsider' })
    admin = world.seedPlayer({ username: 'overseer', role: 'admin' })
    // The founder has put in enough to found a club.
    world.seed(`
      const { ensureGame } = await import(${JSON.stringify(ROOT + 'game/migrate.js')})
      const { startRewards, transaction } = await import(${JSON.stringify(ROOT + 'game/rewards.js')})
      ensureGame(${JSON.stringify(founder.id)}, 'UTC')
      transaction(() => {
        const rewards = startRewards(${JSON.stringify(founder.id)}, { quiet: true })
        rewards.pay({ source: 'test', sourceId: 'grant', xp: 900, label: 'Test grant' })
        rewards.finish()
      })
    `)
    await world.start()
  })

  after(async () => {
    await world.destroy()
  })

  it('lets a player with some standing found a club, and only a sensible one', async () => {
    const tooNew = await newcomer.client('POST', '/api/clubs', { name: 'Night Owls', description: 'We study late and well.', rules: 'Be kind. Show up.', region: 'scholars_sanctuary' })
    assert.equal(tooNew.status, 409)
    assert.equal(tooNew.body.code, 'level_too_low')

    const badRegion = await founder.client('POST', '/api/clubs', { name: 'Night Owls', description: 'We study late and well.', rules: 'Be kind. Show up.', region: 'the_moon' })
    assert.equal(badRegion.status, 400)

    const created = await founder.client('POST', '/api/clubs', {
      name: 'Night Owls', description: 'We study late and well.', rules: 'Be kind. Show up every week.', region: 'scholars_sanctuary', minLevel: 1, consequence: 'warning', xp: 999999,
    })
    assert.equal(created.status, 201)
    slug = created.body.club.slug
    clubId = created.body.club.id
    assert.equal(slug, 'night-owls')
    assert.equal(created.body.club.members, 1)
    assert.equal(created.body.club.xp, 0, 'Club XP cannot be set by anyone')
    assert.equal(created.body.club.me.role, 'owner')
    assert.equal(created.body.club.permissions.edit, true)

    const dupe = await founder.client('POST', '/api/clubs', { name: 'night owls', description: 'Another one entirely.', rules: 'Rules for this one.', region: 'archive' })
    assert.equal(dupe.status, 409)
  })

  it('judges entry trials from what the player does after starting them', async () => {
    assert.equal((await joiner.client('PUT', `/api/clubs/${slug}/trials`, { trials: [] })).status, 403, 'only the leader sets trials')
    const set = await founder.client('PUT', `/api/clubs/${slug}/trials`, { trials: [{ kind: 'focus_minutes', target: 30 }, { kind: 'quests', target: 1 }] })
    assert.equal(set.status, 200)
    assert.deepEqual(set.body.club.trialsList.map((t) => t.title), ['30 minutes of timed focus', 'Complete 1 quest'])

    const begun = await joiner.client('POST', `/api/clubs/${slug}/trials/begin`)
    assert.equal(begun.status, 200)
    assert.equal(begun.body.club.me.status, 'trial')

    const early = await joiner.client('POST', `/api/clubs/${slug}/trials/complete`)
    assert.equal(early.status, 409)
    assert.equal(early.body.code, 'trials_incomplete')

    const quest = await joiner.client('POST', '/api/quests', { type: 'optional', title: 'Tidy the notes', durationMin: 10 })
    assert.equal((await joiner.client('POST', `/api/quests/${quest.body.quest.id}/complete`)).status, 200)
    await world.stop()
    world.seed(seedFocus(joiner.id, 'trial-focus', 35))
    await world.start()

    const view = await joiner.client('GET', `/api/clubs/${slug}`)
    assert.ok(view.body.club.trialsList.every((t) => t.met))
    const joined = await joiner.client('POST', `/api/clubs/${slug}/trials/complete`)
    assert.equal(joined.status, 200)
    assert.equal(joined.body.club.me.status, 'active')
    assert.equal(joined.body.club.members, 2)
    const notes = await founder.client('GET', '/api/notifications')
    assert.ok(notes.body.notifications.some((n) => n.kind === 'club_joined'))
  })

  it('keeps the level requirement and the leaders’ powers on the server', async () => {
    assert.equal((await founder.client('PATCH', `/api/clubs/${slug}`, { minLevel: 10 })).status, 200)
    const blocked = await newcomer.client('POST', `/api/clubs/${slug}/trials/begin`)
    assert.equal(blocked.status, 409)
    assert.equal(blocked.body.code, 'level_too_low')
    await founder.client('PATCH', `/api/clubs/${slug}`, { minLevel: 1 })

    assert.equal((await joiner.client('PATCH', `/api/clubs/${slug}`, { name: 'Taken Over' })).status, 403)
    assert.equal((await joiner.client('POST', `/api/clubs/${slug}/members/founder/remove`, {})).status, 403)
    assert.equal((await joiner.client('POST', `/api/clubs/${slug}/challenges`, { title: 'Mine now', description: 'Nope', visibility: 'optional', kind: 'checkin', target: 1, durationDays: 3 })).status, 403)
    assert.equal((await founder.client('POST', `/api/clubs/${slug}/leave`)).status, 409, 'the leader cannot walk away from the club')
  })

  it('keeps club chat to members, screened, and moderated by leaders', async () => {
    assert.equal((await outsider.client('GET', `/api/clubs/${slug}/messages`)).status, 403)
    assert.equal((await outsider.client('POST', `/api/clubs/${slug}/messages`, { body: 'let me in' })).status, 403)
    const contact = await joiner.client('POST', `/api/clubs/${slug}/messages`, { body: 'text me on 07700 900123' })
    assert.equal(contact.status, 400)
    const sent = await joiner.client('POST', `/api/clubs/${slug}/messages`, { body: 'Studying chapter four tonight' })
    assert.equal(sent.status, 201)
    const listed = await founder.client('GET', `/api/clubs/${slug}/messages`)
    assert.ok(listed.body.messages.some((m) => m.body === 'Studying chapter four tonight'))
    assert.equal((await founder.client('DELETE', `/api/clubs/${slug}/messages/${sent.body.message.id}`)).status, 204)
    const after = await founder.client('GET', `/api/clubs/${slug}/messages`)
    assert.ok(!after.body.messages.some((m) => m.id === sent.body.message.id))
  })

  it('keeps club posts in the club, and announcements to its leaders', async () => {
    const outside = await outsider.client('POST', '/api/posts', { kind: 'update', body: 'Hello owls', club: slug })
    assert.equal(outside.status, 403)
    const fake = await joiner.client('POST', '/api/posts', { kind: 'announcement', body: 'Everyone out', club: slug })
    assert.equal(fake.status, 403)
    const post = await joiner.client('POST', '/api/posts', { kind: 'progress', body: 'Finished my first week with the owls', club: slug })
    assert.equal(post.status, 201)
    const announcement = await founder.client('POST', '/api/posts', { kind: 'announcement', body: 'Study night on Friday for everyone', club: slug })
    assert.equal(announcement.status, 201)

    const clubFeed = await outsider.client('GET', `/api/clubs/${slug}/feed`)
    assert.deepEqual(clubFeed.body.posts.map((p) => p.kind).sort(), ['announcement', 'progress'])
    const globalFeed = await outsider.client('GET', '/api/feed')
    assert.ok(!globalFeed.body.posts.some((p) => p.id === post.body.post.id), 'club posts stay out of the Adventure Log')
    const notes = await joiner.client('GET', '/api/notifications')
    assert.ok(notes.body.notifications.some((n) => n.kind === 'club_announcement' && n.title === 'Announcement in Night Owls'))
  })

  it('pays Club XP only for what happened, and settles challenges with the club’s consequence', async () => {
    const optional = await founder.client('POST', `/api/clubs/${slug}/challenges`, {
      title: 'Check in once', description: 'Show up one day.', visibility: 'optional', kind: 'checkin', target: 1, durationDays: 3, clubXp: 5000,
    })
    assert.equal(optional.status, 201)
    assert.equal(optional.body.challenge.clubXp, 10, 'the server sets the reward')
    assert.equal((await joiner.client('POST', `/api/clubs/${slug}/challenges/${optional.body.challenge.id}/join`)).status, 200)
    assert.equal((await joiner.client('POST', `/api/clubs/${slug}/challenges/${optional.body.challenge.id}/checkin`)).status, 200)
    assert.equal((await joiner.client('POST', `/api/clubs/${slug}/challenges/${optional.body.challenge.id}/checkin`)).status, 409)

    assert.equal((await founder.client('PATCH', `/api/clubs/${slug}`, { consequence: 'removal' })).status, 200)
    const mandatory = await founder.client('POST', `/api/clubs/${slug}/challenges`, {
      title: 'Weekly focus', description: 'An hour of timed focus.', visibility: 'mandatory', kind: 'focus_minutes', target: 60, durationDays: 7,
    })
    assert.equal(mandatory.status, 201)
    const enrolled = await joiner.client('GET', `/api/clubs/${slug}/challenges`)
    assert.equal(enrolled.body.challenges.find((c) => c.id === mandatory.body.challenge.id).mine.status, 'joined', 'members are in a mandatory challenge from the start')

    // The optional challenge ends first; then the mandatory one.
    await world.stop()
    world.seed(`db.db.run("UPDATE club_challenges SET starts_at = ?, ends_at = ? WHERE id = ?", [new Date(Date.now() - 4 * 86400000).toISOString(), new Date(Date.now() - 1000).toISOString(), ${JSON.stringify(optional.body.challenge.id)}])`)
    world.seed(seedFocus(joiner.id, 'member-focus', 50))
    await world.start()

    const afterOptional = await joiner.client('GET', `/api/clubs/${slug}`)
    // 10 for the challenge, 10 for fifty minutes of focus.
    assert.equal(afterOptional.body.club.me.clubXp, 20)
    const board = await outsider.client('GET', `/api/clubs/${slug}/leaderboard`)
    assert.deepEqual(board.body.leaderboard.map((r) => [r.player.username, r.clubXp]), [['joiner', 20], ['founder', 0]])

    await world.stop()
    world.seed(`db.db.run("UPDATE club_challenges SET ends_at = ? WHERE id = ?", [new Date(Date.now() - 1000).toISOString(), ${JSON.stringify(mandatory.body.challenge.id)}])`)
    await world.start()

    const settled = await founder.client('GET', `/api/clubs/${slug}`)
    assert.equal(settled.body.club.members, 1, 'the member who missed it was removed')
    assert.equal(settled.body.club.me.warnings, 1, 'the leader is warned, never removed')
    const removed = await joiner.client('GET', `/api/clubs/${slug}`)
    assert.equal(removed.body.club.me.status, 'removed')
    const notes = await joiner.client('GET', '/api/notifications')
    assert.ok(notes.body.notifications.some((n) => n.kind === 'club_removed'))

    // The way back is the trials, again.
    const again = await joiner.client('POST', `/api/clubs/${slug}/trials/begin`)
    assert.equal(again.body.club.me.status, 'trial')
    assert.ok(again.body.club.trialsList.every((t) => !t.met), 'old progress does not count')
  })

  it('shows clubs in their region of the world, and lets the platform take one down', async () => {
    const world1 = await outsider.client('GET', '/api/world')
    assert.ok(world1.body.clubs.scholars_sanctuary.some((c) => c.slug === slug))

    assert.equal((await founder.client('POST', `/api/admin/clubs/${clubId}/archive`, { archived: true })).status, 404, 'not for ordinary accounts')
    const takedown = await admin.client('POST', `/api/admin/clubs/${clubId}/archive`, { archived: true })
    assert.equal(takedown.status, 200)
    assert.equal((await outsider.client('GET', `/api/clubs/${slug}`)).status, 404)
    const world2 = await outsider.client('GET', '/api/world')
    assert.ok(!world2.body.clubs.scholars_sanctuary.some((c) => c.slug === slug))
  })
})
