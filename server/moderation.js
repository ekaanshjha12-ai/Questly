/**
 * Guardrails on text moving in either direction past the model.
 *
 * Two separate jobs, deliberately not conflated:
 *
 *  - Abuse screening keeps hate and harassment out of goal titles, flashcard
 *    topics and anything else that gets stored and shown back. It runs before
 *    the request reaches the API, so an abusive prompt costs nothing.
 *
 *  - Injection screening looks for attempts to talk past the system prompt.
 *    Every one of these endpoints puts user text next to instructions, so text
 *    claiming to *be* an instruction is the obvious attack.
 *
 * Neither is a complete filter, and this file does not pretend otherwise. The
 * model's own refusal behaviour is the second layer; this is the cheap first one
 * that also gives us something to log and rate-limit on.
 */

/**
 * Collapses the tricks used to slip a word past a literal match: accents,
 * digit-for-letter swaps, doubled letters, and punctuation wedged between
 * characters. "f-r-3-a-k" and "ffreeak" both normalise onto the same stem.
 */
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[013457@$!|+]/g, (c) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' })[c] ?? c)
    .replace(/[^a-z\s]/g, '')
    .replace(/(.)\1{2,}/g, '$1$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Same, but with separators removed entirely, to catch "k i l l y o u". */
function despaced(text) {
  return normalize(text).replace(/\s/g, '')
}

/**
 * Seed list of unambiguous slurs and harassment stems.
 *
 * Held as stems rather than whole words so inflections are covered, and kept
 * short on purpose: a long list invites false positives ("assignment",
 * "Scunthorpe") without meaningfully raising the bar for a determined abuser.
 * Extend through MODERATION_EXTRA_TERMS rather than editing this array, so an
 * operator can tune it without a deploy.
 */
const HATE_STEMS = [
  'nigger', 'nigga', 'faggot', 'kike', 'spic', 'chink', 'wetback',
  'tranny', 'retard', 'paki', 'coon', 'gook',
]

const THREAT_PATTERNS = [
  /\b(kill|murder|stab|shoot|behead|lynch)\s+(you|him|her|them|yourself|myself|everyone)\b/,
  /\b(kill|end)\s+your\s?self\b/,
  /\bi\s+(will|am going to|wanna|want to)\s+(kill|hurt|rape|stab|shoot)\b/,
  /\b(how to|help me)\s+(make|build)\s+(a\s+)?(bomb|explosive|nerve agent)\b/,
]

const INJECTION_PATTERNS = [
  /\bignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)\b/,
  /\bdisregard\s+(all\s+|the\s+)?(previous|prior|above|system)\b/,
  /\b(you\s+are\s+now|from\s+now\s+on\s+you\s+are)\s+(a|an)\b/,
  /\b(system|developer)\s*(prompt|message|instruction)\b/,
  /\breveal\s+(your|the)\s+(system\s+)?(prompt|instructions?)\b/,
  /\bprint\s+(your|the)\s+(system\s+)?(prompt|instructions?)\b/,
  /<\/?(system|assistant|human|user)>/,
  /\bdo\s+anything\s+now\b|\bDAN\s+mode\b/i,
  /\bjailbreak\b/,
  /\bpretend\s+(you\s+are|to\s+be)\s+(an?\s+)?(unrestricted|uncensored|evil)\b/,
]

function extraTerms() {
  return String(process.env.MODERATION_EXTRA_TERMS ?? '')
    .split(',')
    .map((t) => normalize(t))
    .filter((t) => t.length > 2)
}

/**
 * @returns {{ ok: true } | { ok: false, category: string, detail: string }}
 */
export function screenInput(text, { allowLength = 6000 } = {}) {
  const raw = String(text ?? '')
  if (raw.length > allowLength) {
    return { ok: false, category: 'too_long', detail: `${raw.length} characters, limit ${allowLength}.` }
  }

  const flat = despaced(raw)
  const spaced = normalize(raw)

  for (const stem of [...HATE_STEMS, ...extraTerms()]) {
    if (flat.includes(stem)) {
      return { ok: false, category: 'hate', detail: `matched stem: ${stem}` }
    }
  }

  for (const pattern of THREAT_PATTERNS) {
    if (pattern.test(spaced)) {
      return { ok: false, category: 'threat', detail: `matched: ${pattern.source.slice(0, 60)}` }
    }
  }

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(spaced) || pattern.test(raw)) {
      return { ok: false, category: 'injection', detail: `matched: ${pattern.source.slice(0, 60)}` }
    }
  }

  return { ok: true }
}

/**
 * Screens what came back before it is handed to the client and stored.
 *
 * Only abuse is checked here, not injection: a model echoing the phrase
 * "ignore previous instructions" inside a flashcard about prompt security is
 * legitimate, whereas a slur in stored content never is.
 */
export function screenOutput(text) {
  const flat = despaced(text)
  for (const stem of [...HATE_STEMS, ...extraTerms()]) {
    if (flat.includes(stem)) return { ok: false, category: 'hate', detail: `output matched stem: ${stem}` }
  }
  return { ok: true }
}

/** Walks every string in a nested structure so a single bad field anywhere in a
 * generated payload fails the whole thing. */
export function screenOutputDeep(value, depth = 0) {
  if (depth > 6) return { ok: true }
  if (typeof value === 'string') return screenOutput(value)
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = screenOutputDeep(item, depth + 1)
      if (!result.ok) return result
    }
    return { ok: true }
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      const result = screenOutputDeep(item, depth + 1)
      if (!result.ok) return result
    }
  }
  return { ok: true }
}

export const REFUSAL_MESSAGE =
  'That request was blocked by the content filter. Rephrase it and try again.'
