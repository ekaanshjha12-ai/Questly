import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-5'

/**
 * Two steps, deliberately separate.
 *
 * Asking for subtopics first lets the person steer what gets made before any
 * cards exist — far better than generating a deck and making them delete half
 * of it. The second call only sees the subtopics they kept.
 */

const SUBTOPIC_SCHEMA = {
  type: 'object',
  properties: {
    subtopics: {
      type: 'array',
      description: 'Between 8 and 12 distinct areas the topic breaks into.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short name, under 60 characters.' },
          blurb: { type: 'string', description: 'Half a sentence on what it covers.' },
        },
        required: ['title', 'blurb'],
        additionalProperties: false,
      },
    },
  },
  required: ['subtopics'],
  additionalProperties: false,
}

const CARD_SCHEMA = {
  type: 'object',
  properties: {
    cards: {
      type: 'array',
      description: 'Question and answer pairs, roughly 4 per subtopic.',
      items: {
        type: 'object',
        properties: {
          front: { type: 'string', description: 'The question or prompt.' },
          back: { type: 'string', description: 'The answer, complete but brief.' },
          subtopic: { type: 'string', description: 'Which subtopic this belongs to.' },
        },
        required: ['front', 'back', 'subtopic'],
        additionalProperties: false,
      },
    },
  },
  required: ['cards'],
  additionalProperties: false,
}

const SUBTOPIC_SYSTEM = `You break a study topic into the areas someone would need to learn it.

Cover the whole topic without overlapping. Order them the way you would teach them: foundations first, then what builds on those. Name each one the way a textbook chapter would — concrete, not vague. "Newton's three laws" not "Basic concepts".

Aim for 8 to 12. If the topic is narrow, fewer good ones beat padding it out.`

const CARD_SYSTEM = `You write flashcards for revision.

Each card is one question and its answer. Rules:
- One idea per card. If an answer needs "and also", split it into two cards.
- Ask something specific and answerable, not "What is X about?".
- The answer must be complete on its own — the reader cannot see the question again.
- Keep answers under about 40 words. Precision beats detail on a flashcard.
- Mix recall ("What is…", "Define…") with application ("Why does…", "What happens if…").
- No card should give away another card's answer.
- Plain text only. No markdown, numbering or bullet points.

Write roughly 4 cards per subtopic given.`

let cached = null

function client() {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!cached) cached = new Anthropic()
  return cached
}

export function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

async function ask({ system, prompt, schema }) {
  const anthropic = client()
  if (!anthropic) {
    const err = new Error('Flashcards are not configured on this server.')
    err.code = 'not_configured'
    throw err
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema },
    },
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
  })

  if (response.stop_reason === 'refusal') {
    const err = new Error('The model declined this topic.')
    err.code = 'refused'
    throw err
  }

  const block = response.content.find((b) => b.type === 'text')
  if (!block) throw new Error('Model returned no text content.')
  return JSON.parse(block.text)
}

const text = (value, cap) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, cap)

export async function suggestSubtopics(topic) {
  const parsed = await ask({
    system: SUBTOPIC_SYSTEM,
    prompt: `Topic: "${topic}"\n\nBreak this into the areas someone studying it would need to cover.`,
    schema: SUBTOPIC_SCHEMA,
  })

  const seen = new Set()
  const out = []
  for (const raw of parsed.subtopics ?? []) {
    const title = text(raw?.title, 80)
    if (title.length < 2) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ title, blurb: text(raw?.blurb, 140) })
    if (out.length >= 14) break
  }
  if (!out.length) throw new Error('Model returned no usable subtopics.')
  return out
}

export async function writeCards(topic, subtopics) {
  const list = subtopics.map((s, i) => `${i + 1}. ${s}`).join('\n')
  const parsed = await ask({
    system: CARD_SYSTEM,
    prompt: `Topic: "${topic}"\n\nSubtopics to cover:\n${list}\n\nWrite the flashcards.`,
    schema: CARD_SCHEMA,
  })

  const seen = new Set()
  const out = []
  for (const raw of parsed.cards ?? []) {
    const front = text(raw?.front, 300)
    const back = text(raw?.back, 600)
    if (front.length < 4 || back.length < 1) continue
    const key = front.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ front, back, subtopic: text(raw?.subtopic, 80) })
    if (out.length >= 60) break
  }
  if (!out.length) throw new Error('Model returned no usable cards.')
  return out
}
