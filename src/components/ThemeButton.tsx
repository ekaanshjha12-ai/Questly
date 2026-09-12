import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../hooks/useTheme'

/**
 * The theme control: a day/night switch on the left rail.
 *
 * A switch has two positions, so this is light and dark only. "Follow my
 * device" is still what a new install gets — useTheme starts on `system` — and
 * the first tap turns that into an explicit choice. Losing a menu item is a
 * better trade than a switch with a third, invisible position.
 *
 * Built from CSS gradients and one small SVG rather than images: it has to
 * redraw mid-slide, stay crisp at any pixel density, and cost nothing to load.
 *
 * The illustration keeps its own colours — a blue sky, a yellow sun, a grey
 * moon — instead of the app's green. It is a picture of day and night, the way
 * an emoji is, and a green sky would just look wrong.
 */

const TRACK_W = 72
const TRACK_H = 32
const KNOB = 26
const PAD = (TRACK_H - KNOB) / 2
const TRAVEL = TRACK_W - KNOB - PAD * 2

/** Four-point sparkle, centred on the origin. */
const SPARKLE = 'M0 -2.2 0.55 -0.55 2.2 0 0.55 0.55 0 2.2 -0.55 0.55 -2.2 0 -0.55 -0.55Z'

export default function ThemeButton() {
  const { resolved, setChoice } = useTheme()
  const dark = resolved === 'dark'
  const reduce = useReducedMotion()

  const slide = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 520, damping: 34 }
  const fade = reduce ? { duration: 0 } : { duration: 0.35, ease: 'easeOut' as const }

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? 'Dark theme — switch to light' : 'Light theme — switch to dark'}
      onClick={() => setChoice(dark ? 'light' : 'dark')}
      initial={{ x: -40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      whileTap={reduce ? undefined : { scale: 0.95 }}
      transition={{ delay: 0.35 }}
      // Same slot on the rail the old button used: above the planner, bottom
      // corner on phones, beside the content from md up.
      className="fixed bottom-[10.75rem] left-1.5 z-40 rounded-full bg-ink-850 p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 md:bottom-auto md:top-[calc(50%-5.5rem)]"
      style={{
        // The raised bezel: a lit top edge and a cast shadow, so the recessed
        // track inside reads as sunk into something.
        boxShadow:
          'inset 0 1px 0 var(--clay-sheen), 0 3px 0 var(--extrude-card), 0 8px 18px -6px var(--clay-lift)',
      }}
    >
      <span
        className="relative block overflow-hidden rounded-full"
        style={{
          width: TRACK_W,
          height: TRACK_H,
          boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.45), inset 0 -1px 0 rgba(255,255,255,0.25)',
        }}
      >
        {/* --- sky ------------------------------------------------------- */}
        <motion.span
          className="absolute inset-0"
          style={{ background: 'linear-gradient(90deg, #4ea8ef 0%, #7cc4f7 60%, #9fd6fb 100%)' }}
          animate={{ opacity: dark ? 0 : 1 }}
          transition={fade}
        />
        {/* --- night ----------------------------------------------------- */}
        <motion.span
          className="absolute inset-0"
          style={{ background: 'linear-gradient(90deg, #17181d 0%, #25272e 55%, #3a3d46 100%)' }}
          animate={{ opacity: dark ? 1 : 0 }}
          transition={fade}
        />

        <svg
          className="absolute inset-0"
          width={TRACK_W}
          height={TRACK_H}
          viewBox={`0 0 ${TRACK_W} ${TRACK_H}`}
          aria-hidden
        >
          {/* Clouds: a pale back row and a white front row, sinking out of
              sight as night comes in. */}
          <motion.g
            animate={{ y: dark ? 16 : 0, opacity: dark ? 0 : 1 }}
            transition={fade}
          >
            <g fill="#d6ecfc">
              <circle cx={40} cy={27} r={7} />
              <circle cx={50} cy={20} r={8} />
              <circle cx={61} cy={17} r={7.5} />
              <circle cx={71} cy={20} r={8} />
            </g>
            <g fill="#ffffff">
              <circle cx={34} cy={33} r={7} />
              <circle cx={45} cy={29} r={7.5} />
              <circle cx={56} cy={26} r={8} />
              <circle cx={67} cy={27} r={8} />
              <circle cx={76} cy={25} r={7} />
            </g>
          </motion.g>

          {/* Stars, dropping in from above on the side the moon is not. */}
          <motion.g
            animate={{ y: dark ? 0 : -12, opacity: dark ? 1 : 0 }}
            transition={fade}
            fill="#ffffff"
          >
            <path d={SPARKLE} transform="translate(11 9) scale(0.9)" />
            <path d={SPARKLE} transform="translate(27 20) scale(0.75)" />
            <path d={SPARKLE} transform="translate(21 7) scale(0.55)" />
            <circle cx={8} cy={20} r={0.8} />
            <circle cx={17} cy={26} r={0.7} />
            <circle cx={33} cy={9} r={0.7} />
            <circle cx={37} cy={25} r={0.6} />
          </motion.g>
        </svg>

        {/* --- the knob: sun by day, moon by night ----------------------- */}
        <motion.span
          className="absolute rounded-full"
          style={{
            top: PAD,
            left: PAD,
            width: KNOB,
            height: KNOB,
            boxShadow: '0 2px 4px rgba(0,0,0,0.35)',
          }}
          animate={{ x: dark ? TRAVEL : 0 }}
          transition={slide}
        >
          {/* Halo rings — the stepped glow in the reference. They live on the
              knob rather than in the SVG so they travel with it: a transform
              animated on an SVG <g> did not move, and left the glow stranded
              on the day side at night. The track's overflow clips them. */}
          {[68, 52, 39].map((d, i) => (
            <span
              key={d}
              aria-hidden
              className="pointer-events-none absolute rounded-full"
              style={{
                width: d,
                height: d,
                top: (KNOB - d) / 2,
                left: (KNOB - d) / 2,
                background: `rgba(255,255,255,${[0.05, 0.06, 0.08][i]})`,
              }}
            />
          ))}

          {/* Sun. The darker band along the bottom is the same zero-blur
              extrusion trick the rest of the app's surfaces use. */}
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle at 34% 28%, #ffe98a 0%, #ffcf2e 45%, #f7b500 100%)',
              boxShadow: 'inset 0 -2.5px 0 #e39a00, inset 0 1.5px 1px rgba(255,255,255,0.6)',
            }}
            animate={{ opacity: dark ? 0 : 1 }}
            transition={fade}
          />
          {/* Moon, with its craters. */}
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle at 34% 28%, #f4f5f8 0%, #d9dce3 50%, #b9bdc7 100%)',
              boxShadow: 'inset 0 -2.5px 0 #8f949f, inset 0 1.5px 1px rgba(255,255,255,0.7)',
            }}
            animate={{ opacity: dark ? 1 : 0, rotate: dark ? 0 : -40 }}
            transition={dark ? slide : fade}
          >
            <Crater size={9} top={10} left={4} />
            <Crater size={5} top={4} left={13} />
            <Crater size={6} top={14} left={16} />
          </motion.span>
        </motion.span>
      </span>
    </motion.button>
  )
}

function Crater({ size, top, left }: { size: number; top: number; left: number }) {
  return (
    <span
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        top,
        left,
        background: '#a7acb7',
        boxShadow: 'inset 0 1px 1.5px rgba(0,0,0,0.3), 0 0.5px 0 rgba(255,255,255,0.6)',
      }}
    />
  )
}
