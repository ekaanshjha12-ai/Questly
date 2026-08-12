import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-5'

/**
 * Two steps. First a handful of clarifying questions about the goal — level,
 * time available, constraints, deadline — so the plan that follows fits the
 * actual person instead of a generic version of the goal. Then the plan
 * itself: prep to-dos plus dated tasks across three horizons.
 */

const QUESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      description: '3 to 5 short questions whose answers would change how the plan is written.',
      items: { type: 'string' },
    },
  },
  required: ['questions'],
  additionalProperties: false,
}

const BLOCKS = ['early', 'morning', 'midday', 'afternoon', 'evening', 'night']

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    todos: {
      type: 'array',
      description:
        'One-off prep with no specific day — things to research, buy, decide or set up before the plan starts. 3 to 8 items.',
      items: { type: 'string' },
    },
    daily: {
      type: 'array',
      description: 'Concrete tasks assigned to specific days over roughly the next week. 5 to 14 items.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          dayOffset: { type: 'integer', description: 'Days from today this lands on, 0 = today, up to 6.' },
          block: { type: 'string', description: `Time of day: one of ${BLOCKS.join(', ')}.` },
        },
        required: ['title', 'dayOffset', 'block'],
        additionalProperties: false,
      },
    },
    weekly: {
      type: 'array',
      description: 'Milestones over roughly the next month, each landing on one day. 4 to 10 items.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          dayOffset: { type: 'integer', description: 'Days from today this lands on, up to 28.' },
        },
        required: ['title', 'dayOffset'],
        additionalProperties: false,
      },
    },
    monthly: {
      type: 'array',
      description: 'Bigger milestones over roughly the next three months, each landing on one day. 3 to 8 items.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          dayOffset: { type: 'integer', description: 'Days from today this lands on, up to 90.' },
        },
        required: ['title', 'dayOffset'],
        additionalProperties: false,
      },
    },
  },
  required: ['todos', 'daily', 'weekly', 'monthly'],
  additionalProperties: false,
}

const QUESTIONS_SYSTEM = `You help someone plan out a goal, and you are about to write them a full daily, weekly and monthly plan.

Before writing it, ask the few questions whose answers would actually change what you write — current level or experience, how much time they realistically have, hard constraints (equipment, schedule, budget), and any deadline. Do not ask anything the goal statement already answered.

Ask 3 to 5 questions. Keep each one short and concrete, answerable in a sentence.`

const PLAN_SYSTEM = `You write a concrete plan for someone's goal, based on what they told you about it.

You produce four things:
- todos: one-off prep — things to research, buy, decide or set up before the real work starts. No dates.
- daily: specific tasks for specific days over roughly the next week. Small enough to finish in one sitting.
- weekly: milestones over roughly the next month, each landing on one specific day — usually the day it is due or should be checked.
- monthly: bigger milestones over roughly the next three months, same idea, further out.

Rules:
- Every dated item gets a dayOffset: whole days from today, 0 = today. Space them out sensibly — do not stack everything on day 0, and do not put every daily task on the same day.
- Be specific enough to act on immediately: numbers, quantities, durations, named steps. "Do research" is not a task; "Compare 3 beginner routines and pick one" is.
- Build a realistic progression: easier or foundational things earlier, harder or dependent things later.
- Respect whatever the person said about their level, time, constraints and deadline — it matters more than the goal title.
- Keep titles under 90 characters, written as an instruction, not a description.
- Never mention the app, XP, levels or quests.`

let cached = null

function client() {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!cached) cached = new Anthropic()
  return cached
}

export function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

async function ask({ system, prompt, schema, maxTokens }) {
  const anthropic = client()
  if (!anthropic) {
    const err = new Error('The AI planner is not configured on this server.')
    err.code = 'not_configured'
    throw err
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema },
    },
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
  })

  if (response.stop_reason === 'refusal') {
    const err = new Error('The model declined this goal.')
    err.code = 'refused'
    throw err
  }

  const block = response.content.find((b) => b.type === 'text')
  if (!block) throw new Error('Model returned no text content.')
  return JSON.parse(block.text)
}

const text = (value, cap) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, cap)

export async function askPlannerQuestions(goal, detail) {
  const parts = [`Goal: "${goal}"`]
  if (detail) parts.push(`Extra context: "${detail}"`)
  parts.push('\nWhat should you ask before planning this?')

  const parsed = await ask({ system: QUESTIONS_SYSTEM, prompt: parts.join('\n'), schema: QUESTIONS_SCHEMA, maxTokens: 1024 })

  const seen = new Set()
  const out = []
  for (const raw of parsed.questions ?? []) {
    const q = text(raw, 200)
    if (q.length < 4) continue
    const key = q.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(q)
    if (out.length >= 5) break
  }
  if (!out.length) throw new Error('Model returned no usable questions.')
  return out
}

/** Shared cleanup for the three dated arrays: dedupe, cap the count, and clamp
 * dayOffset into the range the schema described (the model doesn't always obey
 * the description text). */
function cleanDated(list, cap, maxOffset) {
  const seen = new Set()
  const out = []
  for (const raw of Array.isArray(list) ? list : []) {
    const title = text(raw?.title, 90)
    if (title.length < 4) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    const dayOffset = Number(raw?.dayOffset)
    if (!Number.isFinite(dayOffset)) continue
    seen.add(key)
    out.push({
      title,
      dayOffset: Math.min(Math.max(Math.round(dayOffset), 0), maxOffset),
      ...(raw?.block ? { block: text(raw.block, 20) } : {}),
    })
    if (out.length >= cap) break
  }
  return out
}

export async function generatePlan(goal, detail, answers) {
  const parts = [`Goal: "${goal}"`]
  if (detail) parts.push(`Extra context: "${detail}"`)
  if (answers?.length) {
    parts.push('\nQuestions and answers:')
    for (const a of answers) parts.push(`Q: ${a.question}\nA: ${a.answer || '(skipped)'}`)
  }
  parts.push(`\nToday is ${new Date().toDateString()}. Write the plan.`)

  const parsed = await ask({ system: PLAN_SYSTEM, prompt: parts.join('\n'), schema: PLAN_SCHEMA, maxTokens: 4096 })

  const seenTodos = new Set()
  const todos = []
  for (const raw of parsed.todos ?? []) {
    const t = text(raw, 120)
    if (t.length < 4) continue
    const key = t.toLowerCase()
    if (seenTodos.has(key)) continue
    seenTodos.add(key)
    todos.push(t)
    if (todos.length >= 8) break
  }

  const plan = {
    todos,
    daily: cleanDated(parsed.daily, 14, 6).map((item) => ({
      ...item,
      block: BLOCKS.includes(item.block) ? item.block : 'morning',
    })),
    weekly: cleanDated(parsed.weekly, 10, 28),
    monthly: cleanDated(parsed.monthly, 8, 90),
  }

  if (!plan.todos.length && !plan.daily.length && !plan.weekly.length && !plan.monthly.length) {
    throw new Error('Model returned an empty plan.')
  }
  return plan
}
