import Anthropic from '@anthropic-ai/sdk'
import { noteUsage } from './meter.js'

/**
 * Checks a picture before other people can see it.
 *
 * Feed photos are the one place a stranger's image reaches everyone else, and
 * the youngest people here are 15. Text runs through the word filter; pictures
 * need eyes, so each one is looked at by the model before it is stored. If the
 * server has no API key there is nothing to look with, and photo posts are
 * refused rather than let through unchecked — a text post still works.
 */

const MODEL = 'claude-opus-5'

const SCHEMA = {
  type: 'object',
  properties: {
    allowed: {
      type: 'boolean',
      description: 'True if this image is fine to show to everyone on a platform whose users can be as young as 15.',
    },
    category: {
      type: 'string',
      enum: ['ok', 'sexual', 'violence', 'self_harm', 'hate', 'drugs', 'personal_info', 'harassment', 'other'],
      description: 'The main reason it is not allowed, or ok.',
    },
    reason: {
      type: 'string',
      description: 'One short, neutral sentence for the person who posted it. Empty when allowed.',
    },
  },
  required: ['allowed', 'category', 'reason'],
  additionalProperties: false,
}

const SYSTEM = `You review a single image someone wants to post on the public feed of a self-improvement app. Everyone on the platform is 15 or older, and some are teenagers.

Allow ordinary things people share about their progress: desks and study notes, books, screens showing their own work or app stats, gym and sports photos, food, outdoor scenes, pets, handmade things, selfies and group photos with normal clothing.

Do not allow:
- sexual content or nudity of any kind, including suggestive poses or underwear shots;
- graphic violence, gore or injuries;
- self-harm or content that encourages it;
- hate symbols, extremist imagery, or slurs in the image;
- illegal drugs or drug use;
- personal information that could harm someone if shared: ID cards, passports, bank or payment cards, legible home addresses, phone numbers or private messages that include other people's details;
- images made to mock or harass a real, identifiable person.

Judge what is actually in the image. A gym selfie in sportswear is fine; a mirror photo in underwear is not. When something is borderline and a teenager could see it, do not allow it.`

let cached = null
function client() {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!cached) cached = new Anthropic()
  return cached
}

export function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

/** @returns {Promise<{ allowed: boolean, category: string, reason: string }>} */
export async function screenImage({ mediaType, imageBase64 }) {
  const anthropic = client()
  if (!anthropic) {
    const err = new Error('Photo posts need the image safety check, which is not set up on this server.')
    err.code = 'not_configured'
    throw err
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'May this image be posted?' },
        ],
      },
    ],
  })

  noteUsage(response.usage)

  // A refusal to look is treated as a no. An image the model will not describe
  // is not one to publish.
  if (response.stop_reason === 'refusal') {
    return { allowed: false, category: 'other', reason: 'This image cannot be posted.' }
  }

  const block = response.content.find((b) => b.type === 'text')
  const parsed = JSON.parse(block?.text ?? '{}')
  return {
    allowed: parsed.allowed === true && parsed.category === 'ok',
    category: String(parsed.category ?? 'other'),
    reason: String(parsed.reason ?? '').slice(0, 200),
  }
}
