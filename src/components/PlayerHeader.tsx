import { Flame, Coins, Camera } from 'lucide-react'
import type { Player, StreakState } from '../types'
import type { Appearance } from '../lib/appearance'
import type { LevelInfo } from '../lib/leveling'
import Avatar3D from './Avatar3D'

interface Props {
  player: Player
  levelInfo: LevelInfo
  streak: StreakState
  appearance: Appearance
  onOpenAvatar?: () => void
}

export default function PlayerHeader({ player, levelInfo, streak, appearance, onOpenAvatar }: Props) {
  // A locked level means the XP requirement is already met, so the bar reads
  // full rather than wrapping around into the next level's progress.
  const pct = levelInfo.awaitingProof
    ? 100
    : Math.min(100, Math.round((levelInfo.xpIntoLevel / levelInfo.xpForNext) * 100))

  return (
    <div className="rounded-2xl border border-ink-600 bg-ink-850/70 p-4 sm:p-5 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onOpenAvatar}
          disabled={!onOpenAvatar}
          className="flex items-center gap-3 text-left disabled:cursor-default"
        >
          <Avatar3D
            modelUrl={appearance.modelUrl}
            accent={appearance.accent}
            level={levelInfo.level}
            size="md"
          />
          <div>
            <p className="font-display text-base font-semibold text-slate-100">{player.name}</p>
            <p className="text-xs" style={{ color: appearance.accent }}>
              {appearance.rankName} · Level {levelInfo.level}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm text-gold-300">
            <Coins className="h-4 w-4" />
            <span className="font-semibold">{player.coins}</span>
          </div>
          <div className={`flex items-center gap-1.5 text-sm ${streak.current > 0 ? 'text-ember-400' : 'text-slate-500'}`}>
            <Flame className={`h-4 w-4 ${streak.current > 0 ? 'fill-ember-500/40' : ''}`} />
            <span className="font-semibold">{streak.current}</span>
            <span className="text-xs text-slate-500">day streak</span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-[11px] text-slate-400 mb-1">
          <span>XP</span>
          <span>
            {levelInfo.awaitingProof ? 'Ready to advance' : `${levelInfo.xpIntoLevel} / ${levelInfo.xpForNext}`}
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink-700">
          <div
            className="h-full rounded-full shimmer-bar animate-shimmer transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        {levelInfo.awaitingProof && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-gold-300">
            <Camera className="h-3 w-3 shrink-0" />
            Level {levelInfo.level + 1} is waiting — verify{' '}
            {levelInfo.proofsNeeded === 1 ? '1 more quest' : `${levelInfo.proofsNeeded} more quests`} with a
            photo to claim it.
          </p>
        )}
      </div>
    </div>
  )
}
