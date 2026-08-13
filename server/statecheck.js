/**
 * Bounds what a client is allowed to claim about its own progress.
 *
 * The app keeps its state in the browser and writes the whole document back, so
 * without this anyone could send `{ player: { xp: 9e9 }, progression: { level: 40 } }`
 * and own every rank and character instantly. Ranks and unlocks are the point of
 * the app, so a state write is treated as a claim to be checked rather than a
 * fact to be stored.
 *
 * This is not full server authority — the client still computes its own totals.
 * It is a set of invariants that make the profitable cheats impossible:
 * levels must match earned XP, coins must have been earned and paid, unlocks
 * must have been affordable and rank-eligible, and XP cannot arrive faster than
 * a human could plausibly generate it.
 */

// Mirrors src/lib/leveling.ts. Duplicated deliberately: the server must not
// trust a number the client derived, so it derives its own.
const PROOFS_PER_LEVEL = 2

function xpForLevel(level) {
  return Math.round(50 * Math.pow(level, 1.55))
}

export function levelFromXp(totalXp) {
  let level = 1
  let remaining = Math.max(0, totalXp)
  // Bounded so a garbage XP value cannot spin here forever.
  while (level < 500 && remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level)
    level += 1
  }
  return level
}

/** Mirrors src/data/ranks.ts. Only ids, prices and rank order matter here. */
const RANK_ORDER = ['recruit', 'soldier', 'knight', 'champion', 'monarch', 'king', 'celestial', 'god', 'heisenberg']
const RANK_MIN_LEVEL = {
  recruit: 1, soldier: 3, knight: 6, champion: 10, monarch: 14,
  king: 18, celestial: 24, god: 30, heisenberg: 40,
}
const MODELS = {
  'red-plumed-warrior': { price: 60, rank: 'soldier' },
  'obsidian-sentinel': { price: 380, rank: 'knight' },
  'darkwing-knight': { price: 1500, rank: 'champion' },
  'ivory-queen': { price: 2800, rank: 'monarch' },
  'elven-sovereign': { price: 4800, rank: 'king' },
  'starlit-fairy': { price: 10000, rank: 'celestial' },
  'benediction-blue': { price: 16000, rank: 'god' },
  'hazmat-tycoon': { price: 40000, rank: 'heisenberg' },
}

function rankForLevel(level) {
  let current = 'recruit'
  for (const id of RANK_ORDER) {
    if (level >= RANK_MIN_LEVEL[id]) current = id
  }
  return current
}

/**
 * The most XP a person could honestly bank in a stretch of time.
 *
 * The richest single action is a verified monthly quest at 200 + 15. Someone
 * genuinely grinding cannot approach one of those a minute, so this leaves a
 * wide margin over real play while still cutting off scripted farming.
 */
const MAX_XP_PER_MINUTE = 400
/** Covers a first sync after a long offline stretch without opening the door to
 * an unbounded backdated claim. */
const MAX_XP_PER_WRITE = 20_000
const GRACE_XP = 500

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0)

/**
 * @returns {{ ok: true, maxXp: number } | { ok: false, reason: string, detail: string }}
 */
export function checkStateWrite({ previous, next, maxXpSeen, elapsedMs, verifiedProofs }) {
  if (!next || typeof next !== 'object') {
    return { ok: false, reason: 'malformed', detail: 'State must be an object.' }
  }

  const player = next.player
  const progression = next.progression
  const collection = next.collection
  if (!player || typeof player !== 'object') {
    return { ok: false, reason: 'malformed', detail: 'Missing player.' }
  }
  if (!progression || typeof progression !== 'object') {
    return { ok: false, reason: 'malformed', detail: 'Missing progression.' }
  }

  const xp = num(player.xp)
  const coins = num(player.coins)
  const level = num(progression.level)
  const proofs = num(progression.proofs)

  if (xp < 0 || coins < 0 || level < 1 || proofs < 0) {
    return { ok: false, reason: 'negative', detail: 'Progress values cannot be negative.' }
  }
  if (!Number.isSafeInteger(Math.round(xp)) || xp > 1e9) {
    return { ok: false, reason: 'absurd_xp', detail: 'XP is out of range.' }
  }

  // --- XP rate -------------------------------------------------------------
  const previousXp = previous ? num(previous.player?.xp) : 0
  const gained = xp - previousXp
  if (gained > 0) {
    const minutes = Math.max(0, elapsedMs) / 60000
    const ceiling = Math.min(MAX_XP_PER_WRITE, GRACE_XP + minutes * MAX_XP_PER_MINUTE)
    if (gained > ceiling) {
      return {
        ok: false,
        reason: 'xp_rate',
        detail: `Gained ${Math.round(gained)} XP in ${minutes.toFixed(1)} min, over the ${Math.round(ceiling)} ceiling.`,
      }
    }
  }

  const nextMaxXp = Math.max(num(maxXpSeen), xp)

  // --- Level must be earned ------------------------------------------------
  // XP opens a level; photo proof claims it. Neither can be skipped by asserting
  // a level in the payload.
  const xpLevel = levelFromXp(xp)
  if (level > xpLevel) {
    return { ok: false, reason: 'level_unearned', detail: `Claimed level ${level} but XP only reaches ${xpLevel}.` }
  }

  // --- Proofs must have been recorded by the verify endpoint ---------------
  // `verifiedProofs` is the server's own count of accepted photo verifications.
  // Levels beyond the first each cost PROOFS_PER_LEVEL, so the total spent plus
  // the balance still banked can never exceed what was actually verified.
  const spentOnLevels = Math.max(0, level - 1) * PROOFS_PER_LEVEL
  if (spentOnLevels + proofs > verifiedProofs + PROOFS_PER_LEVEL) {
    return {
      ok: false,
      reason: 'proofs_unearned',
      detail: `Claims ${spentOnLevels + proofs} proofs; server recorded ${verifiedProofs}.`,
    }
  }

  // --- Unlocks must be affordable and rank-eligible ------------------------
  const unlocked = Array.isArray(collection?.unlocked) ? collection.unlocked : []
  if (unlocked.length > Object.keys(MODELS).length) {
    return { ok: false, reason: 'bad_unlocks', detail: 'More unlocks than there are characters.' }
  }

  let spentOnModels = 0
  const seen = new Set()
  for (const id of unlocked) {
    const model = MODELS[id]
    if (!model) return { ok: false, reason: 'unknown_model', detail: `No such character: ${String(id).slice(0, 40)}` }
    if (seen.has(id)) return { ok: false, reason: 'duplicate_unlock', detail: `Duplicated: ${id}` }
    seen.add(id)

    // Rank gate is checked against the level actually earned, so buying ahead of
    // rank is rejected even if the coins were real.
    const reached = RANK_ORDER.indexOf(rankForLevel(xpLevel))
    if (reached < RANK_ORDER.indexOf(model.rank)) {
      return { ok: false, reason: 'rank_locked', detail: `${id} needs ${model.rank}; level ${xpLevel} is short.` }
    }
    spentOnModels += model.price
  }

  const active = collection?.active
  if (active !== null && active !== undefined && !seen.has(active)) {
    return { ok: false, reason: 'unowned_active', detail: 'Wearing a character that was never unlocked.' }
  }

  // --- Coins must have been minted, and spending must add up ---------------
  // Coins mint at a third of XP earned. Everything ever minted is bounded by the
  // high-water mark, so the balance plus what was spent cannot exceed it.
  const minted = Math.floor(nextMaxXp / 3)
  if (coins + spentOnModels > minted + GRACE_XP) {
    return {
      ok: false,
      reason: 'coins_unearned',
      detail: `Holds ${coins} + spent ${spentOnModels}, but only ${minted} were ever minted.`,
    }
  }

  // --- Cheap structural sanity --------------------------------------------
  for (const [key, cap] of [
    ['goals', 200], ['quests', 20000], ['todos', 5000],
    ['schedule', 20000], ['sessions', 20000], ['decks', 500], ['reports', 200],
  ]) {
    const value = next[key]
    if (value !== undefined && !Array.isArray(value)) {
      return { ok: false, reason: 'malformed', detail: `${key} must be an array.` }
    }
    if (Array.isArray(value) && value.length > cap) {
      return { ok: false, reason: 'too_large', detail: `${key} has ${value.length} entries, over the ${cap} cap.` }
    }
  }

  return { ok: true, maxXp: nextMaxXp }
}
