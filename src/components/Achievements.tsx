import { Lock } from 'lucide-react'

interface AchievementView {
  id: string
  title: string
  description: string
  icon: string
  unlockedAt: string | null
}

interface Props {
  achievements: AchievementView[]
}

export default function Achievements({ achievements }: Props) {
  const unlockedCount = achievements.filter((a) => a.unlockedAt).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-slate-100">Achievements</h2>
        <span className="text-xs text-slate-400">
          {unlockedCount}/{achievements.length} unlocked
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {achievements.map((a) => {
          const unlocked = Boolean(a.unlockedAt)
          return (
            <div
              key={a.id}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                unlocked ? 'border-gold-500/40 bg-gold-500/5' : 'border-ink-600 bg-ink-800/40'
              }`}
            >
              <span className={`text-2xl ${unlocked ? '' : 'grayscale opacity-40'}`}>{a.icon}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${unlocked ? 'text-gold-300' : 'text-slate-400'}`}>{a.title}</p>
                <p className="text-[11px] text-slate-500">{a.description}</p>
              </div>
              {!unlocked && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-600" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
