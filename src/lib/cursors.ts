import { runCursorFx } from './cursorFx'

/**
 * Cursor sets, and the one place that applies them.
 *
 * The pointer itself stays a native CSS cursor in every set. Browsers do not
 * animate cursor images — an animated GIF shows its first frame — and the only
 * way to fake it is an element chasing the mouse, which always trails the real
 * pointer and makes every click feel slightly off. So the cursor is drawn
 * natively and stays exactly where the pointer is, and the animation lives in a
 * separate effects layer around it (see cursorFx.ts).
 *
 * Every image is generated here rather than shipped as a file: vector sets are
 * SVG strings, pixel sets are character grids turned into SVG. They cost no
 * request, stay sharp at any density, and are all original — the leaf set takes
 * the idea of a pixel-art plant cursor, not anyone's drawing of one.
 *
 * 32px is the ceiling: it is the largest image every platform still accepts as a
 * cursor. Pixel sets are 16-cell grids drawn at 2x, so each cell lands on whole
 * device pixels at the common 1x, 1.5x and 2x display scales.
 */

export type CursorSetId = 'sword' | 'leaf' | 'pixel' | 'wand' | 'system'
export type CursorFxId = 'none' | 'burst' | 'trail' | 'halo'

export interface CursorImage {
  svg: string
  /** Hotspot: the pixel that actually clicks. */
  x: number
  y: number
}

export interface ParticleStyle {
  shape: 'spark' | 'leaf' | 'pixel' | 'star' | 'dot'
  colors: string[]
}

export interface CursorSet {
  id: CursorSetId
  name: string
  blurb: string
  /** Null means the operating system's own cursor. */
  default: CursorImage | null
  pointer: CursorImage | null
  pixelated: boolean
  particle: ParticleStyle
}

/* --- pixel art ------------------------------------------------------------ */

/** Turns a character grid into a crisp SVG, merging runs of one colour into a
 * single rect so a 16x16 sprite is a few dozen elements rather than 256. */
function pixelSvg(rows: string[], palette: Record<string, string>, scale = 2): string {
  const h = rows.length
  const w = Math.max(...rows.map((r) => r.length))
  let rects = ''
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const fill = palette[row[x]]
      if (!fill) {
        x++
        continue
      }
      let run = 1
      while (x + run < row.length && row[x + run] === row[x]) run++
      rects += `<rect x="${x}" y="${y}" width="${run}" height="1" fill="${fill}"/>`
      x += run
    }
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`
}

/**
 * A pixel leaf, tip at the top-left where the pointer is, stem to the
 * bottom-right.
 *
 * Generated from a shape rather than typed cell by cell, so the outline stays
 * clean. The shape is a teardrop — a round body with two straight edges running
 * out to a point — tested against each cell's centre. A rotated ellipse was
 * tried first and does not survive a 16-cell grid: at 45° it quantizes into a
 * diamond, and made any wider it clips into a square. A circle is the same from
 * every angle, so it stays round; only the point is diagonal.
 *
 * Outline is any filled cell touching an empty one; the two halves take
 * different greens so it reads as lit from above.
 */
const LEAF_SIZE = 16
const LEAF_CENTRE = 9
const LEAF_RADIUS = 4.6
const LEAF_TIP = 0.6

function inLeaf(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= LEAF_SIZE || y >= LEAF_SIZE) return false
  const px = x + 0.5
  const py = y + 0.5
  if ((px - LEAF_CENTRE) ** 2 + (py - LEAF_CENTRE) ** 2 <= LEAF_RADIUS ** 2) return true

  // The point: a wedge from the tip, opening at exactly the angle that meets
  // the circle tangentially, so the edges run into the body without a kink.
  const reach = Math.SQRT2 * (LEAF_CENTRE - LEAF_TIP)
  const spread = Math.asin(LEAF_RADIUS / reach)
  const along = (px - LEAF_TIP + (py - LEAF_TIP)) / Math.SQRT2
  const across = Math.abs(px - py) / Math.SQRT2
  const tangent = Math.sqrt(reach ** 2 - LEAF_RADIUS ** 2) * Math.cos(spread)
  return along >= 0 && along <= tangent && across <= along * Math.tan(spread)
}

/** The first cell of the tip, which is where a click should land. */
function leafHotspot(): { x: number; y: number } {
  for (let sum = 0; sum < LEAF_SIZE * 2; sum++) {
    for (let x = 0; x <= sum; x++) {
      if (inLeaf(x, sum - x)) return { x: x * 2 + 1, y: (sum - x) * 2 + 1 }
    }
  }
  return { x: 3, y: 3 }
}

function leafRows(sparkle: boolean): string[] {
  const SIZE = LEAF_SIZE
  const inBody = inLeaf

  const grid: string[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill('.'))

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!inBody(x, y)) continue
      const edge = !inBody(x - 1, y) || !inBody(x + 1, y) || !inBody(x, y - 1) || !inBody(x, y + 1)
      if (edge) grid[y][x] = 'K'
      else if (x === y) grid[y][x] = 'V'
      else if (x > y) grid[y][x] = 'L'
      else grid[y][x] = 'G'
    }
  }

  // A highlight just inside the lit edge.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (grid[y][x] !== 'L') continue
      if (grid[y - 1]?.[x] === 'K' || grid[y]?.[x + 1] === 'K') grid[y][x] = 'H'
    }
  }

  // The stem, continuing the midrib out of the body.
  for (let i = LEAF_CENTRE; i < SIZE; i++) {
    if (grid[i][i] === '.') grid[i][i] = 'K'
  }

  if (sparkle) {
    grid[1][12] = 'Y'
    grid[2][11] = 'Y'
    grid[2][12] = 'W'
    grid[2][13] = 'Y'
    grid[3][12] = 'Y'
  }

  return grid.map((row) => row.join(''))
}

const LEAF = {
  K: '#1b3a1d',
  H: '#b6ec7a',
  L: '#6fc24c',
  G: '#3f9a3d',
  V: '#24662a',
}

const LEAF_LIVE = {
  K: '#1b3a1d',
  H: '#e2ffb0',
  L: '#9fe35f',
  G: '#5cbc45',
  V: '#2f7d2f',
  Y: '#ffc933',
  W: '#ffffff',
}

/** The retro arrow, cell for cell the shape every desktop has used since the
 * eighties — close enough to recognise instantly, chunky enough to feel
 * deliberate. */
const PIXEL_ARROW = [
  'K...............',
  'KK..............',
  'KWK.............',
  'KWWK............',
  'KWWWK...........',
  'KWWWWK..........',
  'KWWWWWK.........',
  'KWWWWWWK........',
  'KWWWWWWWK.......',
  'KWWWWWWWWK......',
  'KWWWWWKKKKK.....',
  'KWWKWWK.........',
  'KWK.KWWK........',
  'KK..KWWK........',
  'K....KWWK.......',
  '.....KKKK.......',
]

const PIXEL_HAND = [
  '....KK..........',
  '...KWWK.........',
  '...KWWK.........',
  '...KWWK.........',
  '...KWWKKK.......',
  '...KWWKWWKKK....',
  '...KWWKWWKWWKK..',
  'KK.KWWKWWKWWKWK.',
  'KWKKWWWWWWWWKWK.',
  'KWWKWWWWWWWWWWK.',
  '.KWWWWWWWWWWWWK.',
  '..KWWWWWWWWWWWK.',
  '..KWWWWWWWWWWK..',
  '...KWWWWWWWWWK..',
  '....KWWWWWWWK...',
  '....KKKKKKKKK...',
]

const MONO = { K: '#0a0a0a', W: '#ffffff' }

/* --- vector sets ---------------------------------------------------------- */

function swordSvg(blade: string, guard: string, pommel: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<path d="M16.2 16.2 22.8 22.8" fill="none" stroke="#0a0a0a" stroke-width="5.4" stroke-linecap="round"/>` +
    `<path d="M19.6 11.2 11.2 19.6" fill="none" stroke="#0a0a0a" stroke-width="5.6" stroke-linecap="round"/>` +
    `<path d="M2.6 2.6 17.6 12.4 12.4 17.6Z" fill="${blade}" stroke="#0a0a0a" stroke-width="1.8" stroke-linejoin="round"/>` +
    `<path d="M19.6 11.2 11.2 19.6" fill="none" stroke="${guard}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="M17.4 17.4 21.6 21.6" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"/>` +
    `<circle cx="24.6" cy="24.6" r="3" fill="${pommel}" stroke="#0a0a0a" stroke-width="1.7"/>` +
    `</svg>`
  )
}

const STAR = 'M7 0.8 8.9 5.1 13.2 7 8.9 8.9 7 13.2 5.1 8.9 0.8 7 5.1 5.1Z'

function wandSvg(live: boolean): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<path d="M12 12 27 27" stroke="#0a0a0a" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="M12.6 12.6 26.4 26.4" stroke="#2e2e2e" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M23.2 23.2 26.4 26.4" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>` +
    (live ? `<circle cx="7" cy="7" r="6.6" fill="#ffe066" opacity="0.35"/>` : '') +
    `<path d="${STAR}" fill="${live ? '#fff59d' : '#ffd43b'}" stroke="#0a0a0a" stroke-width="1.4" stroke-linejoin="round"/>` +
    (live
      ? `<path d="M17 2.4 17.8 4.2 19.6 5 17.8 5.8 17 7.6 16.2 5.8 14.4 5 16.2 4.2Z" fill="#ffffff" stroke="#0a0a0a" stroke-width="1"/>` +
        `<path d="M4.6 15.4 5.3 17 6.9 17.7 5.3 18.4 4.6 20 3.9 18.4 2.3 17.7 3.9 17Z" fill="#ffffff" stroke="#0a0a0a" stroke-width="1"/>`
      : '') +
    `</svg>`
  )
}

/* --- the sets ------------------------------------------------------------- */

export const CURSOR_SETS: CursorSet[] = [
  {
    id: 'sword',
    name: 'Sword',
    blurb: 'The Questly blade',
    default: { svg: swordSvg('#ffffff', '#4ade80', '#4ade80'), x: 3, y: 3 },
    pointer: { svg: swordSvg('#4ade80', '#ffffff', '#ffffff'), x: 3, y: 3 },
    pixelated: false,
    particle: { shape: 'spark', colors: ['#4ade80', '#22c55e', '#bbf7d0', '#ffffff'] },
  },
  {
    id: 'leaf',
    name: 'Leaf',
    blurb: 'Pixel plant',
    default: { svg: pixelSvg(leafRows(false), LEAF), ...leafHotspot() },
    pointer: { svg: pixelSvg(leafRows(true), LEAF_LIVE), ...leafHotspot() },
    pixelated: true,
    particle: { shape: 'leaf', colors: ['#6fc24c', '#3f9a3d', '#9fe35f', '#b6ec7a'] },
  },
  {
    id: 'pixel',
    name: 'Retro',
    blurb: '8-bit arrow',
    default: { svg: pixelSvg(PIXEL_ARROW, MONO), x: 1, y: 1 },
    pointer: { svg: pixelSvg(PIXEL_HAND, MONO), x: 9, y: 1 },
    pixelated: true,
    particle: { shape: 'pixel', colors: ['#4ade80', '#ffffff', '#0a0a0a'] },
  },
  {
    id: 'wand',
    name: 'Wand',
    blurb: 'Magic star',
    default: { svg: wandSvg(false), x: 7, y: 7 },
    pointer: { svg: wandSvg(true), x: 7, y: 7 },
    pixelated: false,
    particle: { shape: 'star', colors: ['#ffd43b', '#fff59d', '#ffffff', '#fbbf24'] },
  },
  {
    id: 'system',
    name: 'System',
    blurb: 'Your OS default',
    default: null,
    pointer: null,
    pixelated: false,
    particle: { shape: 'dot', colors: ['#4ade80', '#a3a3a3'] },
  },
]

export const CURSOR_FX: { id: CursorFxId; name: string; blurb: string }[] = [
  { id: 'none', name: 'None', blurb: 'Just the cursor' },
  { id: 'burst', name: 'Burst', blurb: 'A pop on every click' },
  { id: 'trail', name: 'Trail', blurb: 'Leaves a trail as you move' },
  { id: 'halo', name: 'Halo', blurb: 'A ring that follows and swells on buttons' },
]

export function findCursorSet(id: string): CursorSet {
  return CURSOR_SETS.find((s) => s.id === id) ?? CURSOR_SETS[0]
}

export function cursorUrl(image: CursorImage): string {
  return `url("data:image/svg+xml,${encodeURIComponent(image.svg)}") ${image.x} ${image.y}`
}

/* --- preferences ---------------------------------------------------------- */

/** Per device, like the theme — a cursor is a property of the mouse in front
 * of you, not of the account. */
const SET_KEY = 'questly:v1:cursor'
const FX_KEY = 'questly:v1:cursor-fx'

export interface CursorPrefs {
  set: CursorSetId
  fx: CursorFxId
}

export function loadCursorPrefs(): CursorPrefs {
  let set: string | null = null
  let fx: string | null = null
  try {
    set = localStorage.getItem(SET_KEY)
    fx = localStorage.getItem(FX_KEY)
  } catch {
    // Storage blocked — fall through to the defaults.
  }
  // Someone who has asked their system for less motion gets none by default.
  // They can still turn it on; that is their call, not ours.
  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return {
    set: findCursorSet(set ?? 'sword').id,
    fx: CURSOR_FX.some((f) => f.id === fx) ? (fx as CursorFxId) : reduced ? 'none' : 'burst',
  }
}

export function saveCursorPrefs(prefs: CursorPrefs): void {
  try {
    localStorage.setItem(SET_KEY, prefs.set)
    localStorage.setItem(FX_KEY, prefs.fx)
  } catch {
    // Private mode — the choice lasts until reload.
  }
}

/**
 * Applies a set by writing two CSS variables the stylesheet reads, then starts
 * whichever effect goes with it.
 *
 * Variables on the root rather than a class per set, so the stylesheet keeps a
 * single rule for "anything pressable" and never has to know which sets exist.
 */
export function applyCursorPrefs(prefs: CursorPrefs): void {
  const set = findCursorSet(prefs.set)
  const root = document.documentElement.style
  root.setProperty('--cursor-default', set.default ? `${cursorUrl(set.default)}, auto` : 'auto')
  root.setProperty('--cursor-pointer', set.pointer ? `${cursorUrl(set.pointer)}, pointer` : 'pointer')
  runCursorFx(prefs.fx, set.particle)
}
