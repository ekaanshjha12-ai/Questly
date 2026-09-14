import { block, cached, dot, makeCanvas, mix, tone, type Ctx } from './pixel'

/**
 * The player's base: a study with a bookshelf, a desk and a window onto the
 * sky. The window follows the player's own clock — dawn light, open daylight,
 * an ember dusk, a starry night — and after dark the candle carries the room.
 *
 * Drawn at 160 × 84 and scaled up; the hero stands in it as a separate layer
 * so they can idle.
 */

export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night'

export function timeOfDay(date = new Date()): TimeOfDay {
  const h = date.getHours()
  if (h >= 5 && h < 11) return 'morning'
  if (h >= 11 && h < 17) return 'day'
  if (h >= 17 && h < 20) return 'evening'
  return 'night'
}

export const SCENE_W = 160
export const SCENE_H = 84

function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SKIES: Record<TimeOfDay, [string, string]> = {
  morning: ['#f3c29a', '#8dc4e6'],
  day: ['#86ccf2', '#d3effd'],
  evening: ['#6b3c75', '#f0895a'],
  night: ['#0c1430', '#1d2c56'],
}

function sky(ctx: Ctx, t: TimeOfDay, x0: number, y0: number, x1: number, y1: number) {
  const [top, bottom] = SKIES[t]
  for (let y = y0; y <= y1; y += 1) block(ctx, x0, y, x1, y, mix(top, bottom, (y - y0) / Math.max(1, y1 - y0)))
  const r = rng(7)
  if (t === 'night') {
    for (let i = 0; i < 16; i += 1) dot(ctx, x0 + Math.floor(r() * (x1 - x0)), y0 + Math.floor(r() * (y1 - y0 - 6)), r() > 0.7 ? '#ffffff' : '#9fb3e8')
    block(ctx, x1 - 9, y0 + 4, x1 - 6, y0 + 7, '#ece8d6')
    dot(ctx, x1 - 9, y0 + 4, '#1d2c56')
    dot(ctx, x1 - 6, y0 + 7, '#c9c4b0')
  } else if (t === 'day') {
    block(ctx, x0 + 3, y0 + 6, x0 + 11, y0 + 8, '#ffffff')
    block(ctx, x0 + 5, y0 + 5, x0 + 9, y0 + 5, '#ffffff')
    block(ctx, x1 - 12, y0 + 12, x1 - 5, y0 + 13, '#f4fbff')
    block(ctx, x1 - 8, y0 + 3, x1 - 5, y0 + 6, '#fff6c8')
  } else if (t === 'morning') {
    block(ctx, x0 + 4, y1 - 7, x0 + 9, y1 - 3, '#ffe39a')
    block(ctx, x0 + 5, y1 - 8, x0 + 8, y1 - 8, '#ffe39a')
  } else {
    block(ctx, x1 - 12, y1 - 8, x1 - 5, y1 - 2, '#ffb35c')
    block(ctx, x1 - 11, y1 - 9, x1 - 6, y1 - 9, '#ffb35c')
  }
  // hills on the horizon
  for (let x = x0; x <= x1; x += 1) {
    const h = 3 + Math.round(2 * Math.sin((x - x0) * 0.35) + Math.sin((x - x0) * 0.9))
    block(ctx, x, y1 - h, x, y1, t === 'night' ? '#0a1024' : t === 'evening' ? '#3b2447' : '#4f7d5a')
  }
}

function drawScene(t: TimeOfDay): string {
  const { canvas, ctx } = makeCanvas(SCENE_W, SCENE_H)

  // --- wall -----------------------------------------------------------------
  block(ctx, 0, 0, SCENE_W - 1, 55, '#2b241f')
  for (let x = 0; x < SCENE_W; x += 12) block(ctx, x, 0, x, 55, '#241e1a')
  block(ctx, 0, 7, SCENE_W - 1, 9, '#3d3027')
  block(ctx, 0, 10, SCENE_W - 1, 10, '#211b17')

  // --- window --------------------------------------------------------------
  block(ctx, 62, 13, 98, 42, '#4a3b2f')
  sky(ctx, t, 65, 16, 95, 39)
  block(ctx, 79, 16, 80, 39, '#4a3b2f')
  block(ctx, 65, 27, 95, 28, '#4a3b2f')
  block(ctx, 60, 42, 100, 44, '#5a4838')

  // --- bookshelf -------------------------------------------------------------
  block(ctx, 8, 14, 46, 56, '#56402f')
  block(ctx, 10, 16, 44, 55, '#2f241c')
  const r = rng(42)
  const bookColours = ['#8e2b2b', '#2f4a7a', '#3f6a49', '#c9a14a', '#6f3c80', '#b85c2b', '#d8cfb8', '#2b7a78']
  for (const shelf of [26, 38, 50]) {
    block(ctx, 10, shelf + 1, 44, shelf + 2, '#56402f')
    let x = 11
    while (x < 43) {
      const w = r() > 0.7 ? 3 : 2
      const h = 7 + Math.floor(r() * 3)
      const c = bookColours[Math.floor(r() * bookColours.length)]
      if (r() > 0.88) {
        x += 2
        continue
      }
      block(ctx, x, shelf - h + 1, Math.min(43, x + w - 1), shelf, c)
      dot(ctx, x, shelf - h + 2, tone(c, 0.3))
      x += w + (r() > 0.8 ? 1 : 0)
    }
  }
  // a skull-free, cosy potion shelf-top
  block(ctx, 14, 11, 16, 13, '#3fcf8a')
  block(ctx, 22, 12, 24, 13, '#c96a3a')

  // --- desk ------------------------------------------------------------------
  block(ctx, 106, 44, 152, 46, '#6b4a30')
  block(ctx, 106, 47, 152, 47, '#4b3322')
  block(ctx, 108, 48, 110, 60, '#4b3322')
  block(ctx, 148, 48, 150, 60, '#4b3322')
  // open book and quill
  block(ctx, 126, 41, 142, 43, '#eadbb8')
  block(ctx, 134, 41, 134, 43, '#c9b690')
  for (let x = 128; x <= 140; x += 3) block(ctx, x, 42, x + 1, 42, '#8f7d5c')
  block(ctx, 144, 36, 145, 43, '#f2ede2')
  // candle
  block(ctx, 115, 38, 118, 43, '#efe6d2')
  block(ctx, 114, 43, 119, 43, '#b8a06e')
  const lit = t === 'evening' || t === 'night'
  if (lit) {
    block(ctx, 116, 35, 117, 37, '#ffcf5a')
    dot(ctx, 116, 34, '#fff1b8')
  }
  // plant
  block(ctx, 151, 50, 157, 56, '#8a5a3a')
  for (const [x, y] of [[152, 47], [154, 45], [156, 47], [153, 49], [155, 48], [150, 48]]) block(ctx, x, y, x + 1, y + 2, '#3f7a4a')

  // --- floor -------------------------------------------------------------------
  block(ctx, 0, 56, SCENE_W - 1, SCENE_H - 1, '#3a2c22')
  for (let y = 60; y < SCENE_H; y += 6) block(ctx, 0, y, SCENE_W - 1, y, '#302419')
  for (let row = 0; row < 5; row += 1) {
    for (let x = (row % 2) * 16; x < SCENE_W; x += 32) block(ctx, x, 56 + row * 6, x, 59 + row * 6, '#302419')
  }
  // rug
  const rug = '#6b2f2f'
  const rugRows: [number, number][] = [[62, 98], [56, 104], [52, 108], [50, 110], [50, 110], [50, 110], [52, 108], [56, 104], [62, 98]]
  rugRows.forEach(([a, b], i) => block(ctx, a, 66 + i * 2, b, 67 + i * 2, rug))
  for (let x = 56; x <= 104; x += 4) dot(ctx, x, 71, '#c9a14a')
  for (let x = 58; x <= 102; x += 4) dot(ctx, x, 79, '#c9a14a')

  // --- light ---------------------------------------------------------------------
  const wash: Record<TimeOfDay, string | null> = {
    morning: 'rgba(255, 190, 140, 0.08)',
    day: null,
    evening: 'rgba(120, 50, 70, 0.18)',
    night: 'rgba(8, 12, 36, 0.42)',
  }
  if (wash[t]) {
    ctx.fillStyle = wash[t] as string
    ctx.fillRect(0, 0, SCENE_W, SCENE_H)
  }
  // light through the window onto the floor
  if (t !== 'night') {
    ctx.fillStyle = t === 'evening' ? 'rgba(255, 150, 90, 0.10)' : 'rgba(255, 245, 210, 0.10)'
    ctx.beginPath()
    ctx.moveTo(65, 39)
    ctx.lineTo(95, 39)
    ctx.lineTo(112, 83)
    ctx.lineTo(48, 83)
    ctx.closePath()
    ctx.fill()
  }
  if (lit) {
    const glow = ctx.createRadialGradient(116, 36, 1, 116, 38, 34)
    glow.addColorStop(0, 'rgba(255, 200, 110, 0.45)')
    glow.addColorStop(1, 'rgba(255, 200, 110, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(80, 4, 72, 72)
  }
  return canvas.toDataURL('image/png')
}

export function baseScene(t: TimeOfDay): string {
  return cached(`scene:base:${t}`, () => drawScene(t))
}
