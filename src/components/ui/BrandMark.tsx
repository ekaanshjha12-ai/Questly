import mark from '../../assets/brand/questly-mark.webp'

/** The Questly logo: the mossy voxel Q on its tile. Decorative wherever the name sits beside it. */
export default function BrandMark({ size = 44, className = '', label }: { size?: number; className?: string; label?: string }) {
  return (
    <img
      src={mark}
      width={size}
      height={size}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className={`shrink-0 select-none drop-shadow-[0_4px_14px_rgba(52,211,153,0.25)] ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
