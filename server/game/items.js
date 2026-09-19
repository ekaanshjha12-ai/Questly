import { findAchievement } from './achievements.js'

/**
 * The item catalogue and the rules for owning each item.
 *
 * Items are cosmetic: they change how a character looks and what a card shows,
 * never how much XP anything pays, so leaderboards stay about the work. Every
 * rule is checked by the server — levels and achievements from its own
 * records, purchases against the coin balance it holds — and only the server
 * writes to `user_items`.
 *
 * The eight 3D characters that could already be bought keep their ids, prices
 * and rank gates, and now live in the Special slot.
 */

export const SLOTS = ['head', 'clothing', 'back', 'tool', 'pet', 'badge', 'special']
export const RARITIES = ['common', 'rare', 'epic', 'legendary']

/** Owned by everyone from the start, and worn until something replaces them. */
export const STARTER_ITEMS = ['traveler_cap', 'plain_tunic', 'satchel']

const level = (n) => ({ type: 'level', level: n })
const achievement = (id) => ({ type: 'achievement', id })
const purchase = (price, minLevel = 1) => ({ type: 'purchase', price, minLevel })

export const ITEMS = [
  // --- head ---------------------------------------------------------------
  { id: 'traveler_cap', name: 'Traveler’s Cap', slot: 'head', rarity: 'common', description: 'Worn thin by a hundred mornings.', unlock: { type: 'starter' } },
  { id: 'night_owl_beanie', name: 'Night Owl Beanie', slot: 'head', rarity: 'common', description: 'For the late chapters.', unlock: purchase(120) },
  { id: 'scholar_hood', name: 'Scholar’s Hood', slot: 'head', rarity: 'rare', description: 'Lined for long hours in cold archives.', unlock: level(5) },
  { id: 'builder_goggles', name: 'Builder’s Goggles', slot: 'head', rarity: 'rare', description: 'Scratched from a dozen shipped projects.', unlock: achievement('quests_10') },
  { id: 'focus_circlet', name: 'Circlet of Focus', slot: 'head', rarity: 'epic', description: 'Hums faintly an hour into deep work.', unlock: achievement('focus_deep') },
  { id: 'alchemist_hood', name: 'Alchemist Hood', slot: 'head', rarity: 'legendary', description: 'Stitched with sigils that only settle when you do.', unlock: level(19) },
  { id: 'crown_of_resolve', name: 'Crown of Resolve', slot: 'head', rarity: 'legendary', description: 'Forged from thirty unbroken days.', unlock: achievement('streak_30') },

  // --- clothing -------------------------------------------------------------
  { id: 'plain_tunic', name: 'Plain Tunic', slot: 'clothing', rarity: 'common', description: 'Every legend starts in one.', unlock: { type: 'starter' } },
  { id: 'ranger_jacket', name: 'Ranger Jacket', slot: 'clothing', rarity: 'rare', description: 'Many pockets, all of them useful.', unlock: purchase(300, 6) },
  { id: 'scholar_robe', name: 'Scholar’s Robe', slot: 'clothing', rarity: 'rare', description: 'Ink stains are a mark of honour.', unlock: level(8) },
  { id: 'forge_apron', name: 'Forge Apron', slot: 'clothing', rarity: 'rare', description: 'Scorched at the hem from a finished monthly quest.', unlock: achievement('monthly_complete') },
  { id: 'architect_hoodie', name: 'Architect Hoodie', slot: 'clothing', rarity: 'epic', description: 'Worn by people who plan, then build.', unlock: achievement('focus_10') },
  { id: 'duelist_coat', name: 'Duelist’s Coat', slot: 'clothing', rarity: 'epic', description: 'Tailored for the arena.', unlock: achievement('duel_5') },
  { id: 'sage_vestments', name: 'Sage Vestments', slot: 'clothing', rarity: 'legendary', description: 'Quiet authority, earned over thirty levels.', unlock: level(30) },

  // --- back -----------------------------------------------------------------
  { id: 'satchel', name: 'Satchel', slot: 'back', rarity: 'common', description: 'Room for a notebook and a snack.', unlock: { type: 'starter' } },
  { id: 'scroll_quiver', name: 'Scroll Quiver', slot: 'back', rarity: 'rare', description: 'Holds the proof of your work.', unlock: achievement('verify_first') },
  { id: 'traveler_cloak', name: 'Traveler’s Cloak', slot: 'back', rarity: 'rare', description: 'Dust from every region you have crossed.', unlock: level(12) },
  { id: 'ember_cape', name: 'Ember Cape', slot: 'back', rarity: 'epic', description: 'Glows while your streak burns.', unlock: achievement('streak_7') },
  { id: 'starlight_wings', name: 'Starlight Wings', slot: 'back', rarity: 'legendary', description: 'For those who reached the Mythic rank.', unlock: level(40) },

  // --- tools ----------------------------------------------------------------
  { id: 'drafting_quill', name: 'Drafting Quill', slot: 'tool', rarity: 'common', description: 'The first quest you ever wrote.', unlock: { type: 'onboarding' } },
  { id: 'hourglass', name: 'Hourglass', slot: 'tool', rarity: 'rare', description: 'Turned once for your first focus session.', unlock: achievement('focus_first') },
  { id: 'builders_hammer', name: 'Builder’s Hammer', slot: 'tool', rarity: 'rare', description: 'Balanced for honest work.', unlock: level(10) },
  { id: 'scholars_lantern', name: 'Scholar’s Lantern', slot: 'tool', rarity: 'rare', description: 'Lit by ten hours of focus.', unlock: achievement('focus_hours_10') },
  { id: 'sage_elixir', name: 'Sage Elixir', slot: 'tool', rarity: 'epic', description: 'Brewed from a legendary quest. Restores clarity.', unlock: achievement('legendary_quest') },
  { id: 'proof_codex', name: 'Codex of Proof', slot: 'tool', rarity: 'epic', description: 'Every page a verified deed.', unlock: achievement('verify_10') },

  // --- pets -----------------------------------------------------------------
  { id: 'ink_cat', name: 'Ink Cat', slot: 'pet', rarity: 'common', description: 'Sleeps on whatever you are reading.', unlock: purchase(250) },
  { id: 'focus_owl', name: 'Focus Sentinel Owl', slot: 'pet', rarity: 'rare', description: 'Keeps watch through fourteen days.', unlock: achievement('streak_14') },
  { id: 'moss_turtle', name: 'Moss Turtle', slot: 'pet', rarity: 'rare', description: 'Slow, steady, unstoppable.', unlock: level(15) },
  { id: 'ember_fox', name: 'Ember Fox', slot: 'pet', rarity: 'epic', description: 'Follows those who answer a challenge.', unlock: achievement('duel_first') },
  { id: 'star_wisp', name: 'Star Wisp', slot: 'pet', rarity: 'legendary', description: 'Drifts beside veterans of twenty-five levels.', unlock: level(25) },

  // --- badges ---------------------------------------------------------------
  { id: 'badge_first_steps', name: 'First Steps', slot: 'badge', rarity: 'common', description: 'Completed a first quest.', unlock: achievement('first_quest') },
  { id: 'badge_herald', name: 'Herald', slot: 'badge', rarity: 'common', description: 'Shared progress with the world.', unlock: achievement('post_first') },
  { id: 'badge_week_warrior', name: 'Week Warrior', slot: 'badge', rarity: 'rare', description: 'Seven active days.', unlock: achievement('week_warrior') },
  { id: 'badge_duelist', name: 'Duelist', slot: 'badge', rarity: 'rare', description: 'Met a duel’s objective.', unlock: achievement('duel_first') },
  { id: 'badge_guild', name: 'Guild Sigil', slot: 'badge', rarity: 'rare', description: 'Joined a club.', unlock: achievement('club_join') },
  { id: 'badge_deep_work', name: 'Deep Work', slot: 'badge', rarity: 'epic', description: 'An hour of unbroken focus.', unlock: achievement('focus_deep') },

  // --- special: the 3D characters -------------------------------------------
  { id: 'red-plumed-warrior', name: 'Red-Plumed Warrior', slot: 'special', rarity: 'rare', description: 'Bronze, crest and shield.', unlock: purchase(60, 3), model: true },
  { id: 'obsidian-sentinel', name: 'Obsidian Sentinel', slot: 'special', rarity: 'rare', description: 'Black plate and a crimson cloak.', unlock: purchase(380, 6), model: true },
  { id: 'darkwing-knight', name: 'Darkwing Knight', slot: 'special', rarity: 'epic', description: 'Winged, horned and built for the long campaign.', unlock: purchase(1500, 10), model: true },
  { id: 'ivory-queen', name: 'Ivory Queen', slot: 'special', rarity: 'epic', description: 'Crowned in pearl and quiet authority.', unlock: purchase(2800, 14), model: true },
  { id: 'elven-sovereign', name: 'Moonlit Sovereign', slot: 'special', rarity: 'legendary', description: 'Robed in moonlight, blade at rest.', unlock: purchase(4800, 18), model: true },
  { id: 'starlit-fairy', name: 'Starlit Fae', slot: 'special', rarity: 'legendary', description: 'Wings of glass and starlight.', unlock: purchase(10000, 24), model: true },
  { id: 'benediction-blue', name: 'Benediction', slot: 'special', rarity: 'legendary', description: 'Hand raised, verdict given.', unlock: purchase(16000, 30), model: true },
  { id: 'hazmat-tycoon', name: 'Wasteland Alchemist', slot: 'special', rarity: 'legendary', description: 'Sealed suit, steady hands, nothing left to prove.', unlock: purchase(40000, 40), model: true },
]

const BY_ID = new Map(ITEMS.map((item) => [item.id, item]))

export function findItem(id) {
  return BY_ID.get(id) ?? null
}

/** Human wording for how an item is obtained. */
export function unlockText(item) {
  const rule = item.unlock
  switch (rule.type) {
    case 'starter':
      return 'Starting gear'
    case 'onboarding':
      return 'Finish your first quests'
    case 'level':
      return `Reach level ${rule.level}`
    case 'achievement': {
      const def = findAchievement(rule.id)
      return def ? `Achievement: ${def.title}` : 'Achievement'
    }
    case 'purchase':
      return rule.minLevel > 1 ? `${rule.price} coins · level ${rule.minLevel}` : `${rule.price} coins`
    default:
      return 'Special'
  }
}

/**
 * Items the player's record now entitles them to, that are granted rather
 * than bought.
 *
 * @param {{ level: number, achievements: Set<string>, onboardingDone: boolean }} record
 */
export function earnedItems(record) {
  const earned = []
  for (const item of ITEMS) {
    const rule = item.unlock
    if (rule.type === 'starter') earned.push(item.id)
    else if (rule.type === 'level' && record.level >= rule.level) earned.push(item.id)
    else if (rule.type === 'achievement' && record.achievements.has(rule.id)) earned.push(item.id)
    else if (rule.type === 'onboarding' && record.onboardingDone) earned.push(item.id)
  }
  return earned
}
