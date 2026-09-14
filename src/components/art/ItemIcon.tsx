import { useMemo } from 'react'
import { Box, Sparkles } from 'lucide-react'
import { itemIcon } from '../../art/hero'

/** An item's pixel icon, or a neutral glyph for items drawn elsewhere (3D). */
export default function ItemIcon({ itemId, size = 48, model = false, className = '' }: { itemId: string; size?: number; model?: boolean; className?: string }) {
  const src = useMemo(() => itemIcon(itemId), [itemId])
  if (src) return <img src={src} alt="" width={size} height={size} className={`pixelated select-none ${className}`} draggable={false} />
  const Icon = model ? Sparkles : Box
  return (
    <span className={`inline-flex items-center justify-center text-reward-400 ${className}`} style={{ width: size, height: size }}>
      <Icon style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  )
}
