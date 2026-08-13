import Anthropic from '@anthropic-ai/sdk'
import { noteUsage } from './meter.js'

const MODEL = 'claude-opus-5'

/**
 * Reads how someone has actually behaved in the app and estimates whether they
 * are on track for their goals.
 *
 * The whole feature is worthless if the number flatters. A score that says 90%
 * to everyone is decoration, and one that punishes a three-day-old account for
 * having no history is just wrong — which is why thin evidence is refused
 * upstream rather than guessed at here.
 */

const OUTLOOK_SCHEMA = {
  type: 'object',
  properties: {
    probability: {
      type: 'integer',
      description: 'Chance of reaching their goals on current behaviour, 0 to 100.',
    },
    confidence: {
      type: 'string',
      enum: ['low', 'medium', 'high'],
      description: 'How much the available history justifies the number.',
    },
    verdict: { type: 'string', description: 'One plain sentence on where they stand.' },
    drivers: {
      type: 'array',
      description: '2 to 4 specific things they are doing that raise the odds. Cite their numbers.',
      items: { type: 'string' },
    },
    risks: {
      type: 'array',
      description: '1 to 4 specific things lowering the odds. Empty only if there are genuinely none.',
      items: { type: 'string' },
    },
    perGoal: {
      type: 'array',
      description: 'One entry per goal given, in the same order.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          probability: { type: 'integer', description: '0 to 100 for this goal alone.' },
          note: { type: 'string', description: 'One short sentence of reasoning.' },
        },
        required: ['title', 'probability', 'note'],
        additionalProperties: false,
      },
    },
    quotes: {
      type: 'array',
      description: 'Exactly 2 short lines that fit their situation.',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Under 140 characters.' },
          author: {
            type: 'string',
            description:
              'Who said it. Empty string if you are not certain of the attribution or the line is your own.',
          },
        },
        required: ['text', 'author'],
        additionalProperties: false,
      },
    },
  },
  required: ['probability', 'confidence', 'verdict', 'drivers', 'risks', 'perGoal', 'quotes'],
  additionalProperties: false,
}

const SYSTEM = `You estimate whether someone will reach the goals they set, from how they have actually used a habit-tracking app.

Be fair and be accurate. Both failure modes are real:
- Inflating the number makes the whole feature meaningless. If someone has not shown up in three weeks, say so and score it accordingly.
- Marking someone down for a short history is equally wrong. A young account with consistent behaviour deserves a good score with low confidence, not a bad score. Judge the pattern, not the total.

How to weigh what you are given:
- Consistency beats volume. Someone active 12 of the last 14 days is on track even with modest totals. A large lifetime total with nothing in the last three weeks is not.
- Recency matters most. Weight the last two weeks far above older history.
- Verified quests are stronger evidence than self-ticked ones — they required a photo.
- A long current streak is good evidence. A long *past* streak that has since broken is a warning, not a credit.
- Goals with no activity at all should be called out honestly, even if other goals are going well.

Calibration. Treat these as anchors:
- 80-95: consistent recent activity, streak intact, most goals moving.
- 55-79: real progress, but gaps, or some goals untouched.
- 30-54: sporadic, or a clear decline from an earlier pace.
- 5-29: largely dormant.
Do not cluster everything in the 70s. Use the range.

Confidence is about evidence, not optimism: "low" for under two weeks of history, "high" only for a long and consistent record.

Drivers and risks must cite their actual numbers — "active 11 of the last 14 days" not "good consistency". Never invent a number you were not given. If a goal has no activity, its risk line should say that plainly.

The two quotes go under the score. Pick lines that suit their specific situation — someone rebuilding after a lapse needs something different from someone on a 40-day streak. Only fill in the author when you are certain the attribution is genuine; otherwise leave author as an empty string and write the line yourself. A misattributed quote is worse than an unattributed one.

Address the person as "you". Never mention XP, levels, coins or the app's own mechanics — talk about what they did.`

let cached = null

function client() {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!cached) cached = new Anthropic()
  return cached
}

export function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

const text = (value, cap) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, cap)

function clampPercent(value) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return null
  return Math.min(100, Math.max(0, n))
}

function cleanList(list, cap, max) {
  const seen = new Set()
  const out = []
  for (const raw of Array.isArray(list) ? list : []) {
    const item = text(raw, cap)
    if (item.length < 4) continue
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= max) break
  }
  return out
}

/** Turns the numbers into something the model can reason over, rather than
 * handing it raw JSON to interpret. */
function describe(stats, goals) {
  const lines = [
    `Account age: ${stats.accountAgeDays} days`,
    `Days with at least one thing finished: ${stats.activeDays} of those ${stats.accountAgeDays}`,
    `Active days in the last 14: ${stats.activeDaysLast14}`,
    `Things finished in the last 7 days: ${stats.completionsLast7}`,
    `Things finished in the last 30 days: ${stats.completionsLast30}`,
    `Current streak: ${stats.currentStreak} days (longest ever ${stats.longestStreak})`,
    `Quests completed: ${stats.questsCompleted}, of which photo-verified: ${stats.questsVerified}`,
    `To-dos finished: ${stats.todosCompleted}, still open: ${stats.todosOpen}`,
    `Focus sessions: ${stats.focusSessions}, totalling ${Math.round(stats.totalFocusMs / 60000)} minutes`,
    stats.daysSinceLastActivity === null
      ? 'Nothing has ever been completed.'
      : `Days since anything was finished: ${stats.daysSinceLastActivity}`,
  ]

  const goalLines = goals.map((g, i) => {
    const parts = [
      `${i + 1}. "${g.title}" (${g.category}), set ${g.ageDays} days ago`,
      `   quests completed ${g.questsCompleted} (${g.questsVerified} photo-verified), focus time ${g.focusMinutes} min`,
    ]
    if (g.detail) parts.push(`   what they said about it: "${g.detail}"`)
    return parts.join('\n')
  })

  return `Activity:\n${lines.join('\n')}\n\nGoals:\n${goalLines.join('\n')}`
}

export async function analyseOutlook(stats, goals) {
  const anthropic = client()
  if (!anthropic) {
    const err = new Error('Progress analysis is not configured on this server.')
    err.code = 'not_configured'
    throw err
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: OUTLOOK_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: `${describe(stats, goals)}\n\nEstimate their chance of success.` }],
      },
    ],
  })

  // Recorded for the AI dashboard; a no-op when not inside a meter.
  noteUsage(response.usage)

  if (response.stop_reason === 'refusal') {
    const err = new Error('The model declined to analyse this.')
    err.code = 'refused'
    throw err
  }

  const block = response.content.find((b) => b.type === 'text')
  if (!block) throw new Error('Model returned no text content.')
  const parsed = JSON.parse(block.text)

  const probability = clampPercent(parsed.probability)
  if (probability === null) throw new Error('Model returned no usable probability.')

  const byTitle = new Map(goals.map((g) => [g.title.toLowerCase(), g]))
  const perGoal = []
  for (const raw of Array.isArray(parsed.perGoal) ? parsed.perGoal : []) {
    const title = text(raw?.title, 200)
    const p = clampPercent(raw?.probability)
    // Only keep rows that name a goal the user actually has, so a hallucinated
    // goal cannot appear in their breakdown.
    if (!byTitle.has(title.toLowerCase()) || p === null) continue
    perGoal.push({ title, probability: p, note: text(raw?.note, 240) })
    if (perGoal.length >= 12) break
  }

  const quotes = []
  for (const raw of Array.isArray(parsed.quotes) ? parsed.quotes : []) {
    const quoteText = text(raw?.text, 200)
    if (quoteText.length < 8) continue
    const author = text(raw?.author, 80)
    quotes.push({ text: quoteText, ...(author ? { author } : {}) })
    if (quotes.length >= 2) break
  }

  return {
    probability,
    confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low',
    verdict: text(parsed.verdict, 300),
    drivers: cleanList(parsed.drivers, 200, 4),
    risks: cleanList(parsed.risks, 200, 4),
    perGoal,
    quotes,
  }
}
