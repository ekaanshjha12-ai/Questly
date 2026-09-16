import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { makeWorld } from './helpers.mjs'
import { difficultyFor, estimateMinutes, questXp, rarityFor } from '../server/game/scale.js'
import { fillTemplate, suitableForAge, templatesFor } from '../server/game/templates.js'

/**
 * Quests on one scale, and written for the age of the player doing them.
 */

function yearsAgo(years) {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - years)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 10)
}

const GOALS = [
  { id: 'g-money', title: 'Save up', category: 'finance' },
  { id: 'g-work', title: 'Get somewhere with my work', category: 'career' },
  { id: 'g-fit', title: 'Get fitter', category: 'fitness' },
  { id: 'g-friends', title: 'See people more', category: 'social' },
]

const stateWith = (goals) => ({
  onboarded: true,
  player: { name: 'Player', character: 'female', createdAt: '2026-08-01T00:00:00.000Z' },
  goals: goals.map((g) => ({ ...g, createdAt: '2026-08-01T00:00:00.000Z', archived: false })),
  schedule: [], decks: [], reports: [], habits: [], habitMarks: {}, moods: {}, card: null, outlook: null,
})

/** Every line a goal's quests could be drawn from, for this age group. */
function wordingFor(goals, ageGroup) {
  const lines = new Set()
  for (const goal of goals) {
    for (const period of ['daily', 'weekly', 'monthly']) {
      for (const template of templatesFor(goal.category, period, ageGroup)) {
        lines.add(fillTemplate(template, goal.title).slice(0, 160))
      }
    }
  }
  return lines
}

describe('one scale', () => {
  it('reads how long a quest takes from its own words', () => {
    assert.equal(estimateMinutes('Take a 15-minute walk or light cardio session', 'daily'), 15)
    assert.equal(estimateMinutes('Study "Pass chemistry in 90 minutes" for at least 25 focused minutes', 'daily'), 25, 'the goal in quotes is not the task')
    assert.equal(estimateMinutes('Spend 2 hours in deep, distraction-free study', 'weekly'), 120)
    assert.equal(estimateMinutes('One long session: an hour of training', 'weekly'), 60)
    assert.equal(estimateMinutes('Meditate for half an hour', 'daily'), 30)
    assert.equal(estimateMinutes('Get 7+ hours of sleep to recover', 'daily'), 20, 'sleep is rest, not effort')
    assert.equal(estimateMinutes('Celebrate a win — however small — from this month', 'monthly'), 90, 'the usual length for a month')
    assert.equal(estimateMinutes('Train for 6 hours straight', 'daily'), 45, 'kept within what a day can hold')
  })

  it('gives the same level and reward to quests of the same size', () => {
    assert.deepEqual([20, 21, 60, 61, 150, 151].map(difficultyFor), ['easy', 'normal', 'normal', 'hard', 'hard', 'heroic'])
    assert.equal(questXp({ type: 'main', durationMin: 60 }), 120)
    assert.equal(questXp({ type: 'side', durationMin: 90 }), 170)
    assert.equal(rarityFor(questXp({ type: 'daily', durationMin: 20 })), 'common')
    // Longer is always worth more, whatever the type.
    for (const type of ['main', 'side', 'daily', 'optional']) {
      const paid = [15, 25, 45, 60, 90, 120, 180, 240].map((durationMin) => questXp({ type, durationMin }))
      assert.deepEqual([...paid].sort((a, b) => a - b), paid, `${type} pays more for longer`)
    }
  })
})

describe('quests on the board', () => {
  const world = makeWorld()
  let ada
  let teen
  let elder

  before(async () => {
    ada = world.seedPlayer({ username: 'ada', birthdate: yearsAgo(30) })
    teen = world.seedPlayer({ username: 'tess', birthdate: yearsAgo(16) })
    elder = world.seedPlayer({ username: 'edna', birthdate: yearsAgo(70) })
    await world.start()
  })

  after(async () => {
    await world.destroy()
  })

  it('puts every quest on the board on that one scale, whoever wrote it', async () => {
    assert.equal((await ada.client('PUT', '/api/state', { state: stateWith(GOALS) })).status, 200)
    const written = await ada.client('POST', '/api/quests', {
      type: 'side', title: 'Sort out the garage', durationMin: 15, difficulty: 'heroic', xp: 9999,
    })
    assert.equal(written.body.quest.difficulty, 'easy', 'fifteen minutes is Easy, whatever the request said')
    assert.equal(written.body.quest.xp, questXp({ type: 'side', durationMin: 15 }))

    const planned = await ada.client('POST', '/api/quests/plan', {
      items: [
        { kind: 'daily', title: 'Read the first chapter for 25 minutes' },
        { kind: 'monthly', title: 'Finish the first draft' },
      ],
    })
    assert.equal(planned.status, 201)
    assert.deepEqual(planned.body.quests.map((q) => q.durationMin), [25, 90], 'a plan item is as long as it says, or the usual length')

    const board = await ada.client('GET', '/api/quests')
    assert.ok(board.body.quests.length >= 8)
    for (const quest of board.body.quests) {
      assert.equal(quest.difficulty, difficultyFor(quest.durationMin), `${quest.title} is levelled by its length`)
      assert.equal(quest.xp, questXp({ type: quest.type, durationMin: quest.durationMin }), `${quest.title} pays the scale's figure`)
      assert.equal(quest.rarity, rarityFor(quest.xp))
      assert.ok(quest.durationMin >= 5 && quest.durationMin <= 240)
    }
  })

  it('keeps a quest already under way on the terms it started with', async () => {
    const quest = await ada.client('POST', '/api/quests', { type: 'main', title: 'Build the shed', durationMin: 60 })
    const id = quest.body.quest.id
    assert.equal((await ada.client('POST', `/api/quests/${id}/start`)).status, 200)
    const renamed = await ada.client('PATCH', `/api/quests/${id}`, { title: 'Build the bigger shed' })
    assert.equal(renamed.status, 200)
    assert.equal(renamed.body.quest.xp, quest.body.quest.xp, 'renaming pays the same')
    const resized = await ada.client('PATCH', `/api/quests/${id}`, { durationMin: 240 })
    assert.equal(resized.status, 409)
    assert.equal(resized.body.code, 'reward_locked')
  })

  it('writes a goal’s quests for the age of the player', async () => {
    assert.equal((await teen.client('PUT', '/api/state', { state: stateWith(GOALS) })).status, 200)
    assert.equal((await elder.client('PUT', '/api/state', { state: stateWith([{ id: 'g-fit', title: 'Stay steady on my feet', category: 'fitness' }]) })).status, 200)

    const forTeen = (await teen.client('GET', '/api/quests')).body.quests.filter((q) => q.origin === 'generated')
    const teenWording = wordingFor(GOALS, 'teen')
    assert.ok(forTeen.length >= 8)
    for (const quest of forTeen) {
      assert.ok(teenWording.has(quest.title), `"${quest.title}" is written for a teenager`)
      assert.doesNotMatch(quest.title, /resume|portfolio or business|networking|credit|debt|subscription|account balances|progress photos|track your meals/i)
    }

    const forAda = (await ada.client('GET', '/api/quests')).body.quests.filter((q) => q.origin === 'generated')
    const adultWording = wordingFor(GOALS, 'adult')
    for (const quest of forAda) assert.ok(adultWording.has(quest.title), `"${quest.title}" is the general wording`)

    const forElder = (await elder.client('GET', '/api/quests')).body.quests.filter((q) => q.origin === 'generated')
    const gentle = wordingFor([{ title: 'Stay steady on my feet', category: 'fitness' }], 'senior')
    assert.ok(forElder.length >= 4)
    for (const quest of forElder) assert.ok(gentle.has(quest.title), `"${quest.title}" is gentler wording`)
  })

  it('leaves out a goal’s own quests that do not suit a young player', async () => {
    const pool = {
      daily: [
        'Count your calories at every meal',
        'Check the crypto prices before school',
        'Swim 20 lengths after school',
        'Stretch for 10 minutes before bed',
        'Read one chapter of the training book',
        'Practise free throws for 20 minutes',
      ],
      weekly: ['Take progress photos to compare', 'Swim three times this week'],
      monthly: ['Pay off the credit card', 'Beat your own best time'],
    }
    const goals = [{ id: 'g-swim', title: 'Swim faster', category: 'fitness', questPool: pool }]
    assert.equal((await teen.client('PUT', '/api/state', { state: stateWith(goals) })).status, 200)
    const refreshed = await teen.client('POST', '/api/quests/refresh-goal', { goalId: 'g-swim' })
    assert.equal(refreshed.status, 200)

    const mine = (await teen.client('GET', '/api/quests')).body.quests.filter((q) => q.goalId === 'g-swim')
    assert.ok(mine.length >= 3)
    for (const quest of mine) {
      assert.ok(suitableForAge(quest.title, 'teen'), `"${quest.title}" suits a sixteen-year-old`)
      assert.doesNotMatch(quest.title, /calorie|crypto|progress photos|credit card/i)
    }
  })

  it('hands out this period’s untouched quests again when the scale or the age group changes, and leaves the rest alone', async () => {
    const board = (await ada.client('GET', '/api/quests')).body.quests.filter((q) => q.origin === 'generated')
    const [untouched, started] = board
    assert.ok(untouched && started, 'two generated quests to work with')
    assert.equal((await ada.client('POST', `/api/quests/${started.id}/start`)).status, 200)

    // Back to how quests looked before the one scale: four hours, a flat 200 XP.
    await world.stop()
    world.seed(`
      for (const id of [${JSON.stringify(untouched.id)}, ${JSON.stringify(started.id)}]) {
        db.db.run("UPDATE quests SET duration_min = 240, difficulty = 'hard', xp_reward = 200, rarity = 'epic' WHERE id = ?", [id])
      }
      db.db.run("UPDATE player_progress SET flags = '{}' WHERE user_id = ?", [${JSON.stringify(ada.id)}])
    `)
    await world.start()

    const after = (await ada.client('GET', '/api/quests')).body.quests
    assert.ok(!after.some((q) => q.id === untouched.id), 'the untouched one is handed out again')
    const kept = after.find((q) => q.id === started.id)
    assert.equal(kept.xp, 200, 'a quest under way keeps what it was promised')
    assert.equal(kept.durationMin, 240)
    for (const quest of after.filter((q) => q.origin === 'generated' && q.id !== started.id)) {
      assert.equal(quest.xp, questXp({ type: quest.type, durationMin: quest.durationMin }))
      assert.equal(quest.difficulty, difficultyFor(quest.durationMin))
    }
  })
})
