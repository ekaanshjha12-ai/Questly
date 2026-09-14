import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bell,
  CheckCheck,
  Crown,
  Flame,
  Gift,
  Mail,
  Megaphone,
  ScrollText,
  ShieldX,
  Swords,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { game, type ChronicleEntry } from '../../lib/api'
import { useGame } from '../../game/GameProvider'
import { useRouter } from '../../app/router'
import { PageHeader } from '../../app/AppShell'
import Button from '../../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import { timeAgo } from '../../lib/social'

const STYLE: Record<string, { icon: LucideIcon; label: string; tone: string }> = {
  challenge_received: { icon: Swords, label: 'New challenge', tone: 'text-reward-400 border-reward-500/40 bg-reward-500/10' },
  challenge_accepted: { icon: Swords, label: 'Challenge accepted', tone: 'text-gold-400 border-gold-500/40 bg-gold-500/10' },
  challenge_rejected: { icon: ShieldX, label: 'Challenge declined', tone: 'text-slate-300 border-ink-600 bg-ink-800' },
  challenge_completed: { icon: Trophy, label: 'Duel result', tone: 'text-reward-400 border-reward-500/40 bg-reward-500/10' },
  challenge_expired: { icon: Swords, label: 'Challenge expired', tone: 'text-slate-300 border-ink-600 bg-ink-800' },
  quest_completed: { icon: ScrollText, label: 'Quest complete', tone: 'text-gold-400 border-gold-500/40 bg-gold-500/10' },
  achievement: { icon: Trophy, label: 'Achievement unlocked', tone: 'text-gold-400 border-gold-500/40 bg-gold-500/10' },
  level_up: { icon: Crown, label: 'Level up', tone: 'text-reward-400 border-reward-500/40 bg-reward-500/10' },
  item_unlocked: { icon: Gift, label: 'Reward unlocked', tone: 'text-arcane-400 border-arcane-400/40 bg-arcane-400/10' },
  streak: { icon: Flame, label: 'Streak', tone: 'text-[#f08a3c] border-[#f08a3c]/40 bg-[#f08a3c]/10' },
  club_invitation: { icon: Users, label: 'Club invitation', tone: 'text-arcane-400 border-arcane-400/40 bg-arcane-400/10' },
  club_announcement: { icon: Megaphone, label: 'Club announcement', tone: 'text-arcane-400 border-arcane-400/40 bg-arcane-400/10' },
  club_mandatory: { icon: Users, label: 'Club quest', tone: 'text-danger-400 border-danger-500/40 bg-danger-500/10' },
  club_joined: { icon: Users, label: 'Club', tone: 'text-gold-400 border-gold-500/40 bg-gold-500/10' },
  club_removed: { icon: Users, label: 'Club', tone: 'text-danger-400 border-danger-500/40 bg-danger-500/10' },
  club_request: { icon: Users, label: 'Club', tone: 'text-arcane-400 border-arcane-400/40 bg-arcane-400/10' },
  message: { icon: Mail, label: 'New message', tone: 'text-info-400 border-info-400/40 bg-info-400/10' },
  world_event: { icon: Megaphone, label: 'World event', tone: 'text-reward-400 border-reward-500/40 bg-reward-500/10' },
  system: { icon: Bell, label: 'Questly', tone: 'text-slate-300 border-ink-600 bg-ink-800' },
}

/**
 * The Chronicle Log: challenges, results, level-ups, unlocks, messages and
 * club news, newest first. Opening an entry marks it read and goes to what it
 * is about.
 */
export default function ChronicleLogScreen() {
  const { setUnread } = useGame()
  const { navigate } = useRouter()
  const [entries, setEntries] = useState<ChronicleEntry[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(
    async (before?: number) => {
      setLoading(true)
      try {
        const page = await game.notifications(before)
        setEntries((list) => (before ? [...(list ?? []), ...page.notifications] : page.notifications))
        setMore(page.more)
        setUnread(page.unread)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load the Chronicle Log.')
      } finally {
        setLoading(false)
      }
    },
    [setUnread],
  )

  useEffect(() => {
    void load()
  }, [load])

  async function open(entry: ChronicleEntry) {
    if (!entry.read) {
      setEntries((list) => list?.map((e) => (e.id === entry.id ? { ...e, read: true } : e)) ?? null)
      game
        .markRead([entry.id])
        .then(({ unread }) => setUnread(unread))
        .catch(() => undefined)
    }
    if (entry.link) navigate(entry.link)
  }

  async function markAll() {
    setEntries((list) => list?.map((e) => ({ ...e, read: true })) ?? null)
    try {
      const { unread } = await game.markRead()
      setUnread(unread)
    } catch {
      void load()
    }
  }

  const unread = entries?.filter((e) => !e.read).length ?? 0

  return (
    <div>
      <PageHeader
        title="Chronicle Log"
        subtitle="Alerts, results and news"
        actions={
          unread > 0 ? (
            <Button variant="secondary" size="sm" icon={CheckCheck} onClick={markAll}>
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {error && !entries && <ErrorState message={error} onRetry={() => void load()} />}
      {!entries && !error && <LoadingState lines={4} label="Loading the Chronicle Log" />}
      {entries && entries.length === 0 && (
        <EmptyState icon={ScrollText} title="Nothing recorded yet" body="Challenges, level-ups, unlocks and messages will be written here as they happen." />
      )}

      {entries && entries.length > 0 && (
        <>
          <p className="eyebrow mb-3">System notifications</p>
          <ul className="space-y-2">
            {entries.map((entry, i) => {
              const style = STYLE[entry.kind] ?? STYLE.system
              const Icon = style.icon
              return (
                <motion.li key={entry.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                  <button
                    type="button"
                    onClick={() => void open(entry)}
                    className={`panel flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:border-ink-500 ${entry.read ? 'opacity-75' : ''}`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${style.tone}`}>
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${style.tone.split(' ')[0]}`}>{style.label}</span>
                        <span className="ml-auto shrink-0 text-[10px] text-slate-500">{timeAgo(entry.createdAt)}</span>
                      </span>
                      <span className="mt-0.5 block text-sm font-semibold text-slate-100">{entry.title}</span>
                      {entry.body && <span className="mt-0.5 block text-xs leading-snug text-slate-400">{entry.body}</span>}
                    </span>
                    {!entry.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-reward-400" aria-label="Unread" />}
                  </button>
                </motion.li>
              )
            })}
          </ul>
          {more && (
            <Button variant="secondary" block className="mt-4" loading={loading} onClick={() => void load(entries[entries.length - 1]?.id)}>
              Older entries
            </Button>
          )}
        </>
      )}
    </div>
  )
}
