import { useEffect, useMemo, useState } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import type { GoalCategory } from '../../types'
import { ApiError, type GameQuest, type ProgressKind, type QuestInput } from '../../lib/api'
import { CATEGORY_LABEL, DIFFICULTY_LABEL, formatMinutes, previewXp } from '../../lib/questFormat'
import { useGame } from '../../game/GameProvider'
import { Sheet } from '../../components/ui/Sheet'
import Button from '../../components/ui/Button'
import { ChoiceChips, Field, Select, TextArea, TextInput } from '../../components/ui/Field'
import { RarityTag } from '../../components/ui/Tag'
import { useToast } from '../../components/ui/Toast'

type PlayerType = 'main' | 'side' | 'optional'

const TYPES: { id: PlayerType; label: string; hint: string }[] = [
  { id: 'main', label: 'Main quest', hint: 'Your big objective. Pays the most per minute.' },
  { id: 'side', label: 'Side quest', hint: 'A worthwhile task alongside the main path.' },
  { id: 'optional', label: 'Optional', hint: 'Small things. Quick to finish, small reward.' },
]

const KINDS: { id: ProgressKind; label: string; hint: string }[] = [
  { id: 'minutes', label: 'Focus time', hint: 'Fills with Focus Mode sessions. Measured, so never capped.' },
  { id: 'check', label: 'One task', hint: 'Tick it when it is done.' },
  { id: 'count', label: 'Count', hint: 'Log units as you go: pages, km, problems.' },
  { id: 'milestones', label: 'Milestones', hint: 'A list of steps, paid as you tick them.' },
]

const DURATIONS = [15, 25, 45, 60, 90, 120, 180, 240]

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Writing or editing a quest. The reward preview mirrors the server's formula
 * so the player can see what a quest is worth while shaping it; the server
 * works it out again on save, whatever this shows.
 */
export default function QuestComposer({
  open,
  onClose,
  editing = null,
  goals = [],
}: {
  open: boolean
  onClose: () => void
  editing?: GameQuest | null
  goals?: { id: string; title: string; category: GoalCategory }[]
}) {
  const { createQuest, updateQuest } = useGame()
  const toast = useToast()
  const [type, setType] = useState<PlayerType>('main')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<GoalCategory>('general')
  const [durationMin, setDurationMin] = useState(60)
  const [kind, setKind] = useState<ProgressKind>('minutes')
  const [target, setTarget] = useState(10)
  const [unit, setUnit] = useState('pages')
  const [milestones, setMilestones] = useState<string[]>(['', ''])
  const [deadline, setDeadline] = useState('')
  const [goalId, setGoalId] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const locked = Boolean(editing && (editing.xpPaid > 0 || editing.startedAt || editing.progress.value > 0))

  useEffect(() => {
    if (!open) return
    setErrors({})
    if (editing) {
      setType(editing.type === 'main' || editing.type === 'side' ? editing.type : 'optional')
      setTitle(editing.title)
      setDescription(editing.description ?? '')
      setCategory(editing.category)
      setDurationMin(editing.durationMin)
      setKind(editing.progress.kind)
      setTarget(editing.progress.target)
      setUnit(editing.progress.unit ?? 'pages')
      setMilestones(editing.progress.milestones?.map((m) => m.title) ?? ['', ''])
      setDeadline(toLocalInput(editing.deadlineAt))
      setGoalId(editing.goalId ?? '')
    } else {
      setType('main')
      setTitle('')
      setDescription('')
      setCategory('general')
      setDurationMin(60)
      setKind('minutes')
      setTarget(10)
      setUnit('pages')
      setMilestones(['', ''])
      setDeadline('')
      setGoalId('')
    }
  }, [open, editing])

  // A quest under way keeps what it was promised, whatever the scale says now.
  const preview = useMemo(
    () => (locked && editing ? { xp: editing.xp, rarity: editing.rarity, difficulty: editing.difficulty } : previewXp({ type, durationMin })),
    [locked, editing, type, durationMin],
  )

  async function save() {
    const next: Record<string, string> = {}
    if (title.trim().length < 3) next.title = 'Give the quest a title of at least 3 characters.'
    if (kind === 'milestones' && milestones.filter((m) => m.trim().length >= 2).length < 2) next.milestones = 'Add at least two milestones.'
    if (kind === 'count' && (!Number.isFinite(target) || target < 1)) next.target = 'Set a target of at least 1.'
    if (deadline && Date.parse(deadline) < Date.now() + 5 * 60_000) next.deadline = 'Pick a deadline a little further away.'
    setErrors(next)
    if (Object.keys(next).length) return

    const input: QuestInput = {
      type,
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      durationMin,
      progressKind: kind,
      ...(kind === 'count' ? { target, unit: unit.trim() || 'units' } : {}),
      ...(kind === 'milestones' ? { milestones: milestones.map((m) => m.trim()).filter((m) => m.length >= 2) } : {}),
      deadlineAt: deadline ? new Date(deadline).toISOString() : null,
      goalId: goalId || null,
    }
    setBusy(true)
    try {
      if (editing) {
        await updateQuest(editing.id, input)
        toast.success('Quest updated')
      } else {
        await createQuest(input)
        toast.success('Quest added to your board', `Worth +${preview.xp} XP`)
      }
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.field) setErrors({ [err.field]: err.message })
      else toast.error(editing ? 'Could not update the quest' : 'Could not add the quest', err instanceof Error ? err.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit quest' : 'New quest'}
      subtitle={editing ? undefined : 'Write the contract. Questly sets the reward.'}
      size="lg"
      footer={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Reward</p>
            <p className="flex items-center gap-2">
              <span className="font-display text-xl font-bold text-reward-400">+{preview.xp} XP</span>
              <RarityTag rarity={preview.rarity} />
            </p>
          </div>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            {editing ? 'Save' : 'Add quest'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <Field label="Quest type">
          {() => <ChoiceChips label="Quest type" options={TYPES} value={type} onChange={(v) => !locked && setType(v)} />}
        </Field>

        <Field label="Title" error={errors.title}>
          {({ id, describedBy, invalid }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={title}
              maxLength={80}
              placeholder="Master the Elements"
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>

        <Field label="What it takes" hint="Optional. A line or two about the objective." error={errors.description}>
          {({ id, describedBy }) => (
            <TextArea id={id} aria-describedby={describedBy} rows={2} maxLength={400} value={description} placeholder="Study chemistry for 60 minutes" onChange={(e) => setDescription(e.target.value)} />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            {({ id }) => (
              <Select id={id} value={category} onChange={(e) => setCategory(e.target.value as GoalCategory)}>
                {(Object.keys(CATEGORY_LABEL) as GoalCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Level" hint="Set by the estimated time, the same scale as every quest.">
            {() => <p className="flex min-h-[40px] items-center font-display text-lg font-bold text-slate-100">{DIFFICULTY_LABEL[preview.difficulty]}</p>}
          </Field>
        </div>

        <Field label={`Estimated time · ${formatMinutes(durationMin)}`}>
          {() => (
            <div className="flex flex-wrap items-center gap-1.5">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={locked}
                  onClick={() => setDurationMin(d)}
                  className={`min-h-[36px] rounded-lg border px-2.5 text-xs font-semibold ${
                    durationMin === d ? 'border-gold-500/60 bg-gold-500/15 text-gold-300' : 'border-ink-600 bg-ink-900 text-slate-300'
                  }`}
                >
                  {formatMinutes(d)}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="How progress is measured" hint={KINDS.find((k) => k.id === kind)?.hint}>
          {() => <ChoiceChips label="Progress" options={KINDS} value={kind} onChange={(v) => !locked && setKind(v)} />}
        </Field>

        {kind === 'count' && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Target" error={errors.target}>
              {({ id }) => (
                <TextInput id={id} type="number" min={1} max={100000} value={target} disabled={locked} onChange={(e) => setTarget(Math.round(Number(e.target.value)))} />
              )}
            </Field>
            <Field label="Unit" error={errors.unit}>
              {({ id }) => <TextInput id={id} maxLength={16} value={unit} disabled={locked} placeholder="km, pages…" onChange={(e) => setUnit(e.target.value)} />}
            </Field>
          </div>
        )}

        {kind === 'milestones' && (
          <Field label="Milestones" error={errors.milestones}>
            {() => (
              <div className="space-y-2">
                {milestones.map((m, i) => (
                  <div key={i} className="flex gap-2">
                    <TextInput
                      aria-label={`Milestone ${i + 1}`}
                      value={m}
                      maxLength={80}
                      disabled={locked}
                      placeholder={`Milestone ${i + 1}`}
                      onChange={(e) => setMilestones((list) => list.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                    {milestones.length > 2 && !locked && (
                      <button type="button" aria-label={`Remove milestone ${i + 1}`} onClick={() => setMilestones((list) => list.filter((_, j) => j !== i))} className="rounded-lg px-2 text-slate-500 hover:text-danger-400">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {milestones.length < 12 && !locked && (
                  <Button variant="ghost" size="sm" icon={Plus} onClick={() => setMilestones((list) => [...list, ''])}>
                    Add milestone
                  </Button>
                )}
              </div>
            )}
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Deadline" hint="Optional. The quest expires if it is not done by then." error={errors.deadlineAt ?? errors.deadline}>
            {({ id, describedBy }) => (
              <div className="flex gap-2">
                <TextInput id={id} aria-describedby={describedBy} type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                {deadline && (
                  <button type="button" aria-label="Clear deadline" onClick={() => setDeadline('')} className="rounded-lg px-2 text-slate-500 hover:text-slate-200">
                    <Minus className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </Field>
          {goals.length > 0 && (
            <Field label="Toward goal" hint="Optional.">
              {({ id }) => (
                <Select id={id} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
                  <option value="">No goal</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </div>
        {locked && <p className="text-xs text-slate-500">This quest is under way, so its type, size and progress are fixed. The title, description and deadline can still change.</p>}
      </div>
    </Sheet>
  )
}
