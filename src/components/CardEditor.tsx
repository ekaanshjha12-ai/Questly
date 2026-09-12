import { useEffect, useRef, useState } from 'react'
import {
  ArrowUpToLine,
  Brush,
  Hand,
  Minus,
  Palette,
  Plus,
  RotateCcw,
  RotateCw,
  Smile,
  Trash2,
  Type,
  Undo2,
  UserRound,
} from 'lucide-react'
import type { CardDesign, CardField, CardItem, CardStroke } from '../types'
import {
  CARD_BACKGROUNDS,
  CARD_H,
  CARD_W,
  FIELD_LABELS,
  INK_COLORS,
  STICKERS,
  defaultCard,
  findBackground,
  itemId,
  type CardData,
} from '../lib/card'
import ProfileCard from './ProfileCard'

/**
 * Make the card yours: move anything, add text and stickers, draw on it, change
 * the background.
 *
 * Edits happen on a local copy and are handed up when a gesture finishes — the
 * end of a drag, the end of a stroke — rather than on every pointer move, since
 * each hand-off becomes a save. Undo keeps the last thirty versions of the card
 * in memory, which covers the mistakes people actually make while decorating.
 */

type Tool = 'move' | 'draw'
type Panel = 'add' | 'background' | null
type AddTab = 'text' | 'sticker' | 'info'

const PEN_SIZES = [6, 14, 28]
const ALL_FIELDS: CardField[] = ['avatar', 'name', 'username', 'bio', 'rank', 'level', 'xp', 'birthday', 'joined', 'email']
const HISTORY = 30

export default function CardEditor({
  design: saved,
  data,
  onChange,
}: {
  design: CardDesign | null
  data: CardData
  onChange: (design: CardDesign | null) => void
}) {
  const [design, setDesign] = useState<CardDesign>(() => saved ?? defaultCard())
  const designRef = useRef(design)
  designRef.current = design

  // A change synced in from another device replaces the local copy — unless a
  // gesture is under way, which would otherwise jump out from under the finger.
  const busy = useRef(false)
  useEffect(() => {
    if (!busy.current) setDesign(saved ?? defaultCard())
  }, [saved])

  const [tool, setTool] = useState<Tool>('move')
  const [panel, setPanel] = useState<Panel>(null)
  const [addTab, setAddTab] = useState<AddTab>('sticker')
  const [selected, setSelected] = useState<string | null>(null)
  const [pen, setPen] = useState({ color: '#ffffff', size: PEN_SIZES[1] })
  const [draft, setDraft] = useState('')
  const [draftColor, setDraftColor] = useState('#ffffff')
  const [liveStroke, setLiveStroke] = useState<CardStroke | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

  const cardRef = useRef<HTMLDivElement>(null)
  const history = useRef<CardDesign[]>([])
  const [canUndo, setCanUndo] = useState(false)

  const selectedItem = design.items.find((i) => i.id === selected) ?? null

  /** Records the current card for undo, then applies and saves the next one. */
  function commit(next: CardDesign) {
    history.current = [...history.current.slice(-(HISTORY - 1)), designRef.current]
    setCanUndo(true)
    setDesign(next)
    onChange(next)
  }

  function undo() {
    const previous = history.current.pop()
    if (!previous) return
    setCanUndo(history.current.length > 0)
    setDesign(previous)
    onChange(previous)
  }

  function updateItem(id: string, patch: Partial<CardItem>) {
    commit({
      ...designRef.current,
      items: designRef.current.items.map((i) => (i.id === id ? ({ ...i, ...patch } as CardItem) : i)),
    })
  }

  function addItem(item: CardItem) {
    commit({ ...designRef.current, items: [...designRef.current.items, item] })
    setSelected(item.id)
    setTool('move')
    // Close the panel so the new element's size, rotate and remove controls
    // are showing — the next thing anyone does with a new sticker is place it.
    setPanel(null)
  }

  function removeItem(id: string) {
    commit({ ...designRef.current, items: designRef.current.items.filter((i) => i.id !== id) })
    setSelected(null)
  }

  function bringToFront(id: string) {
    const item = designRef.current.items.find((i) => i.id === id)
    if (!item) return
    commit({ ...designRef.current, items: [...designRef.current.items.filter((i) => i.id !== id), item] })
  }

  /* --- dragging ----------------------------------------------------------- */

  const drag = useRef<{
    id: string
    startX: number
    startY: number
    originX: number
    originY: number
    width: number
    height: number
    before: CardDesign
    moved: boolean
  } | null>(null)

  function onItemPointerDown(item: CardItem, e: React.PointerEvent<HTMLDivElement>) {
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return
    e.preventDefault()
    // Capture keeps the drag alive when the finger outruns the element, but the
    // browser refuses it for a pointer that has already lifted. The drag works
    // without it, because the listeners below are on the window.
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Carry on uncaptured.
    }
    setSelected(item.id)
    busy.current = true
    drag.current = {
      id: item.id,
      startX: e.clientX,
      startY: e.clientY,
      originX: item.x,
      originY: item.y,
      width: rect.width,
      height: rect.height,
      before: designRef.current,
      moved: false,
    }

    const pointerId = e.pointerId
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const d = drag.current
      if (!d) return
      const dx = (ev.clientX - d.startX) / d.width
      const dy = (ev.clientY - d.startY) / d.height
      if (!d.moved && Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) < 3) return
      d.moved = true
      const x = Math.min(1, Math.max(0, d.originX + dx))
      const y = Math.min(1, Math.max(0, d.originY + dy))
      setDesign((current) => ({
        ...current,
        items: current.items.map((i) => (i.id === d.id ? { ...i, x, y } : i)),
      }))
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      busy.current = false
      const d = drag.current
      drag.current = null
      if (!d?.moved) return
      // The undo point is the card from before the drag started, not a
      // mid-drag frame.
      history.current = [...history.current.slice(-(HISTORY - 1)), d.before]
      setCanUndo(true)
      onChange(designRef.current)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  /* --- drawing ------------------------------------------------------------ */

  const stroke = useRef<{ points: number[]; rect: DOMRect } | null>(null)

  function pointFor(e: React.PointerEvent, rect: DOMRect): [number, number] {
    return [
      Math.round(((e.clientX - rect.left) / rect.width) * CARD_W),
      Math.round(((e.clientY - rect.top) / rect.height) * CARD_H),
    ]
  }

  function onDrawPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Uncaptured: leaving the card ends the stroke instead (see ProfileCard).
    }
    busy.current = true
    const [x, y] = pointFor(e, rect)
    stroke.current = { points: [x, y], rect }
    setLiveStroke({ color: pen.color, size: pen.size, points: [x, y] })
  }

  function onDrawPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const s = stroke.current
    if (!s) return
    const [x, y] = pointFor(e, s.rect)
    const lx = s.points[s.points.length - 2]
    const ly = s.points[s.points.length - 1]
    // Points closer than this add nothing visible and only cost storage.
    if (Math.hypot(x - lx, y - ly) < 5) return
    if (s.points.length >= 1200) return
    s.points.push(x, y)
    setLiveStroke({ color: pen.color, size: pen.size, points: [...s.points] })
  }

  function onDrawPointerUp() {
    const s = stroke.current
    stroke.current = null
    busy.current = false
    setLiveStroke(null)
    if (!s) return
    commit({
      ...designRef.current,
      strokes: [...designRef.current.strokes, { color: pen.color, size: pen.size, points: s.points }],
    })
  }

  /* --- keyboard ----------------------------------------------------------- */

  function onKeyDown(e: React.KeyboardEvent) {
    if (!selectedItem || tool !== 'move') return
    const step = e.shiftKey ? 0.05 : 0.01
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    if (moves[e.key]) {
      e.preventDefault()
      const [dx, dy] = moves[e.key]
      updateItem(selectedItem.id, {
        x: Math.min(1, Math.max(0, selectedItem.x + dx)),
        y: Math.min(1, Math.max(0, selectedItem.y + dy)),
      })
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      removeItem(selectedItem.id)
    } else if (e.key === 'Escape') {
      setSelected(null)
    }
  }

  const present = new Set(design.items.flatMap((i) => (i.kind === 'field' ? [i.field] : [])))
  const missing = ALL_FIELDS.filter((f) => !present.has(f))
  const bgFor = (id: string) => findBackground(id, data.rankColor)

  return (
    <div className="space-y-3">
      <div
        className="mx-auto w-full max-w-[20rem] outline-none"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        // Tapping empty card clears the selection; tapping an element selects
        // it in its own handler, so only presses that miss every element count.
        onPointerDown={(e) => {
          if (tool === 'move' && !(e.target as Element).closest('[role="button"]')) setSelected(null)
        }}
      >
        <ProfileCard
          ref={cardRef}
          design={design}
          data={data}
          selectedId={tool === 'move' ? selected : null}
          onItemPointerDown={onItemPointerDown}
          drawing={tool === 'draw'}
          liveStroke={liveStroke}
          onDrawPointerDown={onDrawPointerDown}
          onDrawPointerMove={onDrawPointerMove}
          onDrawPointerUp={onDrawPointerUp}
        />
      </div>

      {/* --- tools ---------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <ToolButton active={tool === 'move' && !panel} onClick={() => { setTool('move'); setPanel(null) }} icon={Hand} label="Move" />
        <ToolButton active={tool === 'draw'} onClick={() => { setTool('draw'); setPanel(null); setSelected(null) }} icon={Brush} label="Draw" />
        <ToolButton active={panel === 'add'} onClick={() => { setTool('move'); setPanel(panel === 'add' ? null : 'add') }} icon={Plus} label="Add" />
        <ToolButton active={panel === 'background'} onClick={() => { setTool('move'); setPanel(panel === 'background' ? null : 'background') }} icon={Palette} label="Background" />
        <ToolButton active={false} onClick={undo} icon={Undo2} label="Undo" disabled={!canUndo} />
      </div>

      {/* --- selected element ---------------------------------------------- */}
      {tool === 'move' && selectedItem && !panel && (
        <div className="flex flex-wrap items-center justify-center gap-1 rounded-xl border border-ink-600 bg-ink-800 p-1.5">
          <span className="px-1.5 text-[11px] text-slate-400">{selectedLabel(selectedItem)}</span>
          <IconButton label="Smaller" icon={Minus} onClick={() => updateItem(selectedItem.id, { scale: Math.max(0.3, +(selectedItem.scale - 0.1).toFixed(2)) })} />
          <IconButton label="Bigger" icon={Plus} onClick={() => updateItem(selectedItem.id, { scale: Math.min(4, +(selectedItem.scale + 0.1).toFixed(2)) })} />
          <IconButton label="Rotate left" icon={RotateCcw} onClick={() => updateItem(selectedItem.id, { rotate: Math.max(-180, selectedItem.rotate - 15) })} />
          <IconButton label="Rotate right" icon={RotateCw} onClick={() => updateItem(selectedItem.id, { rotate: Math.min(180, selectedItem.rotate + 15) })} />
          <IconButton label="Bring to front" icon={ArrowUpToLine} onClick={() => bringToFront(selectedItem.id)} />
          <IconButton label="Remove" icon={Trash2} onClick={() => removeItem(selectedItem.id)} danger />
        </div>
      )}

      {tool === 'move' && !selectedItem && !panel && (
        <p className="text-center text-[11px] text-slate-500">Drag anything to move it. Tap to resize, rotate or remove.</p>
      )}

      {/* --- drawing -------------------------------------------------------- */}
      {tool === 'draw' && (
        <div className="space-y-2 rounded-xl border border-ink-600 bg-ink-800 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {INK_COLORS.map((color) => (
              <Swatch key={color} color={color} active={pen.color === color} onClick={() => setPen((p) => ({ ...p, color }))} />
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {PEN_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPen((p) => ({ ...p, size }))}
                  aria-label={`Brush size ${size}`}
                  aria-pressed={pen.size === size}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border ${pen.size === size ? 'border-gold-500 bg-gold-500/10' : 'border-ink-600'}`}
                >
                  <span className="rounded-full bg-slate-200" style={{ width: size / 3 + 2, height: size / 3 + 2 }} />
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!design.strokes.length}
              onClick={() => commit({ ...designRef.current, strokes: [] })}
              className="rounded-lg px-2.5 py-1.5 text-[11px] text-slate-400 hover:text-ember-400 disabled:opacity-40"
            >
              Clear drawing
            </button>
          </div>
        </div>
      )}

      {/* --- add ------------------------------------------------------------- */}
      {panel === 'add' && (
        <div className="space-y-2.5 rounded-xl border border-ink-600 bg-ink-800 p-2.5">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-ink-850 p-1">
            {([
              ['sticker', 'Stickers', Smile],
              ['text', 'Text', Type],
              ['info', 'Your info', UserRound],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAddTab(id)}
                aria-pressed={addTab === id}
                className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-[11px] font-medium ${addTab === id ? 'bg-gradient-to-r from-gold-500 to-ember-500 text-onAccent' : 'text-slate-400'}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {addTab === 'sticker' && (
            <div className="grid grid-cols-8 gap-1">
              {STICKERS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() =>
                    addItem({
                      id: itemId(),
                      kind: 'sticker',
                      emoji,
                      x: 0.3 + Math.random() * 0.4,
                      y: 0.3 + Math.random() * 0.4,
                      scale: 1,
                      rotate: Math.round((Math.random() - 0.5) * 30),
                    })
                  }
                  aria-label={`Add ${emoji}`}
                  className="flex aspect-square items-center justify-center rounded-lg text-xl transition-transform hover:scale-110 hover:bg-ink-850"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {addTab === 'text' && (
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault()
                const text = draft.trim()
                if (!text) return
                addItem({ id: itemId(), kind: 'text', text, color: draftColor, x: 0.5, y: 0.5, scale: 1, rotate: 0 })
                setDraft('')
              }}
            >
              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, 60))}
                  placeholder="Say something…"
                  className="min-w-0 flex-1 rounded-lg border border-ink-600 bg-ink-850 px-2.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-gold-500/50 focus:outline-none"
                />
                <button type="submit" disabled={!draft.trim()} className="rounded-lg bg-gradient-to-r from-gold-500 to-ember-500 px-3 text-xs font-semibold text-onAccent disabled:opacity-40">
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {INK_COLORS.map((color) => (
                  <Swatch key={color} color={color} active={draftColor === color} onClick={() => setDraftColor(color)} />
                ))}
              </div>
            </form>
          )}

          {addTab === 'info' &&
            (missing.length ? (
              <div className="flex flex-wrap gap-1.5">
                {missing.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => addItem({ id: `f-${f}-${itemId()}`, kind: 'field', field: f, x: 0.5, y: 0.5, scale: 1, rotate: 0 })}
                    className="flex items-center gap-1 rounded-lg border border-ink-600 bg-ink-850 px-2.5 py-1.5 text-[11px] text-slate-200 hover:border-gold-500/50"
                  >
                    <Plus className="h-3 w-3" />
                    {FIELD_LABELS[f]}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500">Everything is already on your card.</p>
            ))}
        </div>
      )}

      {/* --- background ----------------------------------------------------- */}
      {panel === 'background' && (
        <div className="space-y-2.5 rounded-xl border border-ink-600 bg-ink-800 p-2.5">
          <div className="grid grid-cols-4 gap-2">
            {CARD_BACKGROUNDS.map((bg) => (
              <button
                key={bg.id}
                type="button"
                onClick={() => commit({ ...designRef.current, background: bg.id })}
                aria-pressed={design.background === bg.id}
                className="flex flex-col items-center gap-1"
              >
                <span
                  className={`block h-12 w-full rounded-lg ${design.background === bg.id ? 'ring-2 ring-gold-500 ring-offset-2 ring-offset-ink-800' : ''}`}
                  style={{ background: bgFor(bg.id).css }}
                />
                <span className="text-[10px] text-slate-400">{bg.name}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            {confirmReset ? (
              <button
                type="button"
                onClick={() => {
                  commit(defaultCard())
                  setConfirmReset(false)
                  setSelected(null)
                }}
                className="rounded-lg bg-ember-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-ember-400"
              >
                Tap again to start over
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmReset(true)} className="rounded-lg px-2.5 py-1.5 text-[11px] text-slate-400 hover:text-ember-400">
                Reset card
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function selectedLabel(item: CardItem): string {
  if (item.kind === 'text') return 'Text'
  if (item.kind === 'sticker') return item.emoji
  return FIELD_LABELS[item.field]
}

function ToolButton({
  active,
  onClick,
  icon: Icon,
  label,
  disabled = false,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Hand
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40 ${
        active ? 'bg-gradient-to-r from-gold-500 to-ember-500 text-onAccent' : 'border border-ink-600 bg-ink-800 text-slate-300 hover:text-slate-100'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function IconButton({ label, icon: Icon, onClick, danger = false }: { label: string; icon: typeof Hand; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`rounded-lg p-2 transition-colors hover:bg-ink-850 ${danger ? 'text-slate-400 hover:text-ember-400' : 'text-slate-300 hover:text-slate-100'}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

function Swatch({ color, active, onClick }: { color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Colour ${color}`}
      aria-pressed={active}
      className={`h-7 w-7 rounded-full border border-black/20 ${active ? 'ring-2 ring-gold-500 ring-offset-2 ring-offset-ink-800' : ''}`}
      style={{ background: color }}
    />
  )
}
