import type { ReactNode } from 'react'
import type { QuestStatus, QuestType, Rarity } from '../../lib/api'

export type TagTone = 'neutral' | 'green' | 'gold' | 'danger' | 'info' | 'arcane' | 'ink' | 'solid-green' | 'solid-gold'

const TONE: Record<TagTone, string> = {
  neutral: 'border-ink-600 bg-ink-800/80 text-slate-300',
  green: 'border-gold-500/45 bg-gold-500/10 text-gold-300',
  gold: 'border-reward-500/50 bg-reward-500/10 text-reward-300',
  danger: 'border-danger-500/50 bg-danger-500/10 text-danger-400',
  info: 'border-info-400/45 bg-info-400/10 text-info-400',
  arcane: 'border-arcane-400/45 bg-arcane-400/10 text-arcane-400',
  ink: 'border-parch-ink/30 bg-parch-ink/[0.85] text-parch-50',
  'solid-green': 'border-transparent bg-gold-500 text-onAccent',
  'solid-gold': 'border-transparent bg-reward-400 text-[#281a04]',
}

export default function Tag({ tone = 'neutral', className = '', children }: { tone?: TagTone; className?: string; children: ReactNode }) {
  return <span className={`tag ${TONE[tone]} ${className}`}>{children}</span>
}

export const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' }

const RARITY_CLASS: Record<Rarity, string> = {
  common: 'border-rarity-common/50 bg-rarity-common/10 text-rarity-common',
  rare: 'border-rarity-rare/50 bg-rarity-rare/10 text-rarity-rare',
  epic: 'border-rarity-epic/55 bg-rarity-epic/10 text-rarity-epic',
  legendary: 'border-rarity-legendary/60 bg-rarity-legendary/15 text-rarity-legendary',
}

export function RarityTag({ rarity, className = '' }: { rarity: Rarity; className?: string }) {
  return <span className={`tag ${RARITY_CLASS[rarity]} ${className}`}>{RARITY_LABEL[rarity]}</span>
}

/** The border colour for something of this rarity, for frames and slots. */
export function rarityBorder(rarity: Rarity): string {
  return {
    common: 'border-rarity-common/35',
    rare: 'border-rarity-rare/55',
    epic: 'border-rarity-epic/60',
    legendary: 'border-rarity-legendary/70',
  }[rarity]
}

export const QUEST_TYPE_LABEL: Record<QuestType, string> = {
  monthly: 'Monthly quest',
  weekly: 'Weekly quest',
  daily: 'Daily quest',
  club: 'Club quest',
  challenge: 'Challenge',
  optional: 'Optional',
}

export function QuestTypeTag({ type, onParchment = false }: { type: QuestType; onParchment?: boolean }) {
  if (onParchment) return <Tag tone="ink">{QUEST_TYPE_LABEL[type]}</Tag>
  const tone: TagTone = type === 'monthly' ? 'gold' : type === 'challenge' ? 'danger' : type === 'club' ? 'arcane' : type === 'daily' ? 'info' : 'neutral'
  return <Tag tone={tone}>{QUEST_TYPE_LABEL[type]}</Tag>
}

export const QUEST_STATUS_LABEL: Record<QuestStatus, string> = {
  locked: 'Locked',
  upcoming: 'Upcoming',
  active: 'Active',
  in_progress: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
  expired: 'Expired',
}

export function QuestStatusTag({ status }: { status: QuestStatus }) {
  const tone: TagTone =
    status === 'completed' ? 'solid-green' : status === 'in_progress' ? 'green' : status === 'active' ? 'green' : status === 'failed' || status === 'expired' ? 'danger' : status === 'locked' ? 'neutral' : 'info'
  return <Tag tone={tone}>{QUEST_STATUS_LABEL[status]}</Tag>
}
