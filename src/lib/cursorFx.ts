import type { CursorFxId, ParticleStyle } from './cursors'

/**
 * Cursor animation: bursts, trails and a halo, drawn around the real pointer.
 *
 * Deliberately imperative DOM rather than React. A trail spawns particles on
 * pointermove, which fires at the display's refresh rate; routing that through
 * state would re-render on every frame to draw something that lives for half a
 * second. Here each particle is one element with a CSS animation, removed when
 * the animation ends, and the whole layer is `pointer-events: none` so it can
 * never swallow a click.
 *
 * The native cursor is never hidden. Effects decorate the pointer; they do not
 * replace it, so nothing here can make a click land in the wrong place.
 */

/** Anything that reacts to a click — the halo swells over these. */
const PRESSABLE =
  'a,button,summary,label[for],select,[role="button"],[role="tab"],[role="switch"],input[type="checkbox"],input[type="radio"]'

/** A hard ceiling. A fast mouse across a big screen would otherwise stack up
 * hundreds of elements, and past this nobody can see the difference anyway. */
const MAX_LIVE = 48

let stop: (() => void) | null = null

export function runCursorFx(fx: CursorFxId, style: ParticleStyle): void {
  stop?.()
  stop = null
  if (fx === 'none' || typeof window === 'undefined') return
  // No mouse, no cursor to decorate. A burst on every tap would also fire at
  // the start of every scroll on a phone.
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

  const layer = document.createElement('div')
  layer.className = 'fx-layer'
  layer.setAttribute('aria-hidden', 'true')
  document.body.appendChild(layer)

  let live = 0
  const pick = () => style.colors[Math.floor(Math.random() * style.colors.length)]

  function emit(
    x: number,
    y: number,
    dx: number,
    dy: number,
    opts: { dur: number; spin: number; angle: number; from?: number; to?: number },
  ): void {
    if (live >= MAX_LIVE) return
    const el = document.createElement('span')
    el.className = `fx-p fx-${style.shape}`
    const s = el.style
    s.setProperty('--c', pick())
    s.setProperty('--x0', `${x}px`)
    s.setProperty('--y0', `${y}px`)
    s.setProperty('--x1', `${x + dx}px`)
    s.setProperty('--y1', `${y + dy}px`)
    s.setProperty('--r0', `${opts.angle}deg`)
    s.setProperty('--r1', `${opts.angle + opts.spin}deg`)
    s.setProperty('--s0', String(opts.from ?? 1))
    s.setProperty('--s1', String(opts.to ?? 0.2))
    s.setProperty('--dur', `${opts.dur}ms`)
    el.addEventListener(
      'animationend',
      () => {
        el.remove()
        live--
      },
      { once: true },
    )
    layer.appendChild(el)
    live++
  }

  /** Leaves drift down; everything else flies straight out. */
  const falls = style.shape === 'leaf'

  function burst(x: number, y: number): void {
    const ring = document.createElement('span')
    ring.className = 'fx-ring'
    ring.style.setProperty('--c', style.colors[0])
    ring.style.setProperty('--x0', `${x}px`)
    ring.style.setProperty('--y0', `${y}px`)
    ring.addEventListener('animationend', () => ring.remove(), { once: true })
    layer.appendChild(ring)

    const count = 9
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5
      const dist = 16 + Math.random() * 18
      emit(x, y, Math.cos(angle) * dist, Math.sin(angle) * dist + (falls ? 14 : 0), {
        dur: 520 + Math.random() * 260,
        // Sparks stay pointed along their direction of travel; leaves tumble.
        angle: (angle * 180) / Math.PI + 90,
        spin: falls ? (Math.random() - 0.5) * 360 : 0,
      })
    }
  }

  let lastX = -1
  let lastY = -1
  let lastT = 0

  function trail(x: number, y: number, now: number): void {
    const moved = Math.hypot(x - lastX, y - lastY)
    // Spaced by distance and time together: by distance alone a slow drag
    // leaves a solid line, by time alone a fast flick leaves gaps.
    if (moved < 9 || now - lastT < 24) return
    lastX = x
    lastY = y
    lastT = now
    emit(x, y, (Math.random() - 0.5) * 10, falls ? 12 + Math.random() * 8 : (Math.random() - 0.5) * 10, {
      dur: 560,
      angle: Math.random() * 360,
      spin: falls ? (Math.random() - 0.5) * 200 : 90,
      from: 0.9,
      to: 0.1,
    })
  }

  /* --- halo -------------------------------------------------------------- */

  let halo: HTMLSpanElement | null = null
  let hx = 0
  let hy = 0
  let tx = 0
  let ty = 0
  let scale = 1
  let targetScale = 1
  let frame = 0

  if (fx === 'halo') {
    halo = document.createElement('span')
    halo.className = 'fx-halo'
    halo.style.setProperty('--c', style.colors[0])
    layer.appendChild(halo)
  }

  function tick(): void {
    frame = 0
    if (!halo) return
    // Eased toward the pointer, so the ring visibly follows. That lag is the
    // point of a halo, and it is harmless — the real cursor is already there.
    hx += (tx - hx) * 0.24
    hy += (ty - hy) * 0.24
    scale += (targetScale - scale) * 0.2
    halo.style.transform = `translate3d(${hx}px, ${hy}px, 0) scale(${scale})`
    const settled =
      Math.abs(tx - hx) < 0.3 && Math.abs(ty - hy) < 0.3 && Math.abs(targetScale - scale) < 0.005
    // Only animate while there is somewhere to go. An idle page should not run
    // a loop sixty times a second to hold a ring still.
    if (!settled) frame = requestAnimationFrame(tick)
  }

  const wake = () => {
    if (!frame) frame = requestAnimationFrame(tick)
  }

  /* --- listeners --------------------------------------------------------- */

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    if (fx === 'trail') trail(e.clientX, e.clientY, e.timeStamp)
    if (halo) {
      if (halo.style.opacity !== '1') {
        // First sighting: start on the pointer rather than sliding in from 0,0.
        hx = e.clientX
        hy = e.clientY
        halo.style.opacity = '1'
      }
      tx = e.clientX
      ty = e.clientY
      const over = e.target instanceof Element && e.target.closest(PRESSABLE)
      targetScale = over ? 1.7 : 1
      halo.classList.toggle('fx-halo-live', Boolean(over))
      wake()
    }
  }

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || e.button !== 0) return
    burst(e.clientX, e.clientY)
    if (halo) {
      scale = 0.7
      wake()
    }
  }

  const onLeave = (e: PointerEvent) => {
    // relatedTarget is null only when the pointer has left the window itself.
    if (!e.relatedTarget && halo) halo.style.opacity = '0'
  }

  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerdown', onDown, { passive: true })
  document.addEventListener('pointerout', onLeave, { passive: true })

  stop = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerdown', onDown)
    document.removeEventListener('pointerout', onLeave)
    if (frame) cancelAnimationFrame(frame)
    layer.remove()
  }
}

// A hot reload re-runs this module with `stop` reset to null, which would
// orphan the previous layer and its listeners. Dev only.
if (import.meta.hot) {
  import.meta.hot.dispose(() => stop?.())
}
