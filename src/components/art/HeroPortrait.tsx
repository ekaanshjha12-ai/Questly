import { useMemo } from 'react'
import type { Look } from '../../lib/api'
import { heroFrame } from '../../art/hero'

/**
 * A head-and-shoulders crop of a character in a round frame — for avatars in
 * lists, the header and the feed. The ring colour marks the player's rank or
 * a highlight.
 */
export default function HeroPortrait({
  look,
  size = 40,
  ring = 'border-ink-600',
  className = '',
  label,
}: {
  look: Look | null | undefined
  size?: number
  ring?: string
  className?: string
  label?: string
}) {
  const key = JSON.stringify(look ?? null)
  const src = useMemo(
    () => heroFrame(look ?? { appearance: null, equipment: {} }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )
  // The sprite is 32 × 40; showing it at 2.1× the frame and nudging it down
  // puts the face and shoulders in the circle.
  const spriteHeight = Math.round(size * 2.1)
  const spriteWidth = Math.round((spriteHeight * 32) / 40)
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`relative inline-block shrink-0 overflow-hidden rounded-full border-2 bg-gradient-to-b from-ink-700 to-ink-850 ${ring} ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="pixelated absolute left-1/2 max-w-none select-none"
        style={{ height: spriteHeight, width: spriteWidth, top: -Math.round(size * 0.18), transform: 'translateX(-50%)' }}
      />
    </span>
  )
}
