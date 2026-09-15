import type { ClubTierId } from '../lib/api'
import type { RegionId } from './world'

/**
 * The buildings clubs stand in. A club's building is chosen by the land it
 * stands on and how far it has grown — a hut becomes a hall, a stronghold, and
 * finally a landmark — and is the same every time for the same club.
 *
 * Every region has its own ladder, drawn from the look of that land on the
 * world map: timber in the woods, stilts in the swamp, snow on Frostpeak,
 * lava in the Emberlands, sandstone under the Sunscorch sun.
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

const NAMES = {
  // Verdant Woods
  'herbalist-hut': 'Herbalist Hut',
  'hunter-shack': 'Hunter Shack',
  'mushroom-cottage': 'Mushroom Cottage',
  'ranger-lodge': 'Ranger Lodge',
  watermill: 'Watermill',
  'forest-inn': 'Forest Inn',
  'timber-hall': 'Timber Hall',
  'druid-altar': 'Druid Altar',
  'elder-tree-shrine': 'Elder Tree Shrine',
  // Mistveil Swamp
  'stilt-hut': 'Stilt Hut',
  'potion-shack': 'Potion Shack',
  'bog-sentry': 'Bog Sentry',
  'alchemist-workshop': "Alchemist's Workshop",
  'sunken-shrine': 'Sunken Shrine',
  // Frostpeak
  'trappers-hut': "Trapper's Hut",
  'log-cabin': 'Log Cabin',
  'snowy-cottage': 'Snowy Cottage',
  'snow-yurt': 'Snow Yurt',
  'frosted-mug': 'Frosted Mug Tavern',
  'snow-smithy': 'Snow Smithy',
  'winter-chapel': 'Winter Chapel',
  'frost-spire': 'Frost Spire',
  'frost-forge': 'Frost Forge',
  'snowwall-keep': 'Snowwall Keep',
  'ice-citadel': 'Ice Citadel',
  // Golden Plains
  'village-cottage': 'Village Cottage',
  'lookout-tower': 'Lookout Tower',
  windmill: 'Windmill',
  'thatched-tavern': 'Thatched Tavern',
  'palisade-fort': 'Palisade Fort',
  // Coastal Crown
  'lantern-dock': 'Lantern Dock',
  'dockside-forge': 'Dockside Forge',
  'island-keep': 'Island Keep',
  'crown-baths': 'Crown Baths',
  // The Lost Ruins
  'stonemason-yard': "Stonemason's Yard",
  'crystal-mine': 'Crystal Mine',
  'stone-quarry': 'Stone Quarry',
  'ruined-abbey': 'Ruined Abbey',
  // Emberlands
  'geyser-works': 'Geyser Works',
  'lava-mill': 'Lava Mill',
  'fire-shrine': 'Fire Shrine',
  'lava-smelter': 'Lava Smelter',
  'magma-keep': 'Magma Keep',
  'cinder-fortress': 'Cinder Fortress',
  'ember-foundry': 'Ember Foundry',
  'obsidian-stronghold': 'Obsidian Stronghold',
  // Sunscorch
  'nomad-shelter': 'Nomad Shelter',
  'dune-watchtower': 'Dune Watchtower',
  'desert-well': 'Desert Well',
  'bazaar-stall': 'Bazaar Stall',
  'adobe-market': 'Adobe Market',
  'oasis-inn': 'Oasis Inn',
  'oasis-spring': 'Oasis Spring',
  'wind-tower': 'Wind Tower',
  'signal-tower': 'Signal Tower',
  'guild-hall': 'Guild Hall',
  'sandstone-keep': 'Sandstone Keep',
  caravanserai: 'Caravanserai',
  'sandstone-fort': 'Sandstone Fort',
  'caliph-palace': 'Caliph Palace',
  'pyramid-shrine': 'Pyramid Shrine',
  'sun-temple': 'Sun Temple',
  'water-palace': 'Water Palace',
  // The Summit
  'peak-cottage': 'Peak Cottage',
  'beacon-tower': 'Beacon Tower',
  'rune-temple': 'Rune Temple',
  'arcane-spire': 'Arcane Spire',
} as const

type BuildingId = keyof typeof NAMES

/** Pictures cut from screenshots smaller than the usual 320 px, by their saved size. */
const SAVED_SIZE: Partial<Record<BuildingId, number>> = {
  'stilt-hut': 168,
  'winter-chapel': 184,
  'frost-spire': 186,
  'oasis-inn': 235,
  'sandstone-keep': 235,
}

// Each picture comes in two sizes: `<id>.webp` (up to 320 px) and `<id>-sm.webp` (112 px).
const FILES = import.meta.glob<string>('../assets/buildings/*.webp', { eager: true, import: 'default' })

export const BUILDINGS = Object.fromEntries(
  (Object.keys(NAMES) as BuildingId[]).map((id) => [
    id,
    {
      id,
      name: NAMES[id],
      image: FILES[`../assets/buildings/${id}.webp`],
      thumb: FILES[`../assets/buildings/${id}-sm.webp`],
      // Sharp at one and a half device pixels to the CSS pixel.
      maxSize: Math.min(160, Math.floor((SAVED_SIZE[id] ?? 320) / 1.5)),
    },
  ]),
) as Record<BuildingId, BuildingArt>

type Biome = 'forest' | 'swamp' | 'snow' | 'plains' | 'coast' | 'ruins' | 'ember' | 'desert' | 'summit'

export const TIER_ORDER: ClubTierId[] = ['workshop', 'hall', 'headquarters', 'landmark']

/** The club level each tier starts at — mirrors clubTier in server/game/clubs.js. */
export const TIER_LEVEL: Record<ClubTierId, number> = { workshop: 1, hall: 5, headquarters: 10, landmark: 15 }

export const LADDER: Record<Biome, Record<ClubTierId, BuildingId[]>> = {
  forest: {
    workshop: ['herbalist-hut', 'hunter-shack', 'mushroom-cottage'],
    hall: ['ranger-lodge', 'watermill'],
    headquarters: ['forest-inn', 'timber-hall'],
    landmark: ['druid-altar', 'elder-tree-shrine'],
  },
  swamp: {
    workshop: ['stilt-hut', 'potion-shack'],
    hall: ['bog-sentry'],
    headquarters: ['alchemist-workshop'],
    landmark: ['sunken-shrine'],
  },
  snow: {
    workshop: ['trappers-hut', 'log-cabin', 'snowy-cottage', 'snow-yurt'],
    hall: ['frosted-mug', 'snow-smithy', 'winter-chapel', 'frost-spire'],
    headquarters: ['frost-forge', 'snowwall-keep'],
    landmark: ['ice-citadel'],
  },
  plains: {
    workshop: ['village-cottage', 'lookout-tower'],
    hall: ['windmill'],
    headquarters: ['thatched-tavern'],
    landmark: ['palisade-fort'],
  },
  coast: {
    workshop: ['lantern-dock'],
    hall: ['dockside-forge'],
    headquarters: ['island-keep'],
    landmark: ['crown-baths'],
  },
  ruins: {
    workshop: ['stonemason-yard'],
    hall: ['crystal-mine'],
    headquarters: ['stone-quarry'],
    landmark: ['ruined-abbey'],
  },
  ember: {
    workshop: ['geyser-works', 'lava-mill'],
    hall: ['fire-shrine', 'lava-smelter'],
    headquarters: ['magma-keep', 'cinder-fortress'],
    landmark: ['ember-foundry', 'obsidian-stronghold'],
  },
  desert: {
    workshop: ['nomad-shelter', 'dune-watchtower', 'desert-well'],
    hall: ['bazaar-stall', 'adobe-market', 'oasis-inn', 'oasis-spring', 'wind-tower', 'signal-tower'],
    headquarters: ['guild-hall', 'sandstone-keep', 'caravanserai', 'sandstone-fort'],
    landmark: ['caliph-palace', 'pyramid-shrine', 'sun-temple', 'water-palace'],
  },
  summit: {
    workshop: ['peak-cottage'],
    hall: ['beacon-tower'],
    headquarters: ['rune-temple'],
    landmark: ['arcane-spire'],
  },
}

export const BIOME: Record<RegionId, Biome> = {
  focus_sanctum: 'forest',
  scholars_sanctuary: 'swamp',
  training_grounds: 'snow',
  builders_district: 'plains',
  creators_quarter: 'coast',
  archive: 'ruins',
  digital_workshop: 'ember',
  innovation_district: 'desert',
  elite_region: 'summit',
}

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
