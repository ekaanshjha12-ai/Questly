import { BookOpen, Cpu, Crown, Dumbbell, Hammer, Library, Lightbulb, Palette, Sparkles, type LucideIcon } from 'lucide-react'

/**
 * The Questly world: where each region stands on the map, what it is for, and
 * where entering it takes you. Every destination is a real part of Questly;
 * each region's weekly quests and its lock come from the server, which keeps
 * the same ids — only the places and names here are the world's.
 *
 * Positions are pixels on the painted map (WORLD_W × WORLD_H), so markers stay
 * on their landmarks at any zoom.
 */

export const WORLD_W = 1536
export const WORLD_H = 1024

export type RegionId =
  | 'focus_sanctum'
  | 'scholars_sanctuary'
  | 'builders_district'
  | 'creators_quarter'
  | 'training_grounds'
  | 'archive'
  | 'digital_workshop'
  | 'innovation_district'
  | 'elite_region'

export interface RegionMeta {
  name: string
  tagline: string
  description: string
  destination: { to: string; label: string }
  extra?: { to: string; label: string }
  accent: string
  icon: LucideIcon
  /** The marker's anchor on the map. */
  point: { x: number; y: number }
  /** The land the region covers, veiled in mist while it is locked. */
  area: { cx: number; cy: number; rx: number; ry: number }
}

export const REGION_META: Record<RegionId, RegionMeta> = {
  focus_sanctum: {
    name: 'Verdant Woods',
    tagline: 'Focus deeper',
    description: 'Ancient trees and quiet paths. Every minute of focus timed here counts toward quests, duels and events.',
    destination: { to: '/timer', label: 'Open the timer' },
    extra: { to: '/sounds', label: 'Ambient sounds' },
    accent: '#4ee39a',
    icon: Sparkles,
    point: { x: 215, y: 250 },
    area: { cx: 230, cy: 250, rx: 230, ry: 170 },
  },
  scholars_sanctuary: {
    name: 'Mistveil Swamp',
    tagline: 'Embrace the grind',
    description: 'Lanterns burn late over the marsh. Flashcards, explaining it back, and the patience to learn something properly.',
    destination: { to: '/study', label: 'Open Study' },
    accent: '#62d6c4',
    icon: BookOpen,
    point: { x: 250, y: 610 },
    area: { cx: 250, cy: 600, rx: 240, ry: 190 },
  },
  training_grounds: {
    name: 'Frostpeak',
    tagline: 'Discipline builds legends',
    description: 'Only steady steps reach the top. Habits are drilled here, and rivals are met in duels.',
    destination: { to: '/habits', label: 'Open Habits' },
    extra: { to: '/challenges', label: 'Duels' },
    accent: '#9fd6ff',
    icon: Dumbbell,
    point: { x: 610, y: 170 },
    area: { cx: 660, cy: 140, rx: 240, ry: 120 },
  },
  builders_district: {
    name: 'Golden Plains',
    tagline: 'Small steps, bigger days',
    description: 'Fields planted row by row. Plan the week and build big things one day at a time.',
    destination: { to: '/planner', label: 'Open the Planner' },
    extra: { to: '/goals', label: 'Your goals' },
    accent: '#e9c55a',
    icon: Hammer,
    point: { x: 1010, y: 610 },
    area: { cx: 1030, cy: 580, rx: 190, ry: 130 },
  },
  creators_quarter: {
    name: 'Coastal Crown',
    tagline: 'Community flows',
    description: 'The busiest harbour in Questly, where makers bring their work to show on the Adventure Log.',
    destination: { to: '/social', label: 'Open the Adventure Log' },
    extra: { to: '/profile/card', label: 'Design your card' },
    accent: '#ff8f7a',
    icon: Palette,
    point: { x: 600, y: 745 },
    area: { cx: 590, cy: 740, rx: 210, ry: 130 },
  },
  archive: {
    name: 'The Lost Ruins',
    tagline: 'Your legend, carved in stone',
    description: 'Old halls that remember every deed. Your achievements and every reward you have earned are kept here.',
    destination: { to: '/profile/achievements', label: 'Hall of Achievements' },
    extra: { to: '/profile/history', label: 'XP history' },
    accent: '#cdb690',
    icon: Library,
    point: { x: 1365, y: 690 },
    area: { cx: 1360, cy: 640, rx: 170, ry: 150 },
  },
  digital_workshop: {
    name: 'Emberlands',
    tagline: 'Forge a better you',
    description: 'The forges never cool. Turn a goal into a dated plan in minutes with the AI Planner.',
    destination: { to: '/ai-plan', label: 'Open the AI Planner' },
    accent: '#ff7d45',
    icon: Cpu,
    point: { x: 1050, y: 185 },
    area: { cx: 1085, cy: 150, rx: 250, ry: 160 },
  },
  innovation_district: {
    name: 'Sunscorch',
    tagline: 'Higher goals await',
    description: 'Monuments raised by those who aimed high. Chart a new goal worth the climb.',
    destination: { to: '/goals', label: 'Chart a new goal' },
    accent: '#f3c877',
    icon: Lightbulb,
    point: { x: 1235, y: 400 },
    area: { cx: 1270, cy: 370, rx: 270, ry: 150 },
  },
  elite_region: {
    name: 'The Summit',
    tagline: 'Reach further',
    description: 'Islands above the clouds, held by the most dedicated. The Hall of Legends is here.',
    destination: { to: '/leaderboard', label: 'Hall of Legends' },
    accent: '#e8b84a',
    icon: Crown,
    point: { x: 1405, y: 170 },
    area: { cx: 1400, cy: 110, rx: 160, ry: 115 },
  },
}

export const REGION_ORDER: RegionId[] = [
  'focus_sanctum',
  'scholars_sanctuary',
  'training_grounds',
  'builders_district',
  'creators_quarter',
  'archive',
  'digital_workshop',
  'innovation_district',
  'elite_region',
]

export function regionName(id: string): string {
  return REGION_META[id as RegionId]?.name ?? 'The world'
}

/** The hall at the centre of the map, where every road meets. */
export const GUILD_POINT = { x: 745, y: 470 }

/** The far islands, where lands not yet charted will open. */
export const HORIZON_POINT = { x: 1100, y: 870 }

/** Lanterns, lighthouses and forge fires that glow after dark: x, y, radius, colour. */
export const NIGHT_LIGHTS: [number, number, number, string][] = [
  [745, 380, 46, '120,190,255'],
  [620, 70, 26, '150,200,255'],
  [1080, 170, 120, '255,110,40'],
  [1115, 60, 40, '255,90,40'],
  [405, 765, 20, '255,210,120'],
  [742, 752, 20, '255,210,120'],
  [637, 830, 18, '255,210,120'],
  [575, 690, 34, '255,180,90'],
  [600, 585, 26, '255,180,90'],
  [170, 265, 30, '255,180,90'],
  [150, 470, 22, '160,255,170'],
  [345, 625, 24, '160,255,170'],
  [230, 720, 20, '160,255,170'],
  [985, 520, 26, '255,180,90'],
  [1165, 705, 26, '255,180,90'],
  [1080, 830, 22, '255,180,90'],
  [1345, 560, 22, '255,200,120'],
  [1250, 330, 22, '255,200,120'],
]
