import type { ClubTierId } from '../lib/api'
import type { RegionId } from './world'
import druidAltar from '../assets/buildings/druid-altar.webp'
import druidAltarSm from '../assets/buildings/druid-altar-sm.webp'
import forestInn from '../assets/buildings/forest-inn.webp'
import forestInnSm from '../assets/buildings/forest-inn-sm.webp'
import herbalistHut from '../assets/buildings/herbalist-hut.webp'
import herbalistHutSm from '../assets/buildings/herbalist-hut-sm.webp'
import hunterShack from '../assets/buildings/hunter-shack.webp'
import hunterShackSm from '../assets/buildings/hunter-shack-sm.webp'
import rangerLodge from '../assets/buildings/ranger-lodge.webp'
import rangerLodgeSm from '../assets/buildings/ranger-lodge-sm.webp'
import timberHall from '../assets/buildings/timber-hall.webp'
import timberHallSm from '../assets/buildings/timber-hall-sm.webp'
import watermill from '../assets/buildings/watermill.webp'
import watermillSm from '../assets/buildings/watermill-sm.webp'
import adobeMarketSm from '../assets/buildings/adobe-market-sm.webp'
import bazaarStallSm from '../assets/buildings/bazaar-stall-sm.webp'
import caliphPalaceSm from '../assets/buildings/caliph-palace-sm.webp'
import guildHallSm from '../assets/buildings/guild-hall-sm.webp'
import nomadShelterSm from '../assets/buildings/nomad-shelter-sm.webp'
import oasisInnSm from '../assets/buildings/oasis-inn-sm.webp'
import sandstoneKeepSm from '../assets/buildings/sandstone-keep-sm.webp'

/**
 * The buildings clubs stand in. A club's building is chosen by the land it
 * stands on and how far it has grown — a hut becomes a lodge, an inn, and
 * finally a landmark — and is the same every time for the same club.
 *
 * Desert pictures only exist small so far; they are never shown larger than
 * they were made.
 */

export interface BuildingArt {
  id: string
  name: string
  /** For the club's own page. */
  image: string
  /** For the map and lists. */
  thumb: string
  /** The largest size, in CSS pixels, the picture holds up at. */
  maxSize: number
}

const building = (id: string, name: string, image: string, thumb: string, maxSize = 160): BuildingArt => ({ id, name, image, thumb, maxSize })

export const BUILDINGS = {
  'herbalist-hut': building('herbalist-hut', 'Herbalist Hut', herbalistHut, herbalistHutSm),
  'hunter-shack': building('hunter-shack', 'Hunter Shack', hunterShack, hunterShackSm),
  'ranger-lodge': building('ranger-lodge', 'Ranger Lodge', rangerLodge, rangerLodgeSm),
  watermill: building('watermill', 'Watermill', watermill, watermillSm),
  'forest-inn': building('forest-inn', 'Forest Inn', forestInn, forestInnSm),
  'timber-hall': building('timber-hall', 'Timber Hall', timberHall, timberHallSm),
  'druid-altar': building('druid-altar', 'Druid Altar', druidAltar, druidAltarSm),
  'nomad-shelter': building('nomad-shelter', 'Nomad Shelter', nomadShelterSm, nomadShelterSm, 72),
  'bazaar-stall': building('bazaar-stall', 'Bazaar Stall', bazaarStallSm, bazaarStallSm, 72),
  'oasis-inn': building('oasis-inn', 'Oasis Inn', oasisInnSm, oasisInnSm, 72),
  'adobe-market': building('adobe-market', 'Adobe Market', adobeMarketSm, adobeMarketSm, 72),
  'guild-hall': building('guild-hall', 'Guild Hall', guildHallSm, guildHallSm, 72),
  'sandstone-keep': building('sandstone-keep', 'Sandstone Keep', sandstoneKeepSm, sandstoneKeepSm, 72),
  'caliph-palace': building('caliph-palace', 'Caliph Palace', caliphPalaceSm, caliphPalaceSm, 72),
} satisfies Record<string, BuildingArt>

type BuildingId = keyof typeof BUILDINGS
type Biome = 'forest' | 'desert'

export const TIER_ORDER: ClubTierId[] = ['workshop', 'hall', 'headquarters', 'landmark']

/** The club level each tier starts at — mirrors clubTier in server/game/clubs.js. */
export const TIER_LEVEL: Record<ClubTierId, number> = { workshop: 1, hall: 5, headquarters: 10, landmark: 15 }

const LADDER: Record<Biome, Record<ClubTierId, BuildingId[]>> = {
  forest: {
    workshop: ['herbalist-hut', 'hunter-shack'],
    hall: ['ranger-lodge', 'watermill'],
    headquarters: ['forest-inn', 'timber-hall'],
    landmark: ['druid-altar'],
  },
  desert: {
    workshop: ['nomad-shelter', 'bazaar-stall'],
    hall: ['oasis-inn', 'adobe-market'],
    headquarters: ['guild-hall', 'sandstone-keep'],
    landmark: ['caliph-palace'],
  },
}

const BIOME: Partial<Record<RegionId, Biome>> = { innovation_district: 'desert' }

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pick(slug: string, region: string, tier: ClubTierId): BuildingArt {
  const options = LADDER[BIOME[region as RegionId] ?? 'forest'][tier] ?? LADDER.forest.workshop
  return BUILDINGS[options[hash(slug) % options.length]]
}

/** The building a club stands in now. */
export function clubHall(club: { slug: string; region: string; tier: ClubTierId }): BuildingArt {
  return pick(club.slug, club.region, club.tier)
}

/** What the club's building becomes next, and at which level — or null for a landmark. */
export function nextHall(club: { slug: string; region: string; tier: ClubTierId }): { tier: ClubTierId; level: number; art: BuildingArt } | null {
  const next = TIER_ORDER[TIER_ORDER.indexOf(club.tier) + 1]
  return next ? { tier: next, level: TIER_LEVEL[next], art: pick(club.slug, club.region, next) } : null
}
