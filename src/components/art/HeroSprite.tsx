import { useMemo } from 'react'
import type { Look } from '../../lib/api'
import { HERO_H, HERO_W, heroFrame, heroSheet } from '../../art/hero'

/**
 * The player's character. Drawn once per look and cached, then scaled up
 * pixel-sharp. Idles with a slow bob and an occasional blink unless `still`.
 */
export default function HeroSprite({
  look,
  height = 160,
  still = false,
  className = '',
  label = 'Character',
}: {
  look: Look | null | undefined
  /** Rendered height in CSS pixels; width follows the 32 × 40 shape. */
  height?: number
  still?: boolean
  className?: string
  label?: string
}) {
  const key = JSON.stringify(look ?? null)
  const image = useMemo(() => {
    const safe: Look = look ?? { appearance: null, equipment: {} }
    return still ? heroFrame(safe) : heroSheet(safe)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, still])
  const width = Math.round((height * HERO_W) / HERO_H)

  if (still) {
    return <img src={image} alt={label} width={width} height={height} className={`pixelated select-none ${className}`} draggable={false} />
  }
  return (
    <span className={`hero-bob inline-block ${className}`} style={{ width, height }}>
      <span
        role="img"
        aria-label={label}
        className="pixelated hero-blink block h-full w-full"
        style={{ backgroundImage: `url(${image})`, backgroundSize: '200% 100%', backgroundRepeat: 'no-repeat' }}
      />
    </span>
  )
}
