import type { CharacterId } from '../types'

/** The two starting bodies picked during onboarding. Everything beyond these is
 * bought from the rank shop — see `data/ranks.ts`. */
export interface CharacterDef {
  id: CharacterId
  name: string
  blurb: string
  modelUrl: string
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'female',
    name: 'The Wanderer',
    blurb: 'Street-ready and quick on her feet.',
    modelUrl: '/models/avatar_female.glb',
  },
  {
    id: 'male',
    name: 'The Explorer',
    blurb: 'Goggles up, always tinkering.',
    modelUrl: '/models/avatar_male.glb',
  },
]

export function characterById(id: CharacterId): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]
}
