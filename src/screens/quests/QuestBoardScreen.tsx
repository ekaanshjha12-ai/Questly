import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Brain, CalendarDays, History, Layers, ListTodo, Music, Plus, Scroll, Sparkles, Target } from 'lucide-react'
import type { GameQuest, QuestType } from '../../lib/api'
import { game as gameApi } from '../../lib/api'
import type { Goal } from '../../types'
import { useGame } from '../../game/GameProvider'
import { useRouter, Link } from '../../app/router'
import { PageHeader } from '../../app/AppShell'
import Button from '../../components/ui/Button'
import Tabs from '../../components/ui/Tabs'
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States'
import QuestContract from './QuestContract'
import QuestSheet from './QuestSheet'
import QuestComposer from './QuestComposer'

type Filter = 'all' | 'main' | 'side' | 'daily' | 'optional'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'main', label: 'Main' },
  { id: 'side', label: 'Side' },
  { id: 'daily', label: 'Daily' },
  { id: 'optional', label: 'Optional' },
]

const TOOLS = [
  { to: '/planner', label: 'Planner', icon: CalendarDays },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/habits', label: 'Habits', icon: ListTodo },
  { to: '/study', label: 'Study', icon: Layers },
  { to: '/ai-plan', label: 'AI Plan', icon: Brain },
  { to: '/sounds', label: 'Sounds', icon: Music },
]

/**
 * The Quest Board: every open contract, grouped by when it matters — today,
 * later, done — with the tools for planning around them one tap away.
 */
export default function QuestBoardScreen({ goals }: { goals: Goal[] }) {
  const { snapshot, status, error, refresh, refreshQuests } = useGame()
  const { navigate, path } = useRouter()
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState<GameQuest | null>(null)
  const [view, setView] = useState<'board' | 'history'>('board')

  // The board is fetched fresh on arrival: the day may have turned over.
  useEffect(() => {
    void refreshQuests().catch(() => undefined)
  }, [refreshQuests])

  // `/quests/new` opens the composer; `/quests/:id` opens that quest.
  useEffect(() => {
    if (path === '/quests/new') setComposing(true)
    const m = /^\/quests\/([^/]+)$/.exec(path)
    if (m && m[1] !== 'new') setOpenId(decodeURIComponent(m[1]))
  }, [path])

  const quests = snapshot?.quests ?? []
  const filtered = useMemo(() => (filter === 'all' ? quests : quests.filter((q) => q.type === (filter as QuestType))), [quests, filter])

  const today = filtered.filter((q) => q.status === 'active' || q.status === 'in_progress')
  const later = filtered.filter((q) => q.status === 'upcoming' || q.status === 'locked')
  const done = filtered.filter((q) => q.status === 'completed')
  const open = quests.find((q) => q.id === openId) ?? null

  function startFocus(quest: GameQuest) {
    navigate(`/focus?quest=${encodeURIComponent(quest.id)}`)
  }

  function closeSheet() {
    setOpenId(null)
    if (path !== '/quests') navigate('/quests', { replace: true, keepScroll: true })
  }

  const activeGoals = goals.filter((g) => !g.archived).map((g) => ({ id: g.id, title: g.title, category: g.category }))

  return (
    <div>
      <PageHeader title="Quest Board" subtitle="Daily and strategic milestones" />

      <nav aria-label="Planning tools" className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {TOOLS.map((tool) => (
          <Link
            key={tool.to}
            to={tool.to}
            className="flex min-h-[40px] shrink-0 items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 px-3 text-xs font-semibold text-slate-300 transition-colors hover:border-ink-500 hover:text-slate-100"
          >
            <tool.icon className="h-4 w-4 text-gold-400" aria-hidden />
            {tool.label}
          </Link>
        ))}
      </nav>

      <div className="mb-4 flex items-center gap-2">
        <Tabs label="Quest view" tabs={[{ id: 'board', label: 'Board' }, { id: 'history', label: 'History' }]} value={view} onChange={setView} className="flex-1" />
        <Button icon={Plus} onClick={() => setComposing(true)}>
          New
        </Button>
      </div>

      {view === 'history' ? (
        <QuestHistory />
      ) : (
        <>
          <div role="radiogroup" aria-label="Quest type" className="no-scrollbar -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`min-h-[34px] shrink-0 rounded-full border px-3.5 text-[11px] font-bold uppercase tracking-[0.08em] ${
                  filter === f.id ? 'border-gold-500/60 bg-gold-500/15 text-gold-300' : 'border-ink-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {status === 'loading' && !snapshot && <LoadingState lines={3} label="Loading quests" />}
          {status === 'error' && !snapshot && <ErrorState message={error ?? 'Could not load your quests.'} onRetry={() => void refresh()} />}

          {snapshot && (
            <div className="space-y-7">
              <Group title="Today" count={today.length}>
                {today.length ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {today.map((q, i) => (
                      <QuestContract key={q.id} quest={q} index={i} onOpen={(x) => setOpenId(x.id)} onStart={startFocus} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={Scroll}
                    title={filter === 'all' ? 'No open quests' : 'None of this type'}
                    body={
                      goals.some((g) => !g.archived)
                        ? 'Write your own quest, or check back tomorrow for new ones from your goals.'
                        : 'Set a goal and Questly writes daily, weekly and monthly quests for it — or write one yourself.'
                    }
                    action={
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button icon={Plus} onClick={() => setComposing(true)}>
                          Write a quest
                        </Button>
                        {!goals.some((g) => !g.archived) && (
                          <Button variant="secondary" icon={Target} onClick={() => navigate('/goals')}>
                            Set a goal
                          </Button>
                        )}
                      </div>
                    }
                  />
                )}
              </Group>

              {later.length > 0 && (
                <Group title="Upcoming" count={later.length}>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {later.map((q, i) => (
                      <QuestContract key={q.id} quest={q} index={i} onOpen={(x) => setOpenId(x.id)} onStart={startFocus} />
                    ))}
                  </div>
                </Group>
              )}

              {done.length > 0 && (
                <Group title="Completed today" count={done.length}>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {done.map((q, i) => (
                      <QuestContract key={q.id} quest={q} index={i} onOpen={(x) => setOpenId(x.id)} onStart={startFocus} />
                    ))}
                  </div>
                </Group>
              )}
            </div>
          )}
        </>
      )}

      <QuestSheet
        quest={open}
        onClose={closeSheet}
        onStartFocus={(q) => {
          setOpenId(null)
          startFocus(q)
        }}
        onEdit={(q) => {
          setOpenId(null)
          setEditing(q)
        }}
      />
      <QuestComposer
        open={composing || Boolean(editing)}
        editing={editing}
        goals={activeGoals}
        onClose={() => {
          setComposing(false)
          setEditing(null)
          if (path === '/quests/new') navigate('/quests', { replace: true, keepScroll: true })
        }}
      />
    </div>
  )
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="eyebrow mb-3 flex items-center gap-2">
        {title}
        <span className="rounded-full bg-ink-800 px-1.5 py-px text-[10px] text-slate-400">{count}</span>
      </h2>
      {children}
    </section>
  )
}

/** Finished, failed and expired quests, newest first. */
function QuestHistory() {
  const [quests, setQuests] = useState<GameQuest[] | null>(null)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function load(before?: string) {
    setLoading(true)
    try {
      const page = await gameApi.questHistory(before)
      setQuests((list) => (before ? [...(list ?? []), ...page.quests] : page.quests))
      setMore(page.more)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your history.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (error && !quests) return <ErrorState message={error} onRetry={() => void load()} />
  if (!quests) return <LoadingState label="Loading history" />
  if (!quests.length) return <EmptyState icon={History} title="No history yet" body="Quests you finish, abandon or let expire are kept here." />

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {quests.map((q) => (
          <motion.div key={q.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="panel flex items-center gap-3 px-4 py-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${q.status === 'completed' ? 'bg-gold-500/15 text-gold-400' : 'bg-danger-500/10 text-danger-400'}`}
            >
              {q.status === 'completed' ? <Sparkles className="h-4 w-4" /> : <History className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-100">{q.title}</p>
              <p className="text-[11px] text-slate-500">
                {q.status === 'completed' ? 'Completed' : q.status === 'failed' ? 'Abandoned' : 'Expired'}
                {q.completedAt ? ` · ${new Date(q.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
              </p>
            </div>
            {q.xpPaid > 0 && <span className="text-sm font-bold text-reward-400">+{q.xpPaid}</span>}
          </motion.div>
        ))}
      </AnimatePresence>
      {more && (
        <Button variant="secondary" block loading={loading} onClick={() => {
            const last = quests[quests.length - 1]
            void load(last ? last.completedAt ?? last.updatedAt : undefined)
          }}>
          Load more
        </Button>
      )}
    </div>
  )
}
