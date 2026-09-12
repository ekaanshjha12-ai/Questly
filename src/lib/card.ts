import type { AppState, CardDesign, CardField, CardItem, CardStroke } from '../types'
import type { AuthUser, PublicPlayer } from './api'
import { avatarUrl, playerAvatarUrl } from './api'
import { rankForLevel } from '../data/ranks'
import { birthdayLabel } from './profile'

/**
 * The profile card: its backgrounds, its default layout, and the limits that
 * keep a decorated card a reasonable size.
 */

export const CARD_W = 1000
export const CARD_H = 1400

export interface CardBackground {
  id: string
  name: string
  css: string
  /** Text colour that reads on it. */
  ink: string
  /** Quieter text, for secondary lines. */
  soft: string
}

/** 'rank' is resolved per player, since it is drawn in their rank's colour. */
export const CARD_BACKGROUNDS: CardBackground[] = [
  { id: 'rank', name: 'Your rank', css: '', ink: '#ffffff', soft: 'rgba(255,255,255,0.72)' },
  { id: 'midnight', name: 'Midnight', css: 'linear-gradient(160deg, #262626 0%, #0a0a0a 100%)', ink: '#ffffff', soft: 'rgba(255,255,255,0.65)' },
  { id: 'emerald', name: 'Emerald', css: 'linear-gradient(160deg, #4ade80 0%, #15803d 100%)', ink: '#052e16', soft: 'rgba(5,46,22,0.72)' },
  { id: 'paper', name: 'Paper', css: 'linear-gradient(160deg, #ffffff 0%, #e5e5e5 100%)', ink: '#0a0a0a', soft: 'rgba(10,10,10,0.6)' },
  { id: 'sunset', name: 'Sunset', css: 'linear-gradient(160deg, #fbbf24 0%, #f97316 45%, #db2777 100%)', ink: '#ffffff', soft: 'rgba(255,255,255,0.78)' },
  { id: 'ocean', name: 'Ocean', css: 'linear-gradient(160deg, #38bdf8 0%, #1d4ed8 100%)', ink: '#ffffff', soft: 'rgba(255,255,255,0.75)' },
  { id: 'grape', name: 'Grape', css: 'linear-gradient(160deg, #c084fc 0%, #6d28d9 100%)', ink: '#ffffff', soft: 'rgba(255,255,255,0.75)' },
  {
    id: 'holo',
    name: 'Holo',
    css: 'linear-gradient(135deg, #fbcfe8 0%, #bfdbfe 30%, #bbf7d0 55%, #fef08a 80%, #fbcfe8 100%)',
    ink: '#111827',
    soft: 'rgba(17,24,39,0.62)',
  },
]

export function findBackground(id: string, rankColor: string): CardBackground {
  const bg = CARD_BACKGROUNDS.find((b) => b.id === id) ?? CARD_BACKGROUNDS[0]
  if (bg.id !== 'rank') return bg
  return { ...bg, css: `linear-gradient(160deg, ${rankColor} 0%, #0a0a0a 115%)` }
}

export const FIELD_LABELS: Record<CardField, string> = {
  avatar: 'Picture',
  name: 'Name',
  username: 'Username',
  bio: 'Bio',
  rank: 'Rank',
  level: 'Level',
  xp: 'XP',
  birthday: 'Birthday',
  joined: 'Joined',
  email: 'Email',
}

export const STICKERS = [
  '⭐', '🔥', '⚔️', '🛡️', '👑', '🏆', '💎', '🌟', '✨', '⚡', '🌿', '🍀',
  '🌸', '🌙', '☀️', '🌈', '🎯', '📚', '🎧', '🎮', '🏃', '💪', '🧠', '❤️',
  '💚', '🖤', '🤍', '😎', '🥇', '🚀', '🪄', '🐉',
]

export const INK_COLORS = ['#ffffff', '#0a0a0a', '#4ade80', '#facc15', '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#38bdf8']

let seq = 0
export function itemId(): string {
  seq += 1
  return `${Date.now().toString(36)}-${seq}-${Math.random().toString(36).slice(2, 6)}`
}

function field(field: CardField, x: number, y: number, scale = 1): CardItem {
  return { id: `f-${field}`, kind: 'field', field, x, y, scale, rotate: 0 }
}

/** Everything they gave us, laid out like a player card. Email is left off:
 * it is the key to the account, and a card is made to be shown around. It is one
 * tap away under Add if they want it. */
export function defaultCard(): CardDesign {
  return {
    background: 'rank',
    items: [
      field('rank', 0.5, 0.075),
      field('avatar', 0.5, 0.29),
      field('name', 0.5, 0.5),
      field('username', 0.5, 0.565),
      field('bio', 0.5, 0.68),
      field('level', 0.24, 0.85),
      field('xp', 0.5, 0.85),
      field('birthday', 0.76, 0.85),
      field('joined', 0.5, 0.945, 0.85),
    ],
    strokes: [],
  }
}

/** The default layout for someone else's card: no birthday, which is never
 * shared, so level and XP take the row between them instead of leaving a gap. */
export function publicDefaultCard(): CardDesign {
  const design = defaultCard()
  return {
    ...design,
    items: design.items
      .filter((i) => !(i.kind === 'field' && i.field === 'birthday'))
      .map((i) => (i.kind === 'field' && i.field === 'level' ? { ...i, x: 0.34 } : i.kind === 'field' && i.field === 'xp' ? { ...i, x: 0.66 } : i)),
  }
}

/* --- limits --------------------------------------------------------------- */

const MAX_ITEMS = 40
const MAX_STROKES = 80
const MAX_POINTS = 9000
const MAX_TEXT = 60

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo))

/**
 * Keeps a design within bounds before it is saved.
 *
 * The card rides along in every state save, so an unbounded drawing would slow
 * every one of them. When the stroke budget runs out the oldest lines go first
 * — the ones just drawn are the ones someone is looking at.
 */
export function tidyCard(design: CardDesign): CardDesign {
  const items = design.items.slice(-MAX_ITEMS).map((item) => ({
    ...item,
    x: clamp(item.x, 0, 1),
    y: clamp(item.y, 0, 1),
    scale: clamp(item.scale, 0.3, 4),
    rotate: clamp(item.rotate, -180, 180),
    ...(item.kind === 'text' ? { text: item.text.slice(0, MAX_TEXT) } : {}),
  })) as CardItem[]

  let budget = MAX_POINTS * 2
  const strokes: CardStroke[] = []
  for (const stroke of design.strokes.slice(-MAX_STROKES).reverse()) {
    if (stroke.points.length > budget) break
    budget -= stroke.points.length
    strokes.unshift(stroke)
  }

  return { background: design.background, items, strokes }
}

/* --- what the card shows -------------------------------------------------- */

export interface CardData {
  name: string
  username: string | null
  bio: string | null
  birthday: string | null
  joined: string
  email: string
  xp: number
  level: number
  rankName: string
  rankIcon: string
  rankColor: string
  avatar: string | null
}

export function cardData(state: AppState, user: AuthUser, avatarOverride?: string | null): CardData {
  const rank = rankForLevel(state.progression.level)
  return {
    name: state.player.name || user.displayName || 'Adventurer',
    username: user.username ?? null,
    bio: user.bio ?? null,
    birthday: birthdayLabel(user.birthdate),
    joined: new Date(state.player.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
    email: user.email,
    xp: state.player.xp,
    level: state.progression.level,
    rankName: rank.name,
    rankIcon: rank.icon,
    rankColor: rank.color,
    avatar: avatarOverride ?? avatarUrl(user.avatarVersion),
  }
}

/** Someone else's card. The server has already taken email and birthday off
 * it; these stay empty here too, so nothing private can be drawn even if a
 * design still asks for it. */
export function publicCardData(player: PublicPlayer): CardData {
  const rank = rankForLevel(player.level)
  return {
    name: player.name,
    username: player.username,
    bio: player.bio,
    birthday: null,
    joined: new Date(player.joined).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
    email: '',
    xp: player.xp,
    level: player.level,
    rankName: rank.name,
    rankIcon: rank.icon,
    rankColor: rank.color,
    avatar: playerAvatarUrl(player.username, player.avatarVersion),
  }
}
