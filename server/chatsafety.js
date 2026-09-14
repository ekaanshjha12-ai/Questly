/**
 * What may not be said in private messages.
 *
 * Messages are open between every age group, so a 15-year-old can be written
 * to by an adult stranger. The word filter already stops abuse and sexual
 * language. This adds the two things that turn a chat into real danger.
 *
 * Contact details, in every chat. Moving someone to another app or a phone
 * number, where nothing is filtered, reported or looked at, is the usual first
 * step in grooming and in scams alike. The rule is the same in every chat on
 * purpose: if only chats with under-18s blocked them, an adult whose number
 * bounced would learn that the other person is a child.
 *
 * Between an adult and someone under 18, also: arranging to meet, asking where
 * they live or go to school, asking for pictures, asking their age, and asking
 * to keep the chat secret. A blocked attempt says only that the message cannot
 * be sent, and goes into the audit log.
 *
 * Deliberately blunt — a pattern list, not a judgement. It will now and then
 * stop an innocent sentence, which is a better failure here than the other kind.
 */

const CONTACT = [
  // Emails, including the "name at gmail dot com" way of writing one.
  { what: 'an email address', re: /[a-z0-9._%+-]+\s*(?:@|\(at\)|\[at\]|\sat\s)\s*[a-z0-9-]+\s*(?:\.|\(dot\)|\[dot\]|\sdot\s)\s*(?:com|net|org|in|co|uk|io|me|edu|info)\b/i },
  // Links, and bare domains.
  { what: 'a link', re: /\b(?:https?:\/\/|www\.)\S+/i },
  { what: 'a link', re: /\b[a-z0-9-]{2,}\.(?:com|net|org|io|gg|me|app|co|uk|in|ly|tv|link|xyz|site|dev|info|biz|live|chat)(?:\/\S*)?\b/i },
  // Phone numbers: nine or more digits, however they are spaced or dashed.
  { what: 'a phone number', re: /(?:\+?\d[\s().-]{0,3}){9,}/ },
  // Other apps, and invitations to move to one.
  { what: 'another app', re: /\b(?:snap\s?chat|insta\s?gram|insta|whats\s?app|wa\.me|telegram|discord|kik|wickr|tik\s?tok|facebook|messenger|twitter|skype|we\s?chat|viber|line\s?id|gamertag|only\s?fans)\b/i },
  { what: 'another app', re: /\b(?:add|dm|message|text|call|find|follow|hmu)\s+me\s+(?:on|at|over)\b/i },
  { what: 'another app', re: /\bmy\s+(?:snap|sc|ig|insta|number|digits|cell|whatsapp|discord|handle)\b/i },
]

const RISKY_ACROSS_AGES = [
  { what: 'meeting up', re: /\b(?:meet\s*(?:up|irl|in\s*person|me|you|somewhere)|come\s+(?:over|round|to\s+my)|pick\s+you\s+up|hang\s*out\s+(?:irl|in\s*person)|visit\s+you)\b/i },
  { what: 'where they live', re: /\b(?:where\s+(?:do\s+)?(?:you|u)\s+live|your\s+address|ur\s+address|which\s+(?:school|city|area)|what\s+school|your\s+school|home\s+alone|parents?\s+(?:home|away|out))\b/i },
  { what: 'pictures', re: /\b(?:send|show|share)\s+(?:me\s+)?(?:a\s+|some\s+|ur\s+|your\s+|more\s+)?(?:pics?|pictures?|photos?|selfies?|nudes?|body|videos?)\b/i },
  { what: 'pictures', re: /\b(?:nudes?|sexy|hot\s+pics?)\b/i },
  { what: 'their age', re: /\b(?:how\s+old\s+(?:are\s+)?(?:you|u)|what'?s\s+(?:your|ur)\s+age|\basl\b|are\s+(?:you|u)\s+(?:a\s+)?(?:minor|underage|under\s*\d+|over\s*\d+))\b/i },
  { what: 'secrecy', re: /\b(?:don'?t\s+tell|do\s+not\s+tell|keep\s+(?:it|this)\s+(?:a\s+)?secret|our\s+(?:little\s+)?secret|delete\s+(?:this|these|the|our)\s+(?:chat|messages?|convo))\b/i },
]

/** @returns {string | null} what kind of contact detail the text carries, if any */
export function contactDetails(text) {
  const t = String(text ?? '')
  return CONTACT.find((rule) => rule.re.test(t))?.what ?? null
}

/** @returns {string | null} what makes this unsafe between an adult and a young person, if anything */
export function riskyAcrossAges(text) {
  const t = String(text ?? '')
  return RISKY_ACROSS_AGES.find((rule) => rule.re.test(t))?.what ?? null
}
