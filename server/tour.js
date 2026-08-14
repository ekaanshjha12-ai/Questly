import Anthropic from '@anthropic-ai/sdk'
import { noteUsage } from './meter.js'

const MODEL = 'claude-opus-5'

/**
 * The guide's introduction, written for the goals the person just set.
 *
 * A fixed tour would say the same thing to a marathon runner and someone
 * learning Spanish, and read as a manual. This one names their actual goals, so
 * "verify with a photo" arrives as "photograph your running shoes after a run"
 * — the same feature, but as something that applies to them.
 *
 * The feature list is supplied rather than left to the model, because a tour
 * that invents a feature is worse than no tour at all.
 */

const FEATURES = [
  { id: 'dashboard', name: 'Quest Log', what: 'Daily, weekly and monthly quests written for each goal they set. Ticking one earns XP.' },
  { id: 'verify', name: 'Photo proof', what: 'Photograph the thing they just did. Verified quests are worth more, and levels only unlock with photo proof, so progress has to be real.' },
  { id: 'todos', name: 'To-Do', what: 'A plain list for everything that is not a quest.' },
  { id: 'schedule', name: 'Plan', what: 'Daily, weekly and monthly planner. A task placed on a day shows on all three views.' },
  { id: 'planner', name: 'AI Planner', what: 'Describe a goal, answer a few questions, optionally attach a syllabus or training plan, and it writes a dated plan straight into the planner.' },
  { id: 'focus', name: 'Focus', what: 'A timer and stopwatch with a session plan, plus ambient sound.' },
  { id: 'study', name: 'Study', what: 'Flashcards generated from any topic, and a coach that listens to them explain something and marks how well they actually know it.' },
  { id: 'avatar', name: 'Hero', what: 'Ranks from Recruit up to Heisenberg, and characters to unlock with coins earned by showing up.' },
  { id: 'progress', name: 'Stats', what: 'Focus hours, streak, verified quests, and an honest read on how likely they are to reach their goals.' },
]

const SCHEMA = {
  type: 'object',
  properties: {
    opening: {
      type: 'string',
      description: 'Two or three sentences greeting them by name and naming what they are here to change.',
    },
    steps: {
      type: 'array',
      description: 'One entry per feature given, in the same order, using the same id.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string', description: 'Short heading, under 40 characters.' },
          body: {
            type: 'string',
            description: 'Two or three sentences on what it does for THEIR goals specifically. Under 320 characters.',
          },
        },
        required: ['id', 'title', 'body'],
        additionalProperties: false,
      },
    },
    closing: {
      type: 'string',
      description: 'Two or three sentences on consistency, and one concrete thing to do first today.',
    },
  },
  required: ['opening', 'steps', 'closing'],
  additionalProperties: false,
}

const SYSTEM = `You are the guide inside a habit app, meeting someone for the first time just after they set their goals. You walk them through what is here.

Voice: warm, plain, and on their side. A steady friend who believes they can do this — never a salesperson, never a life coach with a script. Short sentences. Address them as "you".

The point you are making, without ever saying it outright: this works because it asks for evidence and rewards turning up, and that is what actually changes a life. Show that through the features rather than claiming it.

Rules:
- Tie every feature to the goals they actually set. If they want to run a half marathon, photo proof is "a picture of your shoes by the door at 6am", not "upload an image".
- Describe only the features you are given. Never invent one, never promise anything not listed.
- Do not oversell. No "transform your life", no "unlock your potential", no exclamation marks stacked up. Confidence is quiet.
- Be honest that some days will be bad. Someone who expects a straight line quits at the first gap; say that a missed day is not a failed goal.
- Keep each step under 320 characters. This is read on a phone.
- Never mention that you are an AI, and never mention prompts or models.
- End with one specific thing they can do in the next ten minutes, drawn from their own goals.`

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

/**
 * A usable tour with no API key and no cost.
 *
 * Every account gets a walkthrough, key or not — the introduction is the first
 * thing anyone sees, and "the guide is unavailable" is a poor first impression.
 * This one is plainer, but it is not a placeholder.
 */
export function fallbackTour(name, goals) {
  const first = goals[0]?.title
  return {
    opening: `Welcome, ${name || 'there'}. You have told me what you want to change${
      first ? `, starting with ${first.toLowerCase()}` : ''
    }. Here is what is here to help, and how to use it.`,
    steps: FEATURES.map((f) => ({ id: f.id, title: f.name, body: f.what })),
    closing:
      'Consistency beats intensity here. A missed day is not a failed goal — open the app tomorrow and tick one thing. Start with a single quest today.',
    generated: false,
  }
}

export async function writeTour({ name, goals }) {
  const anthropic = client()
  if (!anthropic) {
    const err = new Error('The guide is not configured on this server.')
    err.code = 'not_configured'
    throw err
  }

  const goalLines = goals
    .map((g, i) => `${i + 1}. "${g.title}" (${g.category})${g.detail ? ` — they said: "${g.detail}"` : ''}`)
    .join('\n')

  const featureLines = FEATURES.map((f) => `- ${f.id} | ${f.name}: ${f.what}`).join('\n')

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Their name: ${name || 'there'}\n\nGoals they just set:\n${goalLines}\n\nFeatures, in the order to present them:\n${featureLines}\n\nWrite their walkthrough.`,
          },
        ],
      },
    ],
  })

  noteUsage(response.usage)

  if (response.stop_reason === 'refusal') {
    const err = new Error('The model declined to write the walkthrough.')
    err.code = 'refused'
    throw err
  }

  const block = response.content.find((b) => b.type === 'text')
  if (!block) throw new Error('Model returned no text content.')
  const parsed = JSON.parse(block.text)

  // Rebuilt from the known feature list rather than trusted wholesale, so a
  // hallucinated or dropped step cannot reach the person being onboarded.
  const byId = new Map(
    (Array.isArray(parsed.steps) ? parsed.steps : []).map((s) => [String(s?.id ?? ''), s]),
  )
  const steps = FEATURES.map((f) => {
    const written = byId.get(f.id)
    return {
      id: f.id,
      title: text(written?.title, 60) || f.name,
      body: text(written?.body, 400) || f.what,
    }
  })

  return {
    opening: text(parsed.opening, 500) || fallbackTour(name, goals).opening,
    steps,
    closing: text(parsed.closing, 500) || fallbackTour(name, goals).closing,
    generated: true,
  }
}

export { FEATURES }
