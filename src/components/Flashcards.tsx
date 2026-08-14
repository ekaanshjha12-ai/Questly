import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Sparkles,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Plus,
  Check,
  X,
  Layers,
  ArrowLeft,
} from 'lucide-react'
import type { AppState, Deck } from '../types'
import { ApiError, suggestSubtopics, writeCards, type SubtopicSuggestion } from '../lib/api'

interface Props {
  state: AppState
  onAddDeck: (topic: string, cards: { front: string; back: string; subtopic?: string }[]) => void
  onDeleteDeck: (deckId: string) => void
  onUpdateCard: (deckId: string, cardId: string, front: string, back: string) => void
  onDeleteCard: (deckId: string, cardId: string) => void
  onAddCard: (deckId: string) => void
}

type Stage = 'topic' | 'choosing' | 'writing'

function errorText(err: unknown): string {
  if (err instanceof ApiError && err.status === 503) {
    return 'Flashcards need an API key on the server.'
  }
  return err instanceof Error ? err.message : 'Something went wrong.'
}

/**
 * A single card, flipped by clicking it.
 *
 * The two faces are stacked and the wrapper is rotated in 3D, with
 * `backface-visibility: hidden` hiding whichever face is turned away. Animating
 * a real rotation rather than cross-fading two divs is what makes it read as
 * one object turning over instead of two images swapping.
 */
function CardFace({
  front,
  back,
  subtopic,
  flipped,
  onFlip,
}: {
  front: string
  back: string
  subtopic?: string
  flipped: boolean
  onFlip: () => void
}) {
  return (
    <div className="[perspective:1400px]">
      <motion.button
        type="button"
        onClick={onFlip}
        aria-label={flipped ? 'Show the question' : 'Show the answer'}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        className="relative block h-64 w-full [transform-style:preserve-3d]"
      >
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl border border-ink-600 bg-gradient-to-b from-ink-800 to-ink-900 p-6 text-center [backface-visibility:hidden]">
          {subtopic && (
            <span className="rounded-full bg-ink-700/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">
              {subtopic}
            </span>
          )}
          <span className="text-base font-medium leading-snug text-slate-100">{front}</span>
          <span className="text-[11px] text-slate-500">Tap to reveal</span>
        </span>

        <span className="absolute inset-0 flex items-center justify-center rounded-2xl border border-mystic-400/40 bg-gradient-to-b from-mystic-500/15 to-ink-900 p-6 text-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <span className="text-sm leading-relaxed text-mystic-100">{back || '—'}</span>
        </span>
      </motion.button>
    </div>
  )
}

function DeckStudy({
  deck,
  onBack,
  onUpdateCard,
  onDeleteCard,
  onAddCard,
  onDeleteDeck,
}: {
  deck: Deck
  onBack: () => void
  onUpdateCard: Props['onUpdateCard']
  onDeleteCard: Props['onDeleteCard']
  onAddCard: Props['onAddCard']
  onDeleteDeck: Props['onDeleteDeck']
}) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftFront, setDraftFront] = useState('')
  const [draftBack, setDraftBack] = useState('')

  const total = deck.cards.length
  const safeIndex = Math.min(index, Math.max(0, total - 1))
  const card = deck.cards[safeIndex]

  // A shorter deck (after a delete) must not leave the index past the end.
  useEffect(() => {
    if (index > total - 1) setIndex(Math.max(0, total - 1))
  }, [index, total])

  function startEditing() {
    if (!card) return
    setDraftFront(card.front)
    setDraftBack(card.back)
    setEditing(true)
  }

  function saveEdit() {
    if (!card) return
    onUpdateCard(deck.id, card.id, draftFront, draftBack)
    setEditing(false)
  }

  function move(step: number) {
    setFlipped(false)
    setIndex((i) => (total ? (i + step + total) % total : 0))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg border border-ink-600 px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Decks
        </button>
        <p className="min-w-0 flex-1 truncate font-display text-base font-semibold text-slate-100">{deck.topic}</p>
        <button
          type="button"
          onClick={() => onDeleteDeck(deck.id)}
          aria-label={`Delete the deck "${deck.topic}"`}
          className="rounded-lg p-1.5 text-slate-500 transition-colors hover:text-ember-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {!card ? (
        <div className="rounded-2xl border border-dashed border-ink-600 p-8 text-center text-sm text-slate-400">
          Every card in this deck has been deleted.
          <button
            type="button"
            onClick={() => onAddCard(deck.id)}
            className="mt-3 block w-full rounded-xl border border-ink-600 py-2 text-xs text-slate-300 hover:border-gold-500/50 hover:text-gold-300"
          >
            Add a card
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="space-y-2 rounded-2xl border border-gold-500/40 bg-ink-900 p-4">
                <label className="block text-[11px] uppercase tracking-wide text-slate-500">Question</label>
                <textarea
                  value={draftFront}
                  onChange={(e) => setDraftFront(e.target.value)}
                  rows={3}
                  maxLength={300}
                  className="w-full resize-none rounded-xl border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-gold-500/60"
                />
                <label className="block text-[11px] uppercase tracking-wide text-slate-500">Answer</label>
                <textarea
                  value={draftBack}
                  onChange={(e) => setDraftBack(e.target.value)}
                  rows={4}
                  maxLength={600}
                  className="w-full resize-none rounded-xl border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-gold-500/60"
                />
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={!draftFront.trim()}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2 text-xs font-semibold text-onAccent disabled:opacity-40"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-xl border border-ink-600 px-3 py-2 text-xs text-slate-300 hover:bg-ink-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <CardFace
                front={card.front}
                back={card.back}
                subtopic={card.subtopic}
                flipped={flipped}
                onFlip={() => setFlipped((f) => !f)}
              />
            )}
          </div>

          {/* Side rail: editing lives here so it can never be mistaken for the
              flip, which is the whole face of the card. */}
          <div className="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              onClick={() => (editing ? setEditing(false) : startEditing())}
              aria-label={editing ? 'Stop editing this card' : 'Edit this card'}
              className={`rounded-xl border p-2 transition-colors ${
                editing
                  ? 'border-gold-500/50 bg-gold-500/10 text-gold-300'
                  : 'border-ink-600 text-slate-400 hover:border-gold-500/50 hover:text-gold-300'
              }`}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onAddCard(deck.id)}
              aria-label="Add a card to this deck"
              className="rounded-xl border border-ink-600 p-2 text-slate-400 transition-colors hover:border-mystic-400/50 hover:text-mystic-300"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onDeleteCard(deck.id, card.id)}
              aria-label="Delete this card"
              className="rounded-xl border border-ink-600 p-2 text-slate-400 transition-colors hover:border-ember-500/50 hover:text-ember-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {total > 0 && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="Previous card"
            className="rounded-xl border border-ink-600 p-2 text-slate-400 transition-colors hover:text-slate-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-xs text-slate-500">
            {safeIndex + 1} of {total}
          </p>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="Next card"
            className="rounded-xl border border-ink-600 p-2 text-slate-400 transition-colors hover:text-slate-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

export default function Flashcards({
  state,
  onAddDeck,
  onDeleteDeck,
  onUpdateCard,
  onDeleteCard,
  onAddCard,
}: Props) {
  const [openDeckId, setOpenDeckId] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>('topic')
  const [topic, setTopic] = useState('')
  const [subtopics, setSubtopics] = useState<SubtopicSuggestion[]>([])
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const openDeck = state.decks.find((d) => d.id === openDeckId) ?? null

  async function findSubtopics(e: React.FormEvent) {
    e.preventDefault()
    if (!topic.trim() || stage === 'choosing') return
    setError(null)
    setStage('choosing')
    try {
      const { subtopics: list } = await suggestSubtopics(topic.trim())
      setSubtopics(list)
      // Everything ticked by default — unticking a few is less work than
      // ticking most of them.
      setChosen(new Set(list.map((s) => s.title)))
    } catch (err) {
      setError(errorText(err))
      setStage('topic')
    }
  }

  async function create() {
    if (!chosen.size) return
    setError(null)
    setStage('writing')
    try {
      const { cards } = await writeCards(topic.trim(), [...chosen])
      onAddDeck(topic.trim(), cards)
      setTopic('')
      setSubtopics([])
      setChosen(new Set())
      setStage('topic')
    } catch (err) {
      setError(errorText(err))
      setStage('choosing')
    }
  }

  if (openDeck) {
    return (
      <DeckStudy
        deck={openDeck}
        onBack={() => setOpenDeckId(null)}
        onUpdateCard={onUpdateCard}
        onDeleteCard={onDeleteCard}
        onAddCard={onAddCard}
        onDeleteDeck={(id) => {
          onDeleteDeck(id)
          setOpenDeckId(null)
        }}
      />
    )
  }

  const busy = stage === 'choosing' && subtopics.length === 0

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-ink-600 bg-ink-850/70 p-4">
        <h2 className="font-display text-lg font-semibold text-slate-100">Flashcards</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          Name a topic and pick the parts you want to revise.
        </p>

        <form onSubmit={findSubtopics} className="mt-3 flex gap-2">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Photosynthesis, French verbs, React hooks"
            maxLength={200}
            autoComplete="off"
            name="questly-card-topic"
            className="min-w-0 flex-1 rounded-xl border border-ink-600 bg-ink-900 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-gold-500/60"
          />
          <button
            type="submit"
            disabled={!topic.trim() || busy}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 px-3 py-2.5 text-sm font-semibold text-onAccent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span className="hidden sm:inline">Break down</span>
          </button>
        </form>

        {error && (
          <p className="mt-2 rounded-lg border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-xs text-ember-400">
            {error}
          </p>
        )}

        <AnimatePresence>
          {subtopics.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <p className="mb-2 mt-4 flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500">
                <span>Pick what to include</span>
                <span className="text-slate-400">{chosen.size} selected</span>
              </p>

              <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {subtopics.map((sub) => {
                  const on = chosen.has(sub.title)
                  return (
                    <button
                      key={sub.title}
                      type="button"
                      onClick={() =>
                        setChosen((prev) => {
                          const next = new Set(prev)
                          if (next.has(sub.title)) next.delete(sub.title)
                          else next.add(sub.title)
                          return next
                        })
                      }
                      className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
                        on ? 'border-mystic-400/50 bg-mystic-500/10' : 'border-ink-700 bg-ink-850/60'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          on ? 'border-mystic-400 bg-mystic-500 text-white' : 'border-ink-500 text-transparent'
                        }`}
                      >
                        <Check className="h-3 w-3" strokeWidth={4} />
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-xs font-medium ${on ? 'text-mystic-200' : 'text-slate-300'}`}>
                          {sub.title}
                        </span>
                        <span className="block text-[11px] text-slate-500">{sub.blurb}</span>
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void create()}
                  disabled={!chosen.size || stage === 'writing'}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-gold-500 to-ember-500 py-2.5 text-sm font-semibold text-onAccent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {stage === 'writing' ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Writing cards…
                    </>
                  ) : (
                    <>
                      <Layers className="h-4 w-4" />
                      Create
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSubtopics([])
                    setChosen(new Set())
                    setStage('topic')
                  }}
                  aria-label="Discard these subtopics"
                  className="rounded-xl border border-ink-600 px-3 text-slate-400 hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {state.decks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-600 bg-ink-850/40 p-8 text-center">
          <Layers className="mx-auto h-7 w-7 text-slate-600" />
          <p className="mt-2 text-sm text-slate-400">No decks yet. Enter a topic above to make your first.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {state.decks.map((deck) => (
            <button
              key={deck.id}
              type="button"
              onClick={() => setOpenDeckId(deck.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-ink-600 bg-ink-850/60 px-4 py-3 text-left transition-colors hover:border-gold-500/40"
            >
              <Layers className="h-4 w-4 shrink-0 text-gold-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-100">{deck.topic}</span>
                <span className="block text-[11px] text-slate-500">{deck.cards.length} cards</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
