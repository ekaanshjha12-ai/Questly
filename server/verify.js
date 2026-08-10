import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-opus-5'

/** Structured verdict shape — constrains the model's output so the server never
 * has to parse free-form prose. */
const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verified: {
      type: 'boolean',
      description: 'True only if the evidence plausibly shows the task was actually done.',
    },
    confidence: {
      type: 'number',
      description: 'How confident the verdict is, from 0 to 1.',
    },
    reason: {
      type: 'string',
      description: 'One short sentence, addressed to the user, explaining the verdict.',
    },
    firstPerson: {
      type: 'boolean',
      description:
        'True if this looks like an ordinary photo the person took themselves just now. False for stock photography, promotional or catalogue images, illustrations, memes, images with watermarks or overlaid text, screenshots of a web page or gallery, or a photo taken of a phone or computer screen.',
    },
    concern: {
      type: 'string',
      description:
        'If firstPerson is false, name what made it look inauthentic in a few words. Empty string otherwise.',
    },
  },
  required: ['verified', 'confidence', 'reason', 'firstPerson', 'concern'],
  additionalProperties: false,
}

const PHOTO_SYSTEM = `You verify whether a photo is genuine evidence that a specific personal-goal task was just completed by the person who submitted it.

People are rewarded for passing this check, so some will try to cheat. Assume the photo may not be theirs until it looks like it is.

Set verified true only when BOTH hold:
1. The image is clearly connected to this specific task.
2. It looks like a candid photo this person took themselves, in their own surroundings, just now.

Set verified false when the image is unrelated to the task, too dark or blurry to judge, or shows only a generic scene that could belong to anyone with no sign of personal involvement.

Judge authenticity carefully. Real evidence is imperfect: casual framing, uneven lighting, ordinary clutter, personal belongings visible. Treat as NOT first-person any image that is professionally lit or composed, watermarked, carries overlaid marketing or caption text, is an illustration or render, is a screenshot of a website or photo gallery, or is a photograph of a phone, monitor or television screen — look for moiré patterns, screen bezels, glare and pixel grids.

A screenshot of the person's own fitness or study app is acceptable evidence of the activity, but set firstPerson false if it is a screenshot of someone else's content, a web page, or a search result.

Be fair to honest users: an ordinary imperfect phone photo that matches the task should pass. But when something reads as stock, promotional, or re-photographed from a screen, say so in concern and set firstPerson false.`

const VOICE_SYSTEM = `You verify a spoken self-report that a specific personal-goal task was completed.

There is no proof here beyond the person's own words, so judge whether the report is a genuine, specific account of doing the task.

Approve when the report describes actually doing it with some concrete detail — what they did, how long, where, or how it went.

Reject when the report is empty or inaudible, is a bare "yes" or "done" with no substance, describes something unrelated to the task, or says the task was not done.

Be fair rather than strict, but require enough substance that the person clearly did the thing.`

let cachedClient = null

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!cachedClient) cachedClient = new Anthropic()
  return cachedClient
}

export function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

function readVerdict(response) {
  const block = response.content.find((b) => b.type === 'text')
  if (!block) throw new Error('Model returned no text content.')
  const parsed = JSON.parse(block.text)
  return {
    verified: Boolean(parsed.verified),
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    reason: String(parsed.reason ?? '').slice(0, 400),
    // Absent on the voice path, where authenticity is not assessable at all.
    firstPerson: parsed.firstPerson === undefined ? true : Boolean(parsed.firstPerson),
    concern: String(parsed.concern ?? '').slice(0, 200),
  }
}

/** A verdict must clear this to count. The model hedges below it, and hedged
 * approvals are exactly where cheats slip through. */
export const MIN_CONFIDENCE = 0.7

async function ask({ system, content }) {
  const client = getClient()
  if (!client) {
    const err = new Error('Verification is not configured on this server.')
    err.code = 'not_configured'
    throw err
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    // Low effort is plenty for a single yes/no judgement and keeps it fast.
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: VERDICT_SCHEMA },
    },
    messages: [{ role: 'user', content }],
  })

  if (response.stop_reason === 'refusal') {
    const err = new Error('The model declined to review this submission.')
    err.code = 'refused'
    throw err
  }

  return readVerdict(response)
}

export function verifyPhoto({ taskTitle, mediaType, imageBase64 }) {
  return ask({
    system: PHOTO_SYSTEM,
    content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
      { type: 'text', text: `The task is: "${taskTitle}"\n\nDoes this photo plausibly show that this task was done?` },
    ],
  })
}

export function verifyVoice({ taskTitle, transcript }) {
  return ask({
    system: VOICE_SYSTEM,
    content: [
      {
        type: 'text',
        text: `The task is: "${taskTitle}"\n\nThe person said:\n"""\n${transcript}\n"""\n\nIs this a genuine, specific confirmation that they did this task?`,
      },
    ],
  })
}
