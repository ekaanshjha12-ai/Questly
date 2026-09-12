import { forwardRef } from 'react'
import type { CardDesign, CardItem, CardStroke } from '../types'
import { CARD_H, CARD_W, findBackground, type CardBackground, type CardData } from '../lib/card'

/**
 * Draws a profile card from a design and the player's data.
 *
 * Pure rendering, used both for the reveal after sign-up and underneath the
 * editor. Everything is sized in container units, so the same design looks the
 * same at 280px on a phone and 360px on a desktop — positions are shares of the
 * card, and text scales with it.
 *
 * Layer order: background, then the elements, then the drawing on top — a
 * doodle is drawn on the card, the way you would draw on a printed one.
 */

interface Props {
  design: CardDesign
  data: CardData
  /** Pointer handlers for the editor; absent when the card is only shown. */
  onItemPointerDown?: (item: CardItem, e: React.PointerEvent<HTMLDivElement>) => void
  selectedId?: string | null
  /** A stroke being drawn right now, before it is committed. */
  liveStroke?: CardStroke | null
  /** When set, the drawing layer takes the pointer instead of the elements. */
  drawing?: boolean
  onDrawPointerDown?: (e: React.PointerEvent<SVGSVGElement>) => void
  onDrawPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void
  onDrawPointerUp?: (e: React.PointerEvent<SVGSVGElement>) => void
  className?: string
}

const ProfileCard = forwardRef<HTMLDivElement, Props>(function ProfileCard(
  { design, data, onItemPointerDown, selectedId, liveStroke, drawing, onDrawPointerDown, onDrawPointerMove, onDrawPointerUp, className = '' },
  ref,
) {
  const bg = findBackground(design.background, data.rankColor)
  const interactive = Boolean(onItemPointerDown)

  return (
    <div
      ref={ref}
      className={`relative w-full select-none overflow-hidden ${className}`}
      style={{
        aspectRatio: `${CARD_W} / ${CARD_H}`,
        containerType: 'inline-size',
        borderRadius: '7cqw',
        background: bg.css,
        color: bg.ink,
        boxShadow: '0 1.5cqw 0 rgba(0,0,0,0.35), 0 6cqw 12cqw -4cqw rgba(0,0,0,0.55), inset 0 0 0 0.6cqw rgba(255,255,255,0.18)',
        touchAction: interactive ? 'none' : undefined,
      }}
    >
      {/* Sheen along the top, so the card reads as a glossy object. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 38%)' }}
      />

      {design.items.map((item) => (
        <div
          key={item.id}
          role={interactive ? 'button' : undefined}
          tabIndex={interactive && !drawing ? 0 : undefined}
          aria-label={interactive ? labelFor(item) : undefined}
          onPointerDown={interactive && !drawing ? (e) => onItemPointerDown?.(item, e) : undefined}
          className={`absolute ${interactive && !drawing ? 'cursor-grab active:cursor-grabbing' : ''}`}
          style={{
            left: `${item.x * 100}%`,
            top: `${item.y * 100}%`,
            transform: `translate(-50%, -50%) rotate(${item.rotate}deg) scale(${item.scale})`,
            outline: selectedId === item.id ? '0.5cqw dashed currentColor' : undefined,
            outlineOffset: '1.2cqw',
            borderRadius: '2cqw',
            pointerEvents: drawing ? 'none' : undefined,
          }}
        >
          <ItemBody item={item} data={data} bg={bg} />
        </div>
      ))}

      <svg
        viewBox={`0 0 ${CARD_W} ${CARD_H}`}
        className="absolute inset-0 h-full w-full"
        style={{ pointerEvents: drawing ? 'auto' : 'none', cursor: drawing ? 'crosshair' : undefined }}
        onPointerDown={onDrawPointerDown}
        onPointerMove={onDrawPointerMove}
        onPointerUp={onDrawPointerUp}
        onPointerCancel={onDrawPointerUp}
        // Without pointer capture a stroke dragged off the card would never see
        // its pointerup; ending it at the edge keeps it from staying live.
        onPointerLeave={onDrawPointerUp}
        aria-hidden
      >
        {[...design.strokes, ...(liveStroke ? [liveStroke] : [])].map((stroke, i) => (
          <path
            key={i}
            d={pathFor(stroke.points)}
            fill="none"
            stroke={stroke.color}
            strokeWidth={stroke.size}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </div>
  )
})

export default ProfileCard

function pathFor(points: number[]): string {
  if (points.length < 2) return ''
  let d = `M${points[0]} ${points[1]}`
  // A single tap is a dot: a zero-length segment with round caps draws one.
  if (points.length === 2) return `${d}L${points[0]} ${points[1]}`
  for (let i = 2; i < points.length; i += 2) d += `L${points[i]} ${points[i + 1]}`
  return d
}

function labelFor(item: CardItem): string {
  if (item.kind === 'text') return `Text: ${item.text}`
  if (item.kind === 'sticker') return `Sticker ${item.emoji}`
  return item.field
}

/** A translucent plate for the small stat blocks, darkening a light card and
 * lightening a dark one so the numbers always sit on something. */
function plate(bg: CardBackground): string {
  return bg.ink === '#ffffff' ? 'rgba(0,0,0,0.24)' : 'rgba(255,255,255,0.5)'
}

function ItemBody({ item, data, bg }: { item: CardItem; data: CardData; bg: CardBackground }) {
  if (item.kind === 'sticker') {
    return <span style={{ fontSize: '13cqw', lineHeight: 1, display: 'block' }}>{item.emoji}</span>
  }

  if (item.kind === 'text') {
    return (
      <span
        className="block whitespace-pre font-display font-bold"
        style={{ fontSize: '6.5cqw', color: item.color, textShadow: '0 0.5cqw 1.2cqw rgba(0,0,0,0.35)', lineHeight: 1.1 }}
      >
        {item.text}
      </span>
    )
  }

  switch (item.field) {
    case 'avatar':
      return (
        <div
          className="overflow-hidden rounded-full"
          style={{
            width: '38cqw',
            height: '38cqw',
            border: `1.4cqw solid ${data.rankColor}`,
            boxShadow: '0 1.6cqw 0 rgba(0,0,0,0.3), 0 3cqw 6cqw rgba(0,0,0,0.35)',
            background: 'rgba(0,0,0,0.25)',
          }}
        >
          {data.avatar ? (
            <img src={data.avatar} alt="" draggable={false} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-display font-bold" style={{ fontSize: '16cqw' }}>
              {data.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
      )
    case 'name':
      return (
        <span
          className="block max-w-[88cqw] truncate whitespace-nowrap font-display font-bold"
          style={{ fontSize: '8cqw', lineHeight: 1.15, textShadow: '0 0.5cqw 1.5cqw rgba(0,0,0,0.25)' }}
        >
          {data.name}
        </span>
      )
    case 'username':
      return data.username ? (
        <span className="block whitespace-nowrap" style={{ fontSize: '3.8cqw', color: bg.soft }}>
          @{data.username}
        </span>
      ) : null
    case 'bio':
      return data.bio ? (
        <span
          className="block text-center"
          style={{
            width: '80cqw',
            fontSize: '3.5cqw',
            lineHeight: 1.35,
            color: bg.ink,
            opacity: 0.9,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {data.bio}
        </span>
      ) : (
        <span className="block italic" style={{ fontSize: '3.2cqw', color: bg.soft }}>
          No bio yet
        </span>
      )
    case 'rank':
      return (
        <span
          className="flex items-center whitespace-nowrap font-semibold uppercase"
          style={{
            gap: '1.4cqw',
            fontSize: '3.4cqw',
            letterSpacing: '0.12em',
            padding: '1.1cqw 3.4cqw',
            borderRadius: '99cqw',
            background: plate(bg),
            border: `0.5cqw solid ${data.rankColor}`,
          }}
        >
          <span>{data.rankIcon}</span>
          {data.rankName}
        </span>
      )
    case 'level':
      return <Stat value={String(data.level)} label="Level" bg={bg} />
    case 'xp':
      return <Stat value={data.xp.toLocaleString()} label="XP" bg={bg} />
    case 'birthday':
      return data.birthday ? <Stat value={`🎂 ${data.birthday}`} label="Birthday" bg={bg} small /> : null
    case 'joined':
      return (
        <span className="block whitespace-nowrap" style={{ fontSize: '2.9cqw', color: bg.soft }}>
          Joined {data.joined}
        </span>
      )
    case 'email':
      return (
        <span className="block whitespace-nowrap" style={{ fontSize: '3cqw', color: bg.soft }}>
          {data.email}
        </span>
      )
  }
}

function Stat({ value, label, bg, small = false }: { value: string; label: string; bg: CardBackground; small?: boolean }) {
  return (
    <span
      className="flex flex-col items-center whitespace-nowrap"
      style={{ padding: '1.6cqw 3.2cqw', borderRadius: '3cqw', background: plate(bg), minWidth: '22cqw' }}
    >
      <span className="font-display font-bold" style={{ fontSize: small ? '4cqw' : '5.6cqw', lineHeight: 1.1 }}>
        {value}
      </span>
      <span className="uppercase" style={{ fontSize: '2.3cqw', letterSpacing: '0.14em', color: bg.soft }}>
        {label}
      </span>
    </span>
  )
}
