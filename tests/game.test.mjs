import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { makeWorld } from './helpers.mjs'

/**
 * Server-authoritative progression: quests, focus sessions, rewards, caps,
 * inventory, notifications, migration and access control.
 */

describe('progression', () => {
  const world = makeWorld()
  let alice
  let bob
  let legacy
  let admin
  let planner
  let newcomer
  let carol
  let dave
  // What Alice has earned once her first daily quest is paid; its size comes from its wording.
  let paidSoFar = 0

  before(async () => {
    alice = world.seedPlayer({ username: 'alice' })
    planner = world.seedPlayer({ username: 'planner' })
    carol = world.seedPlayer({ username: 'carol' })
    dave = world.seedPlayer({ username: 'dave' })
    // Saved goals from onboarding, and nothing earned yet.
    newcomer = world.seedPlayer({ username: 'newcomer' })
    world.seed(`
      db.putState(${JSON.stringify(newcomer.id)}, JSON.stringify({
        onboarded: true,
        player: { name: 'Newcomer', character: 'female', createdAt: new Date().toISOString() },
        goals: [{ id: 'goal-n', title: 'Learn to draw', category: 'creative', createdAt: new Date().toISOString(), archived: false }],
      }))
    `)
    bob = world.seedPlayer({ username: 'bob' })
    admin = world.seedPlayer({ username: 'warden', role: 'admin' })
    legacy = world.seedPlayer({ username: 'veteran' })
    // An account from before the server kept progress: everything in its document.
    world.seed(`
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
      db.putState(${JSON.stringify(legacy.id)}, JSON.stringify({
        onboarded: true,
        player: { name: 'Veteran', character: 'male', xp: 2500, coins: 700, createdAt: '2026-01-01T00:00:00.000Z' },
        goals: [{ id: 'goal-1', title: 'Learn chemistry', category: 'learning', createdAt: '2026-01-01T00:00:00.000Z', archived: false }],
        quests: [
          { id: 'goal-1-daily-' + today + '-0', goalId: 'goal-1', period: 'daily', periodKey: today, title: 'Study chemistry', xp: 15, completed: true, completedAt: new Date().toISOString(), verifiedBy: 'photo', verifiedAt: new Date().toISOString() },
          { id: 'goal-1-daily-2026-01-02-0', goalId: 'goal-1', period: 'daily', periodKey: '2026-01-02', title: 'Old quest', xp: 15, completed: false, completedAt: null },
        ],
        todos: [
          { id: 'todo-1', title: 'Buy notebook', done: true, createdAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-02T00:00:00.000Z' },
          { id: 'todo-2', title: 'Clean desk', done: false, createdAt: '2026-01-01T00:00:00.000Z', completedAt: null },
        ],
        schedule: [],
        sessions: [{ id: 'sess-1', kind: 'timer', label: 'Deep work', goalId: 'goal-1', durationMs: 3900000, targetMs: 3600000, completed: true, startedAt: '2026-01-03T10:00:00.000Z', endedAt: '2026-01-03T11:05:00.000Z' }],
        streak: { current: 4, longest: 9, lastCompletedDay: today },
        unlockedAchievements: { first_quest: '2026-01-02T00:00:00.000Z', streak_7: '2026-01-09T00:00:00.000Z' },
        decks: [], reports: [], outlook: null,
        collection: { unlocked: ['red-plumed-warrior'], active: 'red-plumed-warrior' },
        progression: { level: 5, proofs: 1 },
        habits: [], habitMarks: {}, moods: {}, card: null, challengeRewards: [],
      }))
    `)
    // A duel between alice and bob that ended yesterday: alice checked in
    // enough, bob did not.
    world.seed(`
      const now = Date.now()
      const day = 86400000
      db.insertChallenge({
        id: 'duel-1', creatorId: ${JSON.stringify(alice.id)}, opponentId: ${JSON.stringify(bob.id)},
        name: 'Three Days of Deep Work', objective: 'Focus every day', rules: 'Check in daily',
        durationDays: 3, rewardXp: 100, proof: 'optional', minCheckins: 2, startMode: 'accept',
        createdAt: new Date(now - 5 * day).toISOString(), expiresAt: new Date(now - 4 * day).toISOString(), startsAt: null, endsAt: null,
      })
      db.transitionChallenge('duel-1', 'pending', {
        status: 'accepted', responded_at: new Date(now - 4 * day).toISOString(),
        starts_at: new Date(now - 4 * day).toISOString(), ends_at: new Date(now - day).toISOString(),
      })
      db.insertCheckin('duel-1', ${JSON.stringify(alice.id)}, 0, 'Done')
      db.insertCheckin('duel-1', ${JSON.stringify(alice.id)}, 1, 'Done again')
      db.insertCheckin('duel-1', ${JSON.stringify(bob.id)}, 0, 'Once')
    `)
    // A focus duel that ended yesterday: 30 minutes a day on 2 of 3 days.
    // Carol's timed focus reaches it on two days; Dave's on one, and a check-in
    // note from Dave counts for nothing in a focus duel.
    world.seed(`
      const now = Date.now()
      const day = 86400000
      const start = now - 4 * day
      db.insertChallenge({
        id: 'duel-focus', creatorId: ${JSON.stringify(dave.id)}, opponentId: ${JSON.stringify(carol.id)},
        name: 'Deep Work Duel', objective: 'Focus 30 minutes a day', rules: 'Timed focus only',
        durationDays: 3, rewardXp: 150, proof: 'optional', minCheckins: 2, startMode: 'accept', mode: 'focus', dailyMinutes: 30,
        createdAt: new Date(start - day).toISOString(), expiresAt: new Date(start).toISOString(), startsAt: null, endsAt: null,
      })
      db.transitionChallenge('duel-focus', 'pending', {
        status: 'accepted', responded_at: new Date(start).toISOString(),
        starts_at: new Date(start).toISOString(), ends_at: new Date(start + 3 * day).toISOString(),
      })
      const session = (id, userId, dayIndex, minutes) => {
        const ended = start + dayIndex * day + 3 * 3600000
        db.db.run(
          "INSERT INTO focus_sessions (id, user_id, label, kind, status, started_at, ended_at, active_ms, day) VALUES (?, ?, 'Focus', 'timer', 'completed', ?, ?, ?, '2026-01-01')",
          [id, userId, new Date(ended - minutes * 60000).toISOString(), new Date(ended).toISOString(), minutes * 60000],
        )
      }
      session('fa0', ${JSON.stringify(carol.id)}, 0, 35)
      session('fa1', ${JSON.stringify(carol.id)}, 1, 40)
      session('fb0', ${JSON.stringify(dave.id)}, 0, 20)
      session('fb2', ${JSON.stringify(dave.id)}, 2, 31)
      db.insertCheckin('duel-focus', ${JSON.stringify(dave.id)}, 1, 'I focused, trust me')
    `)
    await world.start()
  })

  after(async () => {
    await world.destroy()
  })

  it('bootstraps a fresh player with zero progress and starter gear', async () => {
    const { status, body } = await alice.client('GET', '/api/game')
    assert.equal(status, 200)
    assert.equal(body.progress.xp, 0)
    assert.equal(body.progress.level, 1)
    assert.equal(body.progress.timezone, 'Asia/Kolkata')
    assert.deepEqual(Object.keys(body.look.equipment).sort(), ['back', 'clothing', 'head'])
    assert.equal(body.focus, null)
  })

  it('generates goal quests on the server once goals exist', async () => {
    const save = await alice.client('PUT', '/api/state', {
      state: {
        onboarded: true,
        player: { name: 'Alice', character: 'female', createdAt: new Date().toISOString() },
        goals: [
          { id: 'g-a', title: 'Run a 10k', category: 'fitness', createdAt: new Date().toISOString(), archived: false },
          { id: 'g-b', title: 'Learn Spanish', category: 'learning', createdAt: new Date().toISOString(), archived: false },
        ],
        schedule: [], decks: [], reports: [], habits: [], habitMarks: {}, moods: {}, card: null, outlook: null,
      },
    })
    assert.equal(save.status, 200)
    assert.ok(save.body.rewards?.achievements?.some((a) => a.id === 'first_goal'), 'first goal achievement')
    const { body } = await alice.client('GET', '/api/quests')
    const byType = (t) => body.quests.filter((q) => q.type === t && q.origin === 'generated').length
    assert.equal(byType('daily'), 4)
    assert.equal(byType('side'), 1)
    assert.equal(byType('main'), 3)
    // Asking again adds nothing.
    const again = await alice.client('GET', '/api/quests')
    assert.equal(again.body.quests.length, body.quests.length)
  })

  it('pays a quest once, from the server’s own figure', async () => {
    const { body } = await alice.client('GET', '/api/quests')
    const daily = body.quests.find((q) => q.type === 'daily')
    const done = await alice.client('POST', `/api/quests/${daily.id}/complete`)
    assert.equal(done.status, 200)
    assert.equal(done.body.quest.status, 'completed')
    // 10 for setting a first goal (paid when the goals were saved), then the
    // quest's own figure and 25 for the First Steps achievement.
    paidSoFar = 10 + daily.xp + 25
    assert.equal(done.body.rewards.progress.xp, paidSoFar)
    assert.ok(done.body.rewards.achievements.some((a) => a.id === 'first_quest'))
    assert.ok(done.body.rewards.items.some((i) => i.id === 'badge_first_steps'))
    assert.equal(done.body.rewards.streak.current, 1)

    const replay = await alice.client('POST', `/api/quests/${daily.id}/complete`)
    assert.equal(replay.status, 409)
    const game = await alice.client('GET', '/api/game')
    assert.equal(game.body.progress.xp, paidSoFar)
  })

  it('ignores progress smuggled into a save', async () => {
    await alice.client('PUT', '/api/state', {
      state: { onboarded: true, player: { name: 'Alice', xp: 999999, coins: 999999 }, progression: { level: 99 }, quests: [], goals: [] },
    })
    const game = await alice.client('GET', '/api/game')
    assert.equal(game.body.progress.xp, paidSoFar)
    // Level 2 on the curve; the claimed 99 is ignored.
    assert.equal(game.body.progress.level, 2)
  })

  it('computes XP and rarity for player-written quests and refuses unfit input', async () => {
    const created = await alice.client('POST', '/api/quests', {
      type: 'main', title: 'Master the Elements', category: 'learning', difficulty: 'normal', durationMin: 60, progressKind: 'minutes', xp: 99999,
    })
    assert.equal(created.status, 201)
    assert.equal(created.body.quest.xp, 120)
    assert.equal(created.body.quest.rarity, 'rare')
    const tooLong = await alice.client('POST', '/api/quests', { type: 'side', title: 'x'.repeat(200), durationMin: 30 })
    assert.equal(tooLong.status, 400)
    const badType = await alice.client('POST', '/api/quests', { type: 'legendary', title: 'Hack the planet', durationMin: 30 })
    assert.equal(badType.status, 400)
    const focusOnly = await alice.client('POST', `/api/quests/${created.body.quest.id}/complete`)
    assert.equal(focusOnly.status, 409)
    assert.equal(focusOnly.body.code, 'needs_focus')
  })

  it('adds a generated plan as quests, all or none, at the server’s rates', async () => {
    const plan = await planner.client('POST', '/api/quests/plan', {
      items: [
        { title: 'Buy a lab notebook', kind: 'todo', xp: 5000 },
        { title: 'Read chapter one of the textbook', kind: 'daily' },
        { title: 'Finish the first problem set and check every answer against the key', kind: 'weekly' },
        { title: 'Sit a full mock exam under timed conditions', kind: 'monthly', type: 'legendary' },
      ],
    })
    assert.equal(plan.status, 201)
    // None of these say how long they take, so each gets the usual length for
    // its place in the plan — 20 minutes, 20, an hour, an hour and a half.
    assert.deepEqual(plan.body.quests.map((q) => [q.type, q.origin, q.durationMin, q.difficulty, q.xp]), [
      ['optional', 'plan', 20, 'easy', 15],
      ['optional', 'plan', 20, 'easy', 15],
      ['side', 'plan', 60, 'normal', 90],
      ['main', 'plan', 90, 'hard', 225],
    ])
    // Their own quests: editable and deletable before they pay anything.
    const renamed = await planner.client('PATCH', `/api/quests/${plan.body.quests[0].id}`, { title: 'Buy two lab notebooks' })
    assert.equal(renamed.status, 200)
    const removed = await planner.client('DELETE', `/api/quests/${plan.body.quests[1].id}`)
    assert.equal(removed.status, 204)

    // One bad line refuses the whole plan.
    const before = (await planner.client('GET', '/api/quests')).body.quests.length
    const bad = await planner.client('POST', '/api/quests/plan', { items: [{ title: 'Fine task', kind: 'todo' }, { title: 'x', kind: 'todo' }] })
    assert.equal(bad.status, 400)
    const tooMany = await planner.client('POST', '/api/quests/plan', { items: Array.from({ length: 41 }, (_, i) => ({ title: `Task number ${i}`, kind: 'todo' })) })
    assert.equal(tooMany.status, 400)
    assert.equal((await planner.client('GET', '/api/quests')).body.quests.length, before)
  })

  it('records the chosen path once it is one of the five', async () => {
    const bad = await planner.client('PUT', '/api/game/path', { path: 'wizard' })
    assert.equal(bad.status, 400)
    const ok = await planner.client('PUT', '/api/game/path', { path: 'scholar' })
    assert.equal(ok.status, 200)
    const game = await planner.client('GET', '/api/game')
    assert.equal(game.body.progress.flags.path, 'scholar')
    // Changing it later is allowed and does not pay or unlock anything.
    const changed = await planner.client('PUT', '/api/game/path', { path: 'creator' })
    assert.equal(changed.status, 200)
    const after = await planner.client('GET', '/api/game')
    assert.equal(after.body.progress.flags.path, 'creator')
    assert.equal(after.body.progress.xp, game.body.progress.xp)
  })

  it('caps self-reported XP per day and says so', async () => {
    const history = await alice.client('GET', '/api/progress/history?limit=100')
    const selfReported = history.body.entries.filter((e) => e.source === 'quest').reduce((sum, e) => sum + e.xp, 0)
    const big = await alice.client('POST', '/api/quests', { type: 'optional', title: 'Huge chore', durationMin: 480, difficulty: 'easy' })
    assert.equal(big.body.quest.xp, 720)
    const done = await alice.client('POST', `/api/quests/${big.body.quest.id}/complete`)
    assert.equal(done.status, 200)
    assert.equal(done.body.rewards.capped, true)
    // 300 a day self-reported, less what the daily quest already paid.
    assert.equal(done.body.rewards.entries.find((e) => e.source === 'quest').xp, 300 - selfReported)
    const game = await alice.client('GET', '/api/game')
    assert.equal(game.body.caps.selfReportedXpLeft, 0)
  })

  it('pays count quests as they grow and milestone quests step by step', async () => {
    const count = await alice.client('POST', '/api/quests', {
      type: 'side', title: 'Run 100 km', durationMin: 120, progressKind: 'count', target: 100, unit: 'km',
    })
    const logged = await alice.client('POST', `/api/quests/${count.body.quest.id}/progress`, { delta: 40 })
    assert.equal(logged.status, 200)
    assert.equal(logged.body.quest.progress.value, 40)
    assert.equal(logged.body.quest.status, 'in_progress')
    const tooMuch = await alice.client('POST', `/api/quests/${count.body.quest.id}/progress`, { delta: -5 })
    assert.equal(tooMuch.status, 400)

    const steps = await alice.client('POST', '/api/quests', {
      type: 'main', title: 'Launch MVP', durationMin: 240, progressKind: 'milestones', milestones: ['Landing page', 'Signup', 'Payments'],
    })
    const first = await alice.client('POST', `/api/quests/${steps.body.quest.id}/milestones/0`, { done: true })
    assert.equal(first.status, 200)
    assert.equal(first.body.quest.progress.value, 1)
    const again = await alice.client('POST', `/api/quests/${steps.body.quest.id}/milestones/0`, { done: true })
    assert.equal(again.body.rewards.xp, 0, 'a step pays once')
  })

  it('times focus on the server and completes a linked quest', async () => {
    const quest = await alice.client('POST', '/api/quests', {
      type: 'main', title: 'Deep chemistry block', durationMin: 25, progressKind: 'minutes',
    })
    const started = await alice.client('POST', '/api/focus', { kind: 'timer', targetMinutes: 25, questId: quest.body.quest.id })
    assert.equal(started.status, 201)
    const second = await alice.client('POST', '/api/focus', { kind: 'timer', targetMinutes: 25 })
    assert.equal(second.status, 409, 'one open session at a time')

    const early = await alice.client('POST', `/api/focus/${started.body.session.id}/pause`)
    assert.equal(early.body.session.status, 'paused')
    const resumed = await alice.client('POST', `/api/focus/${started.body.session.id}/resume`)
    assert.equal(resumed.body.session.status, 'running')

    // Wind the session's start back 26 minutes while the server is stopped —
    // the only way a test can let time pass.
    await world.stop()
    world.seed(`db.db.run("UPDATE focus_sessions SET started_at = ? WHERE id = ?", [new Date(Date.now() - 26 * 60000).toISOString(), ${JSON.stringify(started.body.session.id)}])`)
    await world.start()

    const finished = await alice.client('POST', `/api/focus/${started.body.session.id}/finish`)
    assert.equal(finished.status, 200)
    assert.equal(finished.body.session.status, 'completed')
    assert.equal(finished.body.session.xp, 25)
    assert.equal(finished.body.quest.status, 'completed')
    assert.ok(finished.body.rewards.entries.some((e) => e.source === 'quest' && e.xp === 50), 'quest paid in full, not capped')

    const replay = await alice.client('POST', `/api/focus/${started.body.session.id}/finish`)
    assert.equal(replay.status, 409)
  })

  it('pays nothing for a session finished straight away', async () => {
    const started = await alice.client('POST', '/api/focus', { kind: 'stopwatch' })
    const finished = await alice.client('POST', `/api/focus/${started.body.session.id}/finish`)
    assert.equal(finished.status, 200)
    assert.equal(finished.body.session.status, 'ended')
    assert.equal(finished.body.session.xp, 0)
  })

  it('never lets one player reach another’s quests, sessions or notifications', async () => {
    const board = await alice.client('GET', '/api/quests')
    const aliceQuest = board.body.quests.find((q) => q.status === 'active')
    assert.equal((await bob.client('GET', `/api/quests/${aliceQuest.id}`)).status, 404)
    assert.equal((await bob.client('POST', `/api/quests/${aliceQuest.id}/complete`)).status, 404)
    assert.equal((await bob.client('PATCH', `/api/quests/${aliceQuest.id}`, { title: 'Hijacked' })).status, 404)
    assert.equal((await bob.client('DELETE', `/api/quests/${aliceQuest.id}`)).status, 404)

    const session = await alice.client('POST', '/api/focus', { kind: 'timer', targetMinutes: 30 })
    assert.equal((await bob.client('POST', `/api/focus/${session.body.session.id}/finish`)).status, 404)
    assert.equal((await bob.client('POST', `/api/focus/${session.body.session.id}/pause`)).status, 404)
    await alice.client('POST', `/api/focus/${session.body.session.id}/abandon`)

    const notes = await alice.client('GET', '/api/notifications')
    const ids = notes.body.notifications.map((n) => n.id)
    assert.ok(ids.length > 0)
    await bob.client('POST', '/api/notifications/read', { ids })
    const still = await alice.client('GET', '/api/notifications')
    assert.equal(still.body.unread, notes.body.unread, "bob cannot mark alice's notifications read")

    assert.equal((await world.client()('GET', '/api/game')).status, 401)
  })

  it('checks ownership, level and coins for the wardrobe', async () => {
    const inv = await bob.client('GET', '/api/inventory')
    assert.equal(inv.status, 200)
    assert.equal(inv.body.items.find((i) => i.id === 'plain_tunic').state, 'equipped')
    assert.equal(inv.body.items.find((i) => i.id === 'alchemist_hood').state, 'locked')

    assert.equal((await bob.client('POST', '/api/inventory/equip', { slot: 'head', itemId: 'alchemist_hood' })).status, 409)
    assert.equal((await bob.client('POST', '/api/inventory/equip', { slot: 'back', itemId: 'plain_tunic' })).status, 400)
    const broke = await bob.client('POST', '/api/inventory/buy', { itemId: 'night_owl_beanie' })
    assert.equal(broke.status, 409)
    assert.equal(broke.body.code, 'insufficient_coins')
    assert.equal((await bob.client('POST', '/api/inventory/buy', { itemId: 'alchemist_hood' })).status, 409)
  })

  it('tells a player their progress carried over only when there was some', async () => {
    const fresh = await newcomer.client('GET', '/api/notifications')
    assert.equal(fresh.status, 200)
    assert.ok(!fresh.body.notifications.some((n) => n.title === 'Your progress carried over'))
    const old = await legacy.client('GET', '/api/notifications')
    assert.ok(old.body.notifications.some((n) => n.title === 'Your progress carried over'))
  })

  it('carries an old account’s progress over exactly once', async () => {
    const game = await legacy.client('GET', '/api/game')
    assert.equal(game.status, 200)
    // The old balance, plus achievements its records earn that it had never
    // been given (streak 3, first goal, focus, proof).
    const ledger = await legacy.client('GET', '/api/progress/history?limit=100')
    const opening = ledger.body.entries.find((e) => e.source === 'legacy')
    assert.equal(opening.xp, 2500)
    const extra = ledger.body.entries.filter((e) => e.source === 'achievement').reduce((sum, e) => sum + e.xp, 0)
    assert.equal(game.body.progress.xp, 2500 + extra)
    assert.ok(!ledger.body.entries.some((e) => e.source === 'achievement' && /First Steps|On Fire/.test(e.label)), 'already-held achievements do not pay again')
    const extraCoins = ledger.body.entries.filter((e) => e.source === 'achievement').reduce((sum, e) => sum + e.coins, 0)
    assert.equal(game.body.progress.coins, 700 + extraCoins)
    assert.equal(game.body.progress.streak.longest, 9)
    assert.ok(game.body.progress.level >= 7)
    assert.equal(game.body.look.equipment.special, 'red-plumed-warrior')

    const history = await legacy.client('GET', '/api/quests/history')
    assert.ok(history.body.quests.some((q) => q.id === 'todo-1' && q.status === 'completed'))
    const board = await legacy.client('GET', '/api/quests')
    assert.ok(board.body.quests.some((q) => q.id === 'todo-2' && q.type === 'optional'))
    assert.ok(!board.body.quests.some((q) => q.title === 'Old quest'), 'a quest from a past day has expired')

    const focus = await legacy.client('GET', '/api/focus/history')
    assert.equal(focus.body.sessions.length, 1)
    assert.equal(focus.body.sessions[0].xp, 65)

    const achievements = await legacy.client('GET', '/api/achievements')
    assert.ok(achievements.body.achievements.find((a) => a.id === 'streak_7').unlockedAt)

    // Completing the already-completed quest again pays nothing.
    const todayQuest = board.body.quests.find((q) => q.title === 'Study chemistry')
    if (todayQuest) assert.equal((await legacy.client('POST', `/api/quests/${todayQuest.id}/complete`)).status, 409)

    const again = await legacy.client('GET', '/api/game')
    assert.equal(again.body.progress.xp, game.body.progress.xp)
  })

  it('settles a finished duel through the ledger, once, and tells both players', async () => {
    const before = (await alice.client('GET', '/api/game')).body.progress.xp
    const list = await alice.client('GET', '/api/challenges')
    const duel = list.body.challenges.find((c) => c.id === 'duel-1')
    assert.equal(duel.status, 'completed')
    assert.deepEqual(duel.rewards, { creator: 100, opponent: 0 })
    const afterSettle = (await alice.client('GET', '/api/game')).body.progress.xp
    assert.ok(afterSettle >= before + 100, 'reward paid into server progress')

    await bob.client('GET', '/api/challenges')
    await alice.client('GET', '/api/challenges/duel-1')
    assert.equal((await alice.client('GET', '/api/game')).body.progress.xp, afterSettle, 'reading again pays nothing')

    const history = await alice.client('GET', '/api/progress/history?limit=100')
    assert.equal(history.body.entries.filter((e) => e.source === 'challenge').length, 1)
    const aliceNotes = await alice.client('GET', '/api/notifications')
    assert.ok(aliceNotes.body.notifications.some((n) => n.kind === 'challenge_completed' && n.body.includes('+100 XP')))
    const bobNotes = await bob.client('GET', '/api/notifications')
    assert.ok(bobNotes.body.notifications.some((n) => n.kind === 'challenge_completed' && /not met/.test(n.body)))
    // Each side sees its own result.
    assert.equal((await bob.client('GET', '/api/challenges/duel-1')).body.challenge.status, 'failed')
  })

  it('counts only server-timed focus in a focus duel', async () => {
    const seen = await carol.client('GET', '/api/challenges/duel-focus')
    assert.equal(seen.status, 200)
    const duel = seen.body.challenge
    assert.equal(duel.mode, 'focus')
    assert.equal(duel.status, 'completed')
    assert.deepEqual(duel.progress.opponent.days, [35, 40, 0])
    assert.deepEqual(duel.progress.creator.days, [20, 0, 31])
    assert.deepEqual([duel.progress.creator.met, duel.progress.opponent.met], [1, 2])
    assert.deepEqual(duel.rewards, { creator: 0, opponent: 150 })
    assert.equal((await dave.client('GET', '/api/challenges/duel-focus')).body.challenge.status, 'failed')

    // A running focus duel refuses check-ins: the timer is the only proof.
    const offer = await carol.client('POST', '/api/challenges', {
      opponent: 'dave', name: 'Rematch', objective: 'Focus an hour a day', rules: 'Timed focus only',
      durationDays: 3, rewardXp: 100, minCheckins: 2, startMode: 'accept', mode: 'focus', dailyMinutes: 60, proof: 'required',
    })
    assert.equal(offer.status, 201)
    assert.equal(offer.body.challenge.status, 'sent')
    assert.equal(offer.body.challenge.proof, 'optional')
    const bad = await carol.client('POST', '/api/challenges', {
      opponent: 'dave', name: 'Odd', objective: 'Focus', rules: 'Rules here', durationDays: 3, rewardXp: 100, minCheckins: 2,
      startMode: 'accept', mode: 'focus', dailyMinutes: 7,
    })
    assert.equal(bad.status, 400)
    const accepted = await dave.client('POST', `/api/challenges/${offer.body.challenge.id}/respond`, { accept: true })
    assert.equal(accepted.body.challenge.status, 'active')
    const checkin = await dave.client('POST', `/api/challenges/${offer.body.challenge.id}/checkin`, { note: 'Did an hour' })
    assert.equal(checkin.status, 409)
    assert.equal(checkin.body.code, 'focus_duel')
  })

  it('ranks the leaderboard by server XP', async () => {
    const board = await bob.client('GET', '/api/leaderboard')
    assert.equal(board.status, 200)
    assert.equal(board.body.top[0].name, 'veteran')
    const veteran = await legacy.client('GET', '/api/game')
    assert.equal(board.body.top[0].xp, veteran.body.progress.xp)
  })

  it('lets an admin adjust XP through the ledger, and nobody else', async () => {
    const denied = await bob.client('POST', `/api/admin/users/${alice.id}/xp`, { delta: 5000 })
    assert.equal(denied.status, 404)
    const before = (await alice.client('GET', '/api/game')).body.progress.xp
    const granted = await admin.client('POST', `/api/admin/users/${alice.id}/xp`, { delta: 100 })
    assert.equal(granted.status, 200)
    const afterGrant = await alice.client('GET', '/api/game')
    assert.equal(afterGrant.body.progress.xp, before + 100)
    const history = await alice.client('GET', '/api/progress/history')
    assert.ok(history.body.entries.some((e) => e.source === 'admin' && e.xp === 100))
  })
})
