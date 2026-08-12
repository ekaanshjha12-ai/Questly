import { useState } from 'react'
import { Layers, MessageCircleQuestion } from 'lucide-react'
import type { AppState, ExplainReport } from '../types'
import Flashcards from './Flashcards'
import ExplainCoach from './ExplainCoach'

interface Props {
  state: AppState
  onAddDeck: (topic: string, cards: { front: string; back: string; subtopic?: string }[]) => void
  onDeleteDeck: (deckId: string) => void
  onUpdateCard: (deckId: string, cardId: string, front: string, back: string) => void
  onDeleteCard: (deckId: string, cardId: string) => void
  onAddCard: (deckId: string) => void
  onAddReport: (report: Omit<ExplainReport, 'id' | 'createdAt'>) => void
  onDeleteReport: (reportId: string) => void
}

type Mode = 'cards' | 'explain'

/** Both study tools live behind one nav tab. A ninth top-level tab would not
 * fit a phone, and these two belong together anyway. */
export default function StudyScreen(props: Props) {
  const [mode, setMode] = useState<Mode>('cards')

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(
          [
            { id: 'cards' as const, label: 'Flashcards', icon: Layers },
            { id: 'explain' as const, label: 'Explain it back', icon: MessageCircleQuestion },
          ]
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition sm:text-sm ${
              mode === id
                ? 'border-gold-500/50 bg-gold-500/10 text-gold-300'
                : 'border-ink-600 bg-ink-850/50 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {mode === 'cards' ? (
        <Flashcards
          state={props.state}
          onAddDeck={props.onAddDeck}
          onDeleteDeck={props.onDeleteDeck}
          onUpdateCard={props.onUpdateCard}
          onDeleteCard={props.onDeleteCard}
          onAddCard={props.onAddCard}
        />
      ) : (
        <ExplainCoach
          state={props.state}
          onAddReport={props.onAddReport}
          onDeleteReport={props.onDeleteReport}
        />
      )}
    </div>
  )
}
