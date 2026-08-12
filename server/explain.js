import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-5'

/**
 * The teach-back check.
 *
 * Someone explains a topic, gets questioned on it, then gets told how well they
 * actually know it. Two calls: the questions have to be written after reading
 * the explanation, because the whole point is probing the specific vagueness in
 * what *this person* said rather than asking a generic quiz.
 */

const QUESTION_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      description: 'Between 3 and 5 questions probing this explanation.',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question, addressed to the person.' },
          probing: {
            type: 'string',
            description: 'What this is testing, in a few words. Shown as a hint.',
          },
        },
        required: ['question', 'probing'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
}

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    score: {
      type: 'number',
      description: 'How well they know it, 0 to 100. Be honest, not kind.',
    },
    verdict: { type: 'string', description: 'One sentence summing up where they stand.' },
    strengths: {
      type: 'array',
      description: 'What they genuinely understood, quoting what they said. 1 to 4 items.',
      items: { type: 'string' },
    },
    gaps: {
      type: 'array',
      description: 'Parts of the topic they never covered or could not answer. 0 to 5 items.',
      items: { type: 'string' },
    },
    misconceptions: {
      type: 'array',
      description: 'Things they said that are actually wrong. Empty if none. 0 to 4 items.',
      items: { type: 'string' },
    },
    nextSteps: {
      type: 'array',
      description: 'What to study next, most useful first. 2 to 4 items.',
      items: { type: 'string' },
    },
  },
  required: ['score', 'verdict', 'strengths', 'gaps', 'misconceptions', 'nextSteps'],
  additionalProperties: false,
}

const QUESTION_SYSTEM = `Someone has just explained a topic out loud, from memory, to check how well they understand it. Write the questions a good tutor would ask next.

Aim at what their explanation reveals, not at the topic in the abstract:
- Where they were vague, ask them to be precise.
- Where they stated something without explaining why, ask why.
- Where they skipped a step, ask about the step.
- Where they may have memorised a phrase without meaning, ask them to apply it to a new case.
- If something they said sounds wrong, ask a question that would expose it — without telling them it is wrong.

Ask 3 to 5. Each should be answerable in a few sentences by someone who genuinely understands, and awkward for someone who does not. One question per idea. Never ask two things in one sentence.

Do not teach, hint, correct or praise. Only ask. The explanation may be a rough speech-to-text transcript, so ignore stray punctuation and filler.`

const REPORT_SYSTEM = `You are marking a teach-back: someone explained a topic from memory, then answered questions on it.

Judge only what they actually said. Do not credit them for things they might know but did not mention.

Scoring, roughly:
- 85+ they could teach this. Accurate, explains mechanisms, handles the follow-ups.
- 65-84 solid grasp with real gaps.
- 45-64 knows the shape of it, thin on why.
- 25-44 recalls vocabulary, does not understand it.
- under 25 little genuine understanding.

Be honest rather than encouraging. An inflated score makes the whole exercise pointless. If they did badly, say so plainly and kindly.

For strengths, quote or closely paraphrase what they actually said, so it is clear you read it. For gaps, name the specific missing piece, not "needs more detail". For misconceptions, only list things genuinely incorrect — leave it empty rather than inventing one. Next steps must be concrete enough to act on today.

Address them as "you". Keep each item under 160 characters. Plain text, no markdown.`

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
    const err = new Error('The explain coach is not configured on this server.')
    err.code = 'not_configured'
    throw err
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
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
const list = (value, cap, max) =>
  (Array.isArray(value) ? value : [])
    .map((v) => text(v, cap))
    .filter((v) => v.length > 2)
    .slice(0, max)

export async function askQuestions(topic, explanation) {
  const parsed = await ask({
    system: QUESTION_SYSTEM,
    prompt: `Topic: "${topic}"\n\nTheir explanation:\n"""\n${explanation}\n"""\n\nWrite your questions.`,
    schema: QUESTION_SCHEMA,
  })

  const out = []
  for (const raw of parsed.questions ?? []) {
    const question = text(raw?.question, 300)
    if (question.length < 8) continue
    out.push({ question, probing: text(raw?.probing, 80) })
    if (out.length >= 5) break
  }
  if (!out.length) throw new Error('Model returned no usable questions.')
  return out
}

export async function gradeExplanation(topic, explanation, answers) {
  const transcript = answers
    .map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer || '(no answer given)'}`)
    .join('\n\n')

  const parsed = await ask({
    system: REPORT_SYSTEM,
    prompt: `Topic: "${topic}"\n\nTheir explanation:\n"""\n${explanation}\n"""\n\nThe follow-up questions and their answers:\n${transcript}\n\nMark this.`,
    schema: REPORT_SCHEMA,
  })

  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)))
  const report = {
    score,
    verdict: text(parsed.verdict, 300),
    strengths: list(parsed.strengths, 200, 4),
    gaps: list(parsed.gaps, 200, 5),
    misconceptions: list(parsed.misconceptions, 200, 4),
    nextSteps: list(parsed.nextSteps, 200, 4),
  }

  if (!report.verdict) throw new Error('Model returned an empty report.')
  return report
}
