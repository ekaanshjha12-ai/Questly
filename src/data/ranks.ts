export interface Rank {
  id: string
  name: string
  /** Level at which this rank is reached. */
  minLevel: number
  icon: string
  /** Accent colour used for the roadmap node, avatar glow and rank badge. */
  color: string
  blurb: string
}

/** The progression ladder. Ordered, ascending — index doubles as rank order. */
export const RANKS: Rank[] = [
  { id: 'recruit', name: 'Recruit', minLevel: 1, icon: '🪖', color: '#8b93a7', blurb: 'Everyone starts here.' },
  { id: 'soldier', name: 'Soldier', minLevel: 3, icon: '⚔️', color: '#c9705a', blurb: 'You show up and do the work.' },
  { id: 'knight', name: 'Knight', minLevel: 6, icon: '🛡️', color: '#7b8ba8', blurb: 'Disciplined and hard to shake.' },
  { id: 'champion', name: 'Champion', minLevel: 10, icon: '🏆', color: '#b06bd6', blurb: 'You win the hard days.' },
  { id: 'monarch', name: 'Monarch', minLevel: 14, icon: '👑', color: '#d8cfc0', blurb: 'You rule your own routine.' },
  { id: 'king', name: 'King', minLevel: 18, icon: '🜲', color: '#e0c56b', blurb: 'Your habits answer to you.' },
  { id: 'celestial', name: 'Celestial', minLevel: 24, icon: '✨', color: '#7fd3f0', blurb: 'Beyond ordinary discipline.' },
  { id: 'god', name: 'God', minLevel: 30, icon: '🌟', color: '#ffe27a', blurb: 'Unshakeable. Untouchable.' },
  {
    id: 'heisenberg',
    name: 'Heisenberg',
    minLevel: 40,
    icon: '🧪',
    color: '#8fe388',
    blurb: 'You are the one who knocks.',
  },
]

export interface CharacterModel {
  id: string
  name: string
  blurb: string
  /** Rank the player must reach before this can be bought. */
  rankId: string
  price: number
  modelUrl: string
  previewUrl: string
}

/** Buyable appearances, one per rank above Recruit. */
export const CHARACTER_MODELS: CharacterModel[] = [
  {
    id: 'red-plumed-warrior',
    name: 'Red-Plumed Warrior',
    blurb: 'Bronze, crest and shield. A soldier who has seen a few mornings.',
    rankId: 'soldier',
    price: 60,
    modelUrl: '/models/red-plumed-warrior.glb',
    previewUrl: '/models/red-plumed-warrior.png',
  },
  {
    id: 'obsidian-sentinel',
    name: 'Obsidian Sentinel',
    blurb: 'Black plate and a crimson cloak. Nothing gets past it.',
    rankId: 'knight',
    price: 380,
    modelUrl: '/models/obsidian-sentinel.glb',
    previewUrl: '/models/obsidian-sentinel.png',
  },
  {
    id: 'darkwing-knight',
    name: 'Darkwing Knight',
    blurb: 'Winged, horned and armed. Built for the long campaign.',
    rankId: 'champion',
    price: 1500,
    modelUrl: '/models/darkwing-knight.glb',
    previewUrl: '/models/darkwing-knight.png',
  },
  {
    id: 'ivory-queen',
    name: 'Ivory Queen',
    blurb: 'Crowned in pearl and quiet authority.',
    rankId: 'monarch',
    price: 2800,
    modelUrl: '/models/ivory-queen.glb',
    previewUrl: '/models/ivory-queen.png',
  },
  {
    id: 'elven-sovereign',
    name: 'Moonlit Sovereign',
    blurb: 'Robed in moonlight, blade at rest. Rules without raising a voice.',
    rankId: 'king',
    price: 4800,
    modelUrl: '/models/elven-sovereign.glb',
    previewUrl: '/models/elven-sovereign.png',
  },
  {
    id: 'starlit-fairy',
    name: 'Starlit Fae',
    blurb: 'Wings of glass and starlight. Barely bound to the ground.',
    rankId: 'celestial',
    price: 10000,
    modelUrl: '/models/starlit-fairy.glb',
    previewUrl: '/models/starlit-fairy.png',
  },
  {
    id: 'benediction-blue',
    name: 'Benediction',
    blurb: 'Hand raised, verdict given. The final form.',
    rankId: 'god',
    price: 16000,
    modelUrl: '/models/benediction-blue.glb',
    previewUrl: '/models/benediction-blue.png',
  },
  {
    id: 'hazmat-tycoon',
    name: 'Heisenberg',
    blurb: 'Yellow suit, empty barrels, nothing left to prove. The last one.',
    rankId: 'heisenberg',
    price: 40000,
    modelUrl: '/models/hazmat-tycoon.glb',
    previewUrl: '/models/hazmat-tycoon.png',
  },
]

export function rankForLevel(level: number): Rank {
  let current = RANKS[0]
  for (const rank of RANKS) {
    if (level >= rank.minLevel) current = rank
  }
  return current
}

export function rankIndex(rankId: string): number {
  return RANKS.findIndex((r) => r.id === rankId)
}

export function nextRank(level: number): Rank | null {
  return RANKS.find((r) => r.minLevel > level) ?? null
}

export function findModel(id: string | null | undefined): CharacterModel | null {
  if (!id) return null
  return CHARACTER_MODELS.find((m) => m.id === id) ?? null
}

export function findRank(id: string): Rank {
  return RANKS.find((r) => r.id === id) ?? RANKS[0]
}

/** A model is buyable once the player's rank has reached the model's rank. */
export function isModelUnlocked(model: CharacterModel, level: number): boolean {
  return rankIndex(rankForLevel(level).id) >= rankIndex(model.rankId)
}
