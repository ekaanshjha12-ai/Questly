import { useEffect, useState } from 'react'
import { Check, Flag, Pencil, Pin, PinOff, Play, ShieldCheck, Timer, Trash2, XCircle } from 'lucide-react'
import type { GameQuest } from '../../lib/api'
import { CATEGORY_LABEL, DIFFICULTY_LABEL, dueLabel, formatMinutes, isTimeable, progressLabel, questIcon } from '../../lib/questFormat'
import { useGame } from '../../game/GameProvider'
import { Sheet, ConfirmDialog } from '../../components/ui/Sheet'
import Button from '../../components/ui/Button'
import { ProgressBar } from '../../components/ui/Bars'
import { QuestStatusTag, QuestTypeTag, RarityTag } from '../../components/ui/Tag'
import { TextInput } from '../../components/ui/Field'
import { messageOf, useToast } from '../../components/ui/Toast'
import { VerifyModalHost } from '../../components/VerifyModal'
import { useSettled } from '../../hooks/useSettled'

/**
 * Everything about one quest, and everything that can be done with it.
 *
 * What a completion is worth depends on how it is shown to have happened:
 * time the server measured and proof it accepted pay in full; a tick is
 * self-reported and counts toward a daily limit. The sheet says so where it
 * matters, rather than surprising anyone afterwards.
 *
 * The timer is offered, never required: a quest can be started, worked on and
 * marked complete without it.
 */
export default function QuestSheet({
  quest,
  onClose,
  onOpenTimer,
  onEdit,
}: {
  quest: GameQuest | null
  onClose: () => void
  onOpenTimer: (quest: GameQuest) => void
  onEdit: (quest: GameQuest) => void
}) {
  const game = useGame()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [amount, setAmount] = useState('1')
  // Minutes are logged in bigger steps than units.
  const kind = quest?.progress.kind
  useEffect(() => setAmount(kind === 'minutes' ? '15' : '1'), [quest?.id, kind])
  const [confirm, setConfirm] = useState<'abandon' | 'delete' | null>(null)
  const [proving, setProving] = useState(false)

  // Always show the freshest copy of the quest from the store.
  const live = quest ? game.snapshot?.quests.find((q) => q.id === quest.id) ?? quest : null
  const caps = game.snapshot?.caps
  // Once started, Mark complete moves up to where Start quest was.
  const settled = useSettled(live?.status, live?.id)

  async function run(key: string, work: () => Promise<unknown>, success?: string) {
    setBusy(key)
    try {
      await work()
      if (success) toast.success(success)
    } catch (err) {
      toast.error('That did not work', messageOf(err))
    } finally {
      setBusy(null)
    }
  }

  if (!live) return <Sheet open={false} onClose={onClose}>{null}</Sheet>

  const Icon = questIcon(live)
  const open = live.status === 'active' || live.status === 'in_progress'
  const editable = live.origin === 'user' || live.origin === 'plan' || live.origin === 'legacy_todo'
  const deletable = editable && live.status !== 'completed' && live.xpPaid === 0
  const due = dueLabel(live.deadlineAt)
  const timeable = isTimeable(live)
  const unit = live.progress.kind === 'minutes' ? 'minutes' : live.progress.unit ?? 'progress'

  return (
    <>
      <Sheet
        open={Boolean(quest)}
        onClose={onClose}
        title={live.title}
        subtitle={live.description ?? undefined}
        size="lg"
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <QuestTypeTag type={live.type} />
            <QuestStatusTag status={live.status} />
            <RarityTag rarity={live.rarity} />
            {live.verified && (
              <span className="tag border-gold-500/45 bg-gold-500/10 text-gold-300">
                <ShieldCheck className="h-3 w-3" /> Verified by {live.verified.by}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Info label="Reward" value={<span className="text-reward-400">+{live.xp} XP</span>} />
            <Info label="Time" value={formatMinutes(live.durationMin)} />
            <Info label="Difficulty" value={DIFFICULTY_LABEL[live.difficulty]} />
            <Info label="Category" value={CATEGORY_LABEL[live.category]} />
          </div>

          <div className="panel p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-ink-600 bg-ink-850 text-gold-400">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-100">{progressLabel(live)}</p>
                <p className="text-xs text-slate-500">
                  {due ?? 'No deadline'}
                  {live.xpPaid > 0 && live.status !== 'completed' ? ` · ${live.xpPaid} XP earned so far` : ''}
                </p>
              </div>
              <span className="font-display text-lg font-bold text-slate-100">{live.progress.percent}%</span>
            </div>
            <ProgressBar percent={live.progress.percent} className="mt-3" />

            {live.progress.kind === 'milestones' && live.progress.milestones && (
              <ul className="mt-4 space-y-1.5">
                {live.progress.milestones.map((m) => (
                  <li key={m.index}>
                    <button
                      type="button"
                      disabled={!open || busy !== null}
                      onClick={() => run(`m${m.index}`, () => game.setMilestone(live.id, m.index, !m.done))}
                      className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl border px-3 text-left text-sm transition-colors ${
                        m.done ? 'border-gold-500/40 bg-gold-500/10 text-slate-200' : 'border-ink-600 bg-ink-900 text-slate-300 hover:border-ink-500'
                      }`}
                      aria-pressed={m.done}
                    >
                      <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${m.done ? 'border-gold-500 bg-gold-500 text-onAccent' : 'border-ink-500'}`}>
                        {m.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                      <span className={m.done ? 'line-through decoration-slate-500' : ''}>{m.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {(live.progress.kind === 'count' || live.progress.kind === 'minutes') && open && (
              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  const delta = Math.round(Number(amount))
                  if (!Number.isFinite(delta) || delta < 1) {
                    toast.error('Log at least 1.')
                    return
                  }
                  void run('log', () => game.logProgress(live.id, delta))
                }}
              >
                <TextInput aria-label={`Amount of ${unit}`} type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="!w-28" />
                <Button type="submit" variant="secondary" loading={busy === 'log'} className="flex-1">
                  Log {unit}
                </Button>
              </form>
            )}
          </div>

          {open && (
            <div className="space-y-2">
              {timeable && live.status === 'active' && (
                <Button block icon={Play} loading={busy === 'start'} onClick={() => run('start', () => game.startQuest(live.id), 'Quest started')}>
                  Start quest
                </Button>
              )}
              {timeable && (
                <Button
                  block
                  variant={live.status === 'in_progress' ? 'primary' : 'secondary'}
                  icon={Check}
                  loading={busy === 'complete'}
                  disabled={!settled}
                  onClick={() => run('complete', () => game.completeQuest(live.id))}
                >
                  Mark complete
                </Button>
              )}
              {timeable && (
                <Button block variant="secondary" icon={Timer} onClick={() => onOpenTimer(live)}>
                  Use the timer <span className="normal-case tracking-normal text-slate-400">(optional)</span>
                </Button>
              )}
              <p className="text-center text-[11px] text-slate-500">
                Ticked or logged progress earns up to {caps?.selfReportedXpDaily ?? 300} XP a day
                {caps ? ` (${caps.selfReportedXpLeft} left today)` : ''}. Time the timer measures and accepted proof are never capped.
              </p>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {!live.verified && (open || live.status === 'completed') && (
              <Button variant="secondary" icon={ShieldCheck} onClick={() => setProving(true)}>
                Verify with proof
              </Button>
            )}
            {open && (
              <Button
                variant="secondary"
                icon={live.pinned ? PinOff : Pin}
                loading={busy === 'pin'}
                onClick={() => run('pin', () => game.pinQuest(live.id, !live.pinned), live.pinned ? 'Unpinned' : 'Set as your next quest')}
              >
                {live.pinned ? 'Unpin from Home' : 'Make my next quest'}
              </Button>
            )}
            {editable && live.status !== 'completed' && (
              <Button variant="secondary" icon={Pencil} onClick={() => onEdit(live)}>
                Edit
              </Button>
            )}
            {open && live.type !== 'challenge' && live.type !== 'club' && (
              <Button variant="ghost" icon={Flag} onClick={() => setConfirm('abandon')}>
                Abandon
              </Button>
            )}
            {deletable && (
              <Button variant="ghost" icon={Trash2} className="!text-danger-400" onClick={() => setConfirm('delete')}>
                Delete
              </Button>
            )}
          </div>
          {live.status === 'failed' && (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <XCircle className="h-4 w-4" /> Abandoned. It stays in your history.
            </p>
          )}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirm === 'abandon'}
        title="Abandon this quest?"
        body="It moves to your history as failed and pays nothing more. XP it has already earned stays."
        confirmLabel="Abandon"
        busy={busy === 'abandon'}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          run('abandon', async () => {
            await game.abandonQuest(live.id)
            setConfirm(null)
            onClose()
          })
        }
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete this quest?"
        body="It is removed from your board for good. This cannot be undone."
        confirmLabel="Delete"
        busy={busy === 'delete'}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          run('delete', async () => {
            await game.deleteQuest(live.id)
            setConfirm(null)
            onClose()
          }, 'Quest deleted')
        }
      />
      <VerifyModalHost
        quest={proving ? { id: live.id, title: live.title } : null}
        onClose={() => setProving(false)}
        onVerified={(result) => {
          if (result.quest && result.rewards) game.applyQuestResult({ quest: result.quest, rewards: result.rewards })
        }}
      />
    </>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 px-3 py-2">
      <p className="eyebrow">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  )
}
