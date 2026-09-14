export interface Rank {
  id: string
  name: string
  /** Level at which this rank is reached. */
  minLevel: number
  /** Accent colour for rank marks, card frames and glows. */
  color: string
  blurb: string
}

/**
 * The rank ladder, mirroring server/game/levels.js. Ids are stable — saved
 * data and items refer to them — and the names are what players see.
 */
export const RANKS: Rank[] = [
  { id: 'recruit', name: 'Initiate', minLevel: 1, color: '#9aa3a7', blurb: 'Every legend starts with a first quest.' },
  { id: 'soldier', name: 'Apprentice', minLevel: 3, color: '#b98a5e', blurb: 'You show up and do the work.' },
  { id: 'knight', name: 'Journeyman', minLevel: 6, color: '#7f9bb8', blurb: 'Disciplined and hard to shake.' },
  { id: 'champion', name: 'Adept', minLevel: 10, color: '#56a3eb', blurb: 'You win the hard days.' },
  { id: 'monarch', name: 'Expert', minLevel: 14, color: '#34d399', blurb: 'Your routine answers to you.' },
  { id: 'king', name: 'Master', minLevel: 18, color: '#ac78f0', blurb: 'A craft, not a habit.' },
  { id: 'celestial', name: 'Grandmaster', minLevel: 24, color: '#e2a634', blurb: 'Beyond ordinary discipline.' },
  { id: 'god', name: 'Legend', minLevel: 30, color: '#f4c45a', blurb: 'Others walk the paths you made.' },
  { id: 'heisenberg', name: 'Mythic', minLevel: 40, color: '#f6f2e8', blurb: 'Spoken of in every district.' },
]

export interface CharacterModel {
  id: string
  name: string
  modelUrl: string
  previewUrl: string
}

/** The eight 3D characters, now special items in the wardrobe. Only the file
 * locations live here; prices and gates are the server's. */
export const CHARACTER_MODELS: CharacterModel[] = [
  { id: 'red-plumed-warrior', name: 'Red-Plumed Warrior', modelUrl: '/models/red-plumed-warrior.glb', previewUrl: '/models/red-plumed-warrior.png' },
  { id: 'obsidian-sentinel', name: 'Obsidian Sentinel', modelUrl: '/models/obsidian-sentinel.glb', previewUrl: '/models/obsidian-sentinel.png' },
  { id: 'darkwing-knight', name: 'Darkwing Knight', modelUrl: '/models/darkwing-knight.glb', previewUrl: '/models/darkwing-knight.png' },
  { id: 'ivory-queen', name: 'Ivory Queen', modelUrl: '/models/ivory-queen.glb', previewUrl: '/models/ivory-queen.png' },
  { id: 'elven-sovereign', name: 'Moonlit Sovereign', modelUrl: '/models/elven-sovereign.glb', previewUrl: '/models/elven-sovereign.png' },
  { id: 'starlit-fairy', name: 'Starlit Fae', modelUrl: '/models/starlit-fairy.glb', previewUrl: '/models/starlit-fairy.png' },
  { id: 'benediction-blue', name: 'Benediction', modelUrl: '/models/benediction-blue.glb', previewUrl: '/models/benediction-blue.png' },
  { id: 'hazmat-tycoon', name: 'Wasteland Alchemist', modelUrl: '/models/hazmat-tycoon.glb', previewUrl: '/models/hazmat-tycoon.png' },
]

export function rankForLevel(level: number): Rank {
  let current = RANKS[0]
  for (const rank of RANKS) if (level >= rank.minLevel) current = rank
  return current
}

export function nextRank(level: number): Rank | null {
  return RANKS.find((r) => r.minLevel > level) ?? null
}

export function findRank(id: string): Rank {
  return RANKS.find((r) => r.id === id) ?? RANKS[0]
}

export function findModel(id: string | null | undefined): CharacterModel | null {
  if (!id) return null
  return CHARACTER_MODELS.find((m) => m.id === id) ?? null
}
