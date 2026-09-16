import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { makeWorld } from './helpers.mjs'

/**
 * The world map: region locks judged from the player's record, region quests
 * taken once a week, and events whose goals are counted and paid by the server.
 */

describe('world', () => {
  const world = makeWorld()
  let wanderer
  let veteran

  before(async () => {
    wanderer = world.seedPlayer({ username: 'wanderer' })
    veteran = world.seedPlayer({ username: 'veteran' })
    await world.start()
    // Enough XP for level 3 and above, through the ledger like any reward.
    await veteran.client('GET', '/api/game')
    await world.stop()
    world.seed(`
      const { startRewards, transaction } = await import(${JSON.stringify(new URL('../server/game/rewards.js', import.meta.url).href)})
      transaction(() => {
        const rewards = startRewards(${JSON.stringify(veteran.id)}, { quiet: true })
        rewards.pay({ source: 'test', sourceId: 'grant', xp: 600, label: 'Test grant' })
        rewards.finish()
      })
    `)
    await world.start()
  })

  after(async () => {
    await world.destroy()
  })

  it('opens the starting regions and says what the rest need', async () => {
    const { status, body } = await wanderer.client('GET', '/api/world')
    assert.equal(status, 200)
    const byId = Object.fromEntries(body.regions.map((r) => [r.id, r]))
    for (const id of ['focus_sanctum', 'scholars_sanctuary', 'builders_district', 'creators_quarter', 'training_grounds', 'archive']) {
      assert.equal(byId[id].unlocked, true, `${id} is open from the start`)
      assert.equal(byId[id].quests.length, 2)
    }
    assert.equal(byId.digital_workshop.unlocked, false)
    assert.deepEqual(byId.digital_workshop.requirements.map((r) => [r.label, r.met]), [['Reach level 3', false]])
    assert.equal(byId.digital_workshop.quests.length, 0, 'a locked region offers nothing yet')
    assert.deepEqual(byId.elite_region.requirements.map((r) => r.type), ['level', 'elite_quests'])
    assert.ok(body.events.some((e) => e.state === 'active'), 'an event is always running')

    const veteranView = await veteran.client('GET', '/api/world')
    assert.equal(veteranView.body.regions.find((r) => r.id === 'digital_workshop').unlocked, true)
  })

  it('puts a region quest on the board once a week, at the server’s rate', async () => {
    const taken = await wanderer.client('POST', '/api/world/regions/focus_sanctum/quests/vigil')
    assert.equal(taken.status, 201)
    assert.equal(taken.body.quest.origin, 'world')
    assert.equal(taken.body.quest.progress.kind, 'minutes')
    // Ninety minutes is Hard on the one scale: 90 × 1.5 (side) × 1.25.
    assert.equal(taken.body.quest.xp, 170)
    assert.equal(taken.body.quest.difficulty, 'hard')
    assert.ok(taken.body.quest.deadlineAt, 'due by the end of the week')

    const again = await wanderer.client('POST', '/api/world/regions/focus_sanctum/quests/vigil')
    assert.equal(again.status, 409)
    const locked = await wanderer.client('POST', '/api/world/regions/digital_workshop/quests/forge')
    assert.equal(locked.status, 409)
    assert.equal(locked.body.code, 'region_locked')
    assert.equal((await wanderer.client('POST', '/api/world/regions/focus_sanctum/quests/nope')).status, 404)
    assert.equal((await wanderer.client('POST', '/api/world/regions/narnia/quests/vigil')).status, 404)

    const steps = await wanderer.client('POST', '/api/world/regions/archive/quests/chronicle')
    assert.equal(steps.status, 201)
    assert.deepEqual(steps.body.quest.progress.milestones.map((m) => m.title), ['What worked', 'What did not', 'What comes next'])
    const tick = await wanderer.client('POST', `/api/quests/${steps.body.quest.id}/milestones/0`, { done: true })
    assert.equal(tick.status, 200)

    const view = await wanderer.client('GET', '/api/world')
    const offer = view.body.regions.find((r) => r.id === 'focus_sanctum').quests.find((q) => q.key === 'vigil')
    assert.equal(offer.quest.id, taken.body.quest.id, 'the map shows the quest as taken')
  })

  it('pays the running event’s goal once, from what the server counted', async () => {
    const before = await wanderer.client('GET', '/api/world')
    const event = before.body.events.find((e) => e.state === 'active')
    assert.equal(event.completed, false)

    if (event.goal.kind === 'posts') {
      for (let i = 0; i < event.goal.target; i += 1) {
        const post = await wanderer.client('POST', '/api/posts', { kind: 'update', body: `Shared piece number ${i + 1} for the event` })
        assert.equal(post.status, 201)
      }
    } else if (event.goal.kind === 'quests') {
      for (let i = 0; i < event.goal.target; i += 1) {
        const q = await wanderer.client('POST', '/api/quests', { type: 'optional', title: `Event errand ${i + 1}`, durationMin: 5 })
        assert.equal((await wanderer.client('POST', `/api/quests/${q.body.quest.id}/complete`)).status, 200)
      }
    } else {
      await world.stop()
      world.seed(`
        const ended = Date.now() - 60000
        db.db.run(
          "INSERT INTO focus_sessions (id, user_id, label, kind, status, started_at, ended_at, active_ms, day) VALUES ('event-focus', ?, 'Focus', 'timer', 'completed', ?, ?, ?, '2026-01-01')",
          [${JSON.stringify(wanderer.id)}, new Date(ended - ${event.goal.target} * 60000).toISOString(), new Date(ended).toISOString(), ${event.goal.target} * 60000],
        )
      `)
      await world.start()
    }

    const xpBefore = (await wanderer.client('GET', '/api/progress/history?limit=100')).body.entries.filter((e) => e.source === 'event').length
    assert.equal(xpBefore, 0)
    const settled = await wanderer.client('GET', '/api/world')
    const done = settled.body.events.find((e) => e.id === event.id)
    assert.equal(done.completed, true)
    await wanderer.client('GET', '/api/world')
    await wanderer.client('GET', '/api/game')
    const history = await wanderer.client('GET', '/api/progress/history?limit=100')
    const paid = history.body.entries.filter((e) => e.source === 'event')
    assert.equal(paid.length, 1, 'paid exactly once')
    assert.equal(paid[0].xp, event.xp)
    const notes = await wanderer.client('GET', '/api/notifications')
    assert.ok(notes.body.notifications.some((n) => n.kind === 'world_event' && n.title === `Event complete: ${event.title}`))
    assert.equal(notes.body.notifications.filter((n) => n.title === `${event.title} has begun`).length, 1, 'announced once')
  })
})
