import { screenInput } from './moderation.js'

/**
 * Rules shared by the social side: what a level unlocks, and what a post is.
 */

/**
 * Features that open up as a player levels.
 *
 * Mirrored in src/lib/social.ts for display; this copy is the one enforced.
 * Photos and messaging wait a few levels because a brand-new account is the
 * cheapest thing for a spammer to make, and those are the two features that
 * reach other people most directly.
 */
export const UNLOCKS = {
  post: 1,
  message: 2,
  photo: 3,
  createClub: 10,
}

export const POST_KINDS = ['update', 'learned', 'achievement', 'progress']
export const POST_MAX = 1000

/** @returns {{ ok: true, value: { kind: string, body: string } } | { ok: false, error: string }} */
export function validatePost(input) {
  const kind = POST_KINDS.includes(input?.kind) ? input.kind : null
  if (!kind) return { ok: false, error: 'Choose what kind of post this is.' }
  const body = String(input?.body ?? '').trim()
  if (!body) return { ok: false, error: 'Write something first.' }
  if (body.length > POST_MAX) return { ok: false, error: `Posts can be at most ${POST_MAX} characters.` }
  if (!screenInput(body, { allowLength: POST_MAX }).ok) return { ok: false, error: 'That post was blocked by the content filter.' }
  return { ok: true, value: { kind, body } }
}

/** Feed photos arrive already shrunk to 1280px by the browser, which lands
 * well under this. */
export const POST_IMAGE_MAX_BYTES = 1.5 * 1024 * 1024
