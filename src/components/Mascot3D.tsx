import { motion, useReducedMotion } from 'framer-motion'

export const MASCOT_SRC = '/models/guide-mascot.png'

/**
 * The guide's face.
 *
 * A drawn character rather than a 3D model. It was tempting to keep the GLB
 * pipeline, but a hand-drawn illustration loses its line and shading the moment
 * it becomes geometry, and a flat image costs no WebGL context, no decoder and
 * no draw loop — on a phone opening the walkthrough, that is the difference
 * between instant and a beat of nothing.
 *
 * The liveliness comes from three motions on unrelated periods — a breath, a
 * tilt and a drift — so they never resolve into a visible loop the way a single
 * repeating bob does. Speaking deepens the breath and quickens the tilt, which
 * reads as addressing you rather than idling.
 */
export default function Mascot3D({
  size = 132,
  speaking = false,
}: {
  size?: number
  speaking?: boolean
}) {
  // Someone who asks the system for less motion gets a still image, not a
  // slower wobble.
  const still = useReducedMotion()
  const depth = speaking ? 1.6 : 1

  return (
    <div
      style={{ width: size, height: size }}
      className="relative shrink-0 select-none"
      aria-hidden
    >
      {/* Contact shadow, not a spotlight. Wide, low and heavily blurred so it
          reads as the character resting on the panel — at full strength it
          becomes an orange blob sitting behind them. */}
      <div
        className="absolute inset-x-[22%] bottom-[9%] h-[8%] rounded-[50%] opacity-40 blur-lg"
        style={{ background: 'var(--glow-gold)' }}
      />
      <motion.img
        src={MASCOT_SRC}
        alt=""
        draggable={false}
        className="relative h-full w-full object-contain"
        animate={
          still
            ? undefined
            : {
                y: [0, -3 * depth, 0, -1.5 * depth, 0],
                rotate: [0, 1.1, 0, -1.1, 0],
                scaleY: [1, 1 + 0.012 * depth, 1, 1 + 0.006 * depth, 1],
              }
        }
        transition={
          still
            ? undefined
            : {
                duration: speaking ? 3.1 : 4.7,
                repeat: Infinity,
                ease: 'easeInOut',
                times: [0, 0.28, 0.5, 0.76, 1],
              }
        }
      />
    </div>
  )
}
