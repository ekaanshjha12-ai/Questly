import Anthropic from '@anthropic-ai/sdk'
import { noteUsage } from './meter.js'

const MODEL = 'claude-opus-5'

/**
 * Writes a set of quests for one specific goal.
 *
 * Called once, when the goal is created — not per day. The result is stored on
 * the goal and drawn from for months, so a user with eight goals costs eight
 * calls in total. Generating daily would cost the same eight calls every single
 * morning for no benefit, since the quests do not need to change.
 */

const POOL_SCHEMA = {
  type: 'object',
  properties: {
    daily: {
      type: 'array',
      description: 'Exactly 10 quests doable in one day, 10 to 25 minutes each.',
      items: { type: 'string' },
    },
    weekly: {
      type: 'array',
      description: 'Exactly 6 quests needing a few sessions across a week.',
      items: { type: 'string' },
    },
    monthly: {
      type: 'array',
      description: 'Exactly 5 milestones that mark real progress over a month.',
      items: { type: 'string' },
    },
  },
  required: ['daily', 'weekly', 'monthly'],
  additionalProperties: false,
}

const SYSTEM = `You write quests for a habit-tracking app, for one specific goal the person has set.

Each quest is a single concrete action they can tick off. Write them the way a good coach would: specific to this exact goal, in the order a sensible plan would introduce them, and achievable by someone starting now.

Rules:
- Be specific to the goal. For "run a half marathon", write about easy runs, long runs, pace, cadence, rest days and shoes — not generic "do some exercise".
- Make each quest checkable. "Run 5km at conversational pace" is checkable; "work on running" is not.
- Put a number in most of them: minutes, reps, distance, pages, words, calls.
- Vary them. No two should be near-duplicates, and together they should cover the different things this goal actually requires.
- Include the unglamorous parts a beginner forgets — rest, recovery, review, admin, planning.
- Daily quests take 10 to 25 minutes. Weekly ones need a few sessions. Monthly ones are real milestones.
- Write in the imperative, addressed to the person. No "you should".
- Keep each under 90 characters.
- Never mention the app, XP, levels or quests themselves.

If the person gave extra detail about their goal, treat it as the most important input — it tells you their level, constraints and intent.`

let cached = null

function client() {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!cached) cached = new Anthropic()
  return cached
}

export function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

function clean(list, cap) {
  const seen = new Set()
  const out = []
  for (const raw of Array.isArray(list) ? list : []) {
    const text = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 120)
    if (text.length < 8) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
    if (out.length >= cap) break
  }
  return out
}

export async function generateQuestPool({ title, detail, category }) {
  const anthropic = client()
  if (!anthropic) {
    const err = new Error('Quest generation is not configured on this server.')
    err.code = 'not_configured'
    throw err
  }

  const parts = [`Goal: "${title}"`]
  if (category) parts.push(`Area: ${category}`)
  if (detail) parts.push(`What they said about it: "${detail}"`)
  parts.push('\nWrite the quests for this goal.')

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: POOL_SCHEMA },
    },
    messages: [{ role: 'user', content: [{ type: 'text', text: parts.join('\n') }] }],
  })

  // Recorded for the AI dashboard; a no-op when not inside a meter.
  noteUsage(response.usage)

  if (response.stop_reason === 'refusal') {
    const err = new Error('The model declined to write quests for this goal.')
    err.code = 'refused'
    throw err
  }

  const block = response.content.find((b) => b.type === 'text')
  if (!block) throw new Error('Model returned no text content.')
  const parsed = JSON.parse(block.text)

  const pool = {
    daily: clean(parsed.daily, 10),
    weekly: clean(parsed.weekly, 6),
    monthly: clean(parsed.monthly, 5),
  }

  // A short pool would keep repeating the same quest, which is worse than the
  // generic templates it would have replaced.
  if (pool.daily.length < 4 || pool.weekly.length < 2 || pool.monthly.length < 2) {
    throw new Error('Model returned too few usable quests.')
  }
  return pool
}
