import { block, cached, dot, makeCanvas, mix, tone, type Ctx } from './pixel'
import type { TimeOfDay } from './scene'

/**
 * The Questly overworld, painted in code.
 *
 * A 480 × 360 map, scaled up pixel-sharp: mountains along the north with the
 * Elite citadel beyond a gate, a river running south through the middle with
 * bridges where the roads cross, forests between the districts, and each
 * region with its own buildings and colours. It is drawn once per time of day
 * and per set of locked regions, then cached — locked regions sit under fog
 * behind barriers until the server says they are open.
 *
 * Positions of every region are exported so the screen can place real,
 * focusable markers over the picture.
 */

export const WORLD_W = 480
export const WORLD_H = 360

export type RegionId =
  | 'focus_sanctum'
  | 'scholars_sanctuary'
  | 'builders_district'
  | 'creators_quarter'
  | 'training_grounds'
  | 'archive'
  | 'digital_workshop'
  | 'innovation_district'
  | 'elite_region'

/** Marker anchors on the base map. */
export const REGION_POINTS: Record<RegionId, { x: number; y: number }> = {
  elite_region: { x: 240, y: 26 },
  innovation_district: { x: 420, y: 92 },
  scholars_sanctuary: { x: 70, y: 98 },
  focus_sanctum: { x: 240, y: 168 },
  builders_district: { x: 408, y: 190 },
  archive: { x: 58, y: 214 },
  creators_quarter: { x: 84, y: 304 },
  training_grounds: { x: 240, y: 300 },
  digital_workshop: { x: 394, y: 262 },
}

export const UNCHARTED_POINT = { x: 458, y: 346 }

/** Where NPCs walk: pairs of road points, for the screen to animate between. */
export const WALKWAYS: [number, number, number, number][] = [
  [240, 205, 240, 270],
  [170, 204, 232, 190],
  [262, 190, 372, 190],
  [240, 70, 240, 140],
  [260, 104, 380, 96],
]

type Point = [number, number]

function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Lights {
  windows: { x: number; y: number; w: number; h: number; color: string }[]
  glows: { x: number; y: number; r: number; color: string }[]
}

/* --- terrain ------------------------------------------------------------------- */

function disc(ctx: Ctx, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color
  for (let y = -r; y <= r; y += 1) {
    const w = Math.floor(Math.sqrt(r * r - y * y))
    ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1)
  }
}

function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, color: string) {
  ctx.fillStyle = color
  for (let y = -ry; y <= ry; y += 1) {
    const w = Math.floor(rx * Math.sqrt(1 - (y * y) / (ry * ry)))
    ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1)
  }
}

/** A thick line through points, stamped as discs so bends stay round. */
function path(ctx: Ctx, points: Point[], radius: number, color: string) {
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
    for (let s = 0; s <= steps; s += 1) {
      const t = steps ? s / steps : 0
      disc(ctx, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, color)
    }
  }
}

function grass(ctx: Ctx) {
  block(ctx, 0, 0, WORLD_W - 1, WORLD_H - 1, '#4e7a42')
  const r = rng(11)
  for (let i = 0; i < 2600; i += 1) {
    const x = Math.floor(r() * WORLD_W)
    const y = Math.floor(r() * WORLD_H)
    dot(ctx, x, y, r() > 0.5 ? '#588a4b' : '#46703b')
  }
  // flowers
  for (let i = 0; i < 140; i += 1) {
    const x = Math.floor(r() * WORLD_W)
    const y = 70 + Math.floor(r() * (WORLD_H - 70))
    dot(ctx, x, y, ['#e8d86a', '#e89ab8', '#f2f2f2', '#9ec8f0'][Math.floor(r() * 4)])
  }
}

function mountains(ctx: Ctx) {
  // A rock shelf along the north, with peaks stepped along it.
  block(ctx, 0, 0, WORLD_W - 1, 44, '#5d616a')
  const r = rng(5)
  for (let x = -10; x < WORLD_W + 10; x += 22 + Math.floor(r() * 14)) {
    const h = 34 + Math.floor(r() * 26)
    const w = 26 + Math.floor(r() * 16)
    const base = 58 + Math.floor(r() * 6)
    for (let y = 0; y < h; y += 1) {
      const half = Math.floor((w * (h - y)) / h / 2)
      const cx = x + w / 2
      block(ctx, cx - half, base - y, cx, base - y, '#6e737d')
      block(ctx, cx + 1, base - y, cx + half, base - y, '#565a63')
      if (y > h - 9) block(ctx, cx - Math.floor(half * 0.9), base - y, cx + Math.floor(half * 0.6), base - y, '#e9eef3')
    }
  }
  // The plateau the citadel stands on, cut into the range.
  ellipse(ctx, 240, 32, 58, 24, '#7d7a70')
  ellipse(ctx, 240, 30, 52, 19, '#8e8a7e')
  for (let i = 0; i < 60; i += 1) dot(ctx, 190 + Math.floor(r() * 100), 16 + Math.floor(r() * 28), '#9d998c')
}

function river(ctx: Ctx) {
  const course: Point[] = [[140, 50], [134, 88], [146, 128], [160, 166], [150, 208], [160, 250], [148, 300], [156, 362]]
  path(ctx, course, 7, '#5f8a52')
  path(ctx, course, 5, '#2f6aa6')
  path(ctx, course, 3, '#3b7fc0')
  const r = rng(21)
  for (let i = 0; i < 90; i += 1) {
    const seg = Math.floor(r() * (course.length - 1))
    const t = r()
    const x = course[seg][0] + (course[seg + 1][0] - course[seg][0]) * t
    const y = course[seg][1] + (course[seg + 1][1] - course[seg][1]) * t
    block(ctx, Math.round(x - 1 + r() * 2), Math.round(y), Math.round(x + r() * 2), Math.round(y), '#77b4e6')
  }
  // A pond by the Sanctuary.
  ellipse(ctx, 108, 146, 12, 7, '#5f8a52')
  ellipse(ctx, 108, 146, 10, 5, '#3b7fc0')
  block(ctx, 102, 145, 106, 145, '#77b4e6')
}

function sea(ctx: Ctx) {
  // The south-east corner opens onto water and the uncharted isles.
  ctx.fillStyle = '#2a5a94'
  for (let y = 312; y < WORLD_H; y += 1) {
    const x0 = 520 - Math.floor((y - 312) * 1.6)
    ctx.fillRect(Math.max(0, x0 - 70), y, WORLD_W, 1)
  }
  const r = rng(33)
  for (let i = 0; i < 40; i += 1) {
    const y = 318 + Math.floor(r() * 40)
    const x = 470 - Math.floor((y - 312) * 1.6) - 60 + Math.floor(r() * 120)
    if (x > 380) block(ctx, x, y, x + 2, y, '#4a7ab8')
  }
  ellipse(ctx, 452, 344, 16, 8, '#c9b27a')
  ellipse(ctx, 452, 342, 12, 6, '#5a8a4c')
}

function roads(ctx: Ctx) {
  const all: Point[][] = [
    [[240, 60], [240, 150]],
    [[240, 188], [240, 282]],
    [[36, 216], [150, 206], [214, 194]],
    [[266, 190], [384, 190]],
    [[236, 120], [180, 110], [96, 100]],
    [[244, 108], [330, 100], [398, 94]],
    [[244, 236], [320, 256], [372, 262]],
    [[236, 250], [170, 280], [108, 300]],
  ]
  for (const p of all) path(ctx, p, 3, '#8c7550')
  for (const p of all) path(ctx, p, 2, '#b89a6c')
  const r = rng(44)
  for (const p of all) {
    for (let i = 0; i < p.length - 1; i += 1) {
      for (let s = 0; s < 8; s += 1) {
        const t = r()
        dot(ctx, Math.round(p[i][0] + (p[i + 1][0] - p[i][0]) * t), Math.round(p[i][1] + (p[i + 1][1] - p[i][1]) * t), '#a3875c')
      }
    }
  }
}

function bridge(ctx: Ctx, x: number, y: number, vertical = false) {
  if (vertical) {
    block(ctx, x - 3, y - 7, x + 3, y + 7, '#6b4a2e')
    for (let yy = y - 6; yy <= y + 6; yy += 2) block(ctx, x - 3, yy, x + 3, yy, '#8a6440')
    block(ctx, x - 4, y - 7, x - 4, y + 7, '#4a3220')
    block(ctx, x + 4, y - 7, x + 4, y + 7, '#4a3220')
    return
  }
  block(ctx, x - 7, y - 3, x + 7, y + 3, '#6b4a2e')
  for (let xx = x - 6; xx <= x + 6; xx += 2) block(ctx, xx, y - 3, xx, y + 3, '#8a6440')
  block(ctx, x - 7, y - 4, x + 7, y - 4, '#4a3220')
  block(ctx, x - 7, y + 4, x + 7, y + 4, '#4a3220')
}

function tree(ctx: Ctx, x: number, y: number, shade = 0) {
  const canopy = tone('#2f5f35', shade)
  block(ctx, x, y + 3, x + 1, y + 5, '#5a3d28')
  disc(ctx, x + 0.5, y, 3, canopy)
  dot(ctx, x - 1, y - 2, tone(canopy, 0.25))
  dot(ctx, x, y - 2, tone(canopy, 0.25))
  dot(ctx, x + 2, y + 2, tone(canopy, -0.25))
}

function pine(ctx: Ctx, x: number, y: number) {
  block(ctx, x, y + 5, x, y + 6, '#4a3220')
  for (let i = 0; i < 6; i += 1) block(ctx, x - Math.floor(i / 2), y + i, x + Math.floor(i / 2), y + i, i % 2 ? '#24502e' : '#2d6038')
}

function forest(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, seed: number, pines = false) {
  const r = rng(seed)
  const count = Math.floor(((x1 - x0) * (y1 - y0)) / 60)
  const spots: Point[] = []
  for (let i = 0; i < count; i += 1) spots.push([x0 + Math.floor(r() * (x1 - x0)), y0 + Math.floor(r() * (y1 - y0))])
  spots.sort((a, b) => a[1] - b[1])
  for (const [x, y] of spots) (pines && r() > 0.4 ? pine : (cx: Ctx, px: number, py: number) => tree(cx, px, py, r() * 0.3 - 0.15))(ctx, x, y)
}

function lantern(ctx: Ctx, x: number, y: number, lights: Lights) {
  block(ctx, x, y - 5, x, y, '#3a2a1c')
  block(ctx, x - 1, y - 7, x + 1, y - 5, '#f2c45a')
  lights.glows.push({ x, y: y - 6, r: 9, color: 'rgba(255, 196, 90, 0.55)' })
}

function signpost(ctx: Ctx, x: number, y: number) {
  block(ctx, x, y - 6, x, y, '#5a3d28')
  block(ctx, x - 3, y - 6, x + 3, y - 4, '#9a7446')
  dot(ctx, x - 2, y - 5, '#5a3d28')
  dot(ctx, x + 1, y - 5, '#5a3d28')
}

function villager(ctx: Ctx, x: number, y: number, cloth: string) {
  dot(ctx, x, y - 3, '#f0c6a3')
  block(ctx, x, y - 2, x, y - 1, cloth)
  dot(ctx, x, y, '#3a2a1c')
}

/* --- buildings ----------------------------------------------------------------------- */

function windowRow(ctx: Ctx, x0: number, x1: number, y: number, step: number, lights: Lights, color = '#ffd56b') {
  for (let x = x0; x <= x1; x += step) {
    block(ctx, x, y, x + 1, y + 1, '#2b2f3a')
    lights.windows.push({ x, y, w: 2, h: 2, color })
  }
}

function roofed(ctx: Ctx, x: number, y: number, w: number, h: number, wall: string, roof: string, lights: Lights) {
  block(ctx, x, y, x + w - 1, y + h - 1, wall)
  block(ctx, x, y + h - 1, x + w - 1, y + h - 1, tone(wall, -0.25))
  for (let i = 0; i < Math.ceil(w / 2) + 1; i += 1) block(ctx, x - 1 + i, y - 1 - i, x + w - i, y - 1 - i, i === 0 ? tone(roof, -0.2) : roof)
  block(ctx, x + Math.floor(w / 2) - 1, y + h - 4, x + Math.floor(w / 2), y + h - 2, '#4a3220')
  if (w >= 8) windowRow(ctx, x + 1, x + w - 3, y + 2, Math.max(3, w - 4), lights)
}

function scholarsSanctuary(ctx: Ctx, lights: Lights) {
  const { x, y } = REGION_POINTS.scholars_sanctuary
  block(ctx, x - 26, y + 8, x + 26, y + 20, '#d9cfb6')
  block(ctx, x - 26, y + 20, x + 26, y + 21, '#a89c82')
  for (let cx = x - 22; cx <= x + 22; cx += 6) block(ctx, cx, y + 9, cx + 1, y + 19, '#efe7d2')
  windowRow(ctx, x - 20, x + 20, y + 12, 6, lights)
  // central dome
  block(ctx, x - 9, y - 1, x + 9, y + 8, '#e6dcc4')
  disc(ctx, x, y - 2, 9, '#4a70aa')
  block(ctx, x - 10, y - 1, x + 10, y + 1, '#e6dcc4')
  dot(ctx, x - 3, y - 7, '#7fa4d8')
  dot(ctx, x - 2, y - 8, '#7fa4d8')
  block(ctx, x, y - 14, x, y - 11, '#d8b04a')
  // side towers
  for (const tx of [x - 30, x + 26]) {
    block(ctx, tx, y + 2, tx + 4, y + 21, '#cfc4a8')
    for (let i = 0; i < 3; i += 1) block(ctx, tx - i + 2, y - 1 - i, tx + 2 + i, y - 1 - i, '#3f5f94')
    lights.windows.push({ x: tx + 2, y: y + 8, w: 1, h: 2, color: '#ffd56b' })
  }
  block(ctx, x - 4, y + 21, x + 4, y + 23, '#bdb39a')
  lantern(ctx, x - 14, y + 30, lights)
  lantern(ctx, x + 14, y + 30, lights)
}

function focusSanctum(ctx: Ctx, lights: Lights) {
  const { x, y } = REGION_POINTS.focus_sanctum
  disc(ctx, x, y + 14, 27, '#8e877c')
  disc(ctx, x, y + 14, 25, '#a8a094')
  for (let ring = 8; ring <= 24; ring += 8) {
    for (let a = 0; a < 48; a += 1) {
      const ang = (a / 48) * Math.PI * 2
      dot(ctx, Math.round(x + Math.cos(ang) * ring), Math.round(y + 14 + Math.sin(ang) * ring), '#968e82')
    }
  }
  // shrine
  block(ctx, x - 13, y + 2, x + 13, y + 18, '#e8e2d6')
  for (let px = x - 11; px <= x + 11; px += 5) block(ctx, px, y + 4, px + 1, y + 17, '#cfc7b8')
  for (let i = 0; i < 9; i += 1) block(ctx, x - 16 + i, y + 1 - i, x + 16 - i, y + 1 - i, i < 2 ? '#3a8f6a' : '#2f7a5a')
  // the focus crystal
  const crystal: Point[] = [[0, -18], [-2, -15], [2, -15], [-3, -12], [3, -12], [-2, -9], [2, -9], [0, -7]]
  for (let yy = -18; yy <= -7; yy += 1) {
    const w = yy < -12 ? Math.floor((yy + 18) / 2) : Math.floor((-7 - yy) / 2)
    block(ctx, x - w, y + yy, x + w, y + yy, '#3fe0a0')
  }
  for (const [dx, dy] of crystal.slice(0, 3)) dot(ctx, x + dx, y + dy, '#b8ffe2')
  lights.glows.push({ x, y: y - 12, r: 22, color: 'rgba(63, 224, 160, 0.55)' })
  block(ctx, x - 3, y + 12, x + 3, y + 18, '#6a5d4a')
  for (const [lx, ly] of [[x - 22, y + 2], [x + 22, y + 2], [x - 22, y + 28], [x + 22, y + 28]] as Point[]) lantern(ctx, lx, ly, lights)
}

function buildersDistrict(ctx: Ctx, lights: Lights) {
  const { x, y } = REGION_POINTS.builders_district
  roofed(ctx, x - 30, y - 6, 16, 12, '#b5876a', '#8e3f2a', lights)
  roofed(ctx, x - 8, y - 12, 18, 16, '#c69a73', '#a8502e', lights)
  roofed(ctx, x + 16, y - 2, 14, 10, '#b08262', '#7e3a28', lights)
  // crane
  block(ctx, x + 36, y - 30, x + 37, y + 8, '#e0b040')
  for (let yy = y - 28; yy < y + 8; yy += 4) dot(ctx, x + 35, yy, '#a8801f')
  block(ctx, x + 18, y - 31, x + 46, y - 30, '#e0b040')
  block(ctx, x + 22, y - 29, x + 22, y - 20, '#8a8a8a')
  block(ctx, x + 20, y - 20, x + 24, y - 18, '#6e5b3e')
  // scaffold and crates
  for (let yy = y + 10; yy <= y + 22; yy += 4) block(ctx, x - 28, yy, x - 12, yy, '#8a6440')
  block(ctx, x - 28, y + 10, x - 28, y + 22, '#6b4a2e')
  block(ctx, x - 12, y + 10, x - 12, y + 22, '#6b4a2e')
  for (const [cx, cy] of [[x + 4, y + 12], [x + 10, y + 14], [x + 7, y + 9]] as Point[]) {
    block(ctx, cx, cy, cx + 4, cy + 4, '#a37a4a')
    block(ctx, cx, cy, cx + 4, cy, '#c69a5e')
  }
  lantern(ctx, x - 36, y + 12, lights)
}

function archive(ctx: Ctx, lights: Lights) {
  const { x, y } = REGION_POINTS.archive
  block(ctx, x - 20, y - 4, x + 20, y + 16, '#8d8578')
  block(ctx, x - 22, y - 8, x + 22, y - 5, '#a39b8d')
  for (let i = 0; i < 6; i += 1) block(ctx, x - 22 + i * 4, y - 9 - i, x + 22 - i * 4, y - 9 - i, '#9a9284')
  for (let cx = x - 17; cx <= x + 15; cx += 8) block(ctx, cx, y - 3, cx + 2, y + 15, '#b3ab9c')
  block(ctx, x - 4, y + 5, x + 4, y + 16, '#4d3826')
  dot(ctx, x + 2, y + 10, '#d8b04a')
  lights.windows.push({ x: x - 12, y: y + 3, w: 2, h: 3, color: '#ffcf7a' })
  lights.windows.push({ x: x + 11, y: y + 3, w: 2, h: 3, color: '#ffcf7a' })
  // banner with a scroll
  block(ctx, x + 24, y - 10, x + 24, y + 16, '#5a3d28')
  block(ctx, x + 25, y - 9, x + 30, y + 1, '#7a2f3a')
  block(ctx, x + 26, y - 6, x + 29, y - 4, '#e8dcc0')
  lantern(ctx, x - 26, y + 18, lights)
}

function creatorsQuarter(ctx: Ctx, lights: Lights) {
  const { x, y } = REGION_POINTS.creators_quarter
  const houses: [number, number, string, string][] = [
    [x - 34, y - 8, '#d86a8a', '#7a2f4a'],
    [x - 14, y - 14, '#3aa6a0', '#1f5f5c'],
    [x + 8, y - 8, '#e8c24a', '#9a6a1f'],
    [x + 26, y - 2, '#9a6ad0', '#4f2f80'],
  ]
  for (const [hx, hy, wall, roof] of houses) roofed(ctx, hx, hy, 13, 11, wall, roof, lights)
  // bunting between the houses
  const colours = ['#e84a5f', '#f2c14e', '#3ec1a8', '#6a8ae8', '#e86ad0']
  for (let bx = x - 30; bx <= x + 34; bx += 3) {
    const by = y - 20 + Math.round(Math.sin((bx - x) / 9) * 2)
    dot(ctx, bx, by, colours[Math.abs(bx) % colours.length])
  }
  // easel and paint
  block(ctx, x - 6, y + 12, x - 6, y + 20, '#6b4a2e')
  block(ctx, x - 10, y + 10, x - 2, y + 16, '#f4ecd8')
  dot(ctx, x - 8, y + 12, '#e84a5f')
  dot(ctx, x - 5, y + 13, '#3ec1a8')
  dot(ctx, x - 7, y + 14, '#f2c14e')
  lantern(ctx, x + 18, y + 18, lights)
}

function trainingGrounds(ctx: Ctx, lights: Lights) {
  const { x, y } = REGION_POINTS.training_grounds
  ellipse(ctx, x, y, 34, 20, '#7a5634')
  ellipse(ctx, x, y, 32, 18, '#c2a070')
  ellipse(ctx, x, y, 24, 12, '#b8946a')
  for (let a = 0; a < 40; a += 1) {
    const ang = (a / 40) * Math.PI * 2
    const fx = Math.round(x + Math.cos(ang) * 34)
    const fy = Math.round(y + Math.sin(ang) * 20)
    block(ctx, fx, fy - 2, fx, fy, '#5a3d28')
  }
  // training dummies
  for (const dx of [-12, 0, 12]) {
    block(ctx, x + dx, y - 4, x + dx, y + 3, '#6b4a2e')
    block(ctx, x + dx - 2, y - 2, x + dx + 2, y - 1, '#d8c08a')
    disc(ctx, x + dx, y - 6, 2, '#d8c08a')
  }
  // flags
  for (const [fx, color] of [[x - 36, '#e84a5f'], [x + 36, '#3a78e8']] as [number, string][]) {
    block(ctx, fx, y - 26, fx, y - 12, '#4a3220')
    block(ctx, fx + 1, y - 26, fx + 6, y - 22, color)
  }
  lantern(ctx, x - 40, y + 8, lights)
  lantern(ctx, x + 40, y + 8, lights)
}

function digitalWorkshop(ctx: Ctx, lights: Lights, locked: boolean) {
  const { x, y } = REGION_POINTS.digital_workshop
  block(ctx, x - 22, y - 10, x + 22, y + 14, '#3a4450')
  block(ctx, x - 22, y - 12, x + 22, y - 10, '#566270')
  for (let wy = y - 6; wy <= y + 8; wy += 5) {
    for (let wx = x - 18; wx <= x + 16; wx += 6) {
      block(ctx, wx, wy, wx + 3, wy + 2, '#1e2630')
      if (!locked) lights.windows.push({ x: wx, y: wy, w: 4, h: 3, color: '#6ee8f5' })
    }
  }
  block(ctx, x + 14, y - 34, x + 15, y - 12, '#8a96a4')
  dot(ctx, x + 14, y - 35, '#ff5a5a')
  if (!locked) lights.glows.push({ x: x + 14, y: y - 35, r: 5, color: 'rgba(255, 90, 90, 0.7)' })
  ellipse(ctx, x - 12, y - 16, 6, 3, '#b8c2cc')
  block(ctx, x - 12, y - 14, x - 12, y - 12, '#8a96a4')
}

function innovationDistrict(ctx: Ctx, lights: Lights, locked: boolean) {
  const { x, y } = REGION_POINTS.innovation_district
  const towers: [number, number, number][] = [
    [x - 24, 30, 10],
    [x - 10, 44, 12],
    [x + 6, 36, 10],
    [x + 20, 26, 9],
  ]
  for (const [tx, h, w] of towers) {
    block(ctx, tx, y + 14 - h, tx + w, y + 14, '#5f93b3')
    block(ctx, tx, y + 14 - h, tx + 1, y + 14, '#8cc0dc')
    for (let wy = y + 17 - h; wy < y + 12; wy += 4) {
      for (let wx = tx + 3; wx < tx + w - 1; wx += 3) {
        dot(ctx, wx, wy, '#27485e')
        if (!locked) lights.windows.push({ x: wx, y: wy, w: 1, h: 1, color: '#bfefff' })
      }
    }
  }
  block(ctx, x - 5, y - 44, x - 4, y - 30, '#d8e8f0')
  if (!locked) lights.glows.push({ x: x - 4, y: y - 44, r: 7, color: 'rgba(160, 230, 255, 0.7)' })
}

function eliteCitadel(ctx: Ctx, lights: Lights, locked: boolean) {
  const { x, y } = REGION_POINTS.elite_region
  block(ctx, x - 26, y - 4, x + 26, y + 14, '#9a958c')
  for (let bx = x - 26; bx <= x + 24; bx += 4) block(ctx, bx, y - 6, bx + 1, y - 5, '#9a958c')
  for (const tx of [x - 30, x + 24]) {
    block(ctx, tx, y - 14, tx + 6, y + 14, '#8a857c')
    for (let i = 0; i < 5; i += 1) block(ctx, tx + i - 1, y - 15 - i, tx + 7 - i, y - 15 - i, '#d8a83a')
  }
  block(ctx, x - 6, y - 22, x + 6, y + 14, '#a8a398')
  for (let i = 0; i < 8; i += 1) block(ctx, x - 7 + i, y - 23 - i, x + 7 - i, y - 23 - i, '#e8b84a')
  block(ctx, x, y - 38, x, y - 31, '#4a3220')
  block(ctx, x + 1, y - 38, x + 6, y - 35, '#7a2fd0')
  block(ctx, x - 3, y + 5, x + 3, y + 14, '#3a2a1c')
  if (!locked) {
    lights.windows.push({ x: x - 16, y: y + 2, w: 2, h: 3, color: '#ffd56b' })
    lights.windows.push({ x: x + 14, y: y + 2, w: 2, h: 3, color: '#ffd56b' })
    lights.glows.push({ x, y: y - 30, r: 16, color: 'rgba(232, 184, 74, 0.45)' })
  }
}

/* --- locks -------------------------------------------------------------------------- */

function fog(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, seed: number) {
  const r = rng(seed)
  for (let i = 0; i < 26; i += 1) {
    const x = cx + (r() - 0.5) * rx * 1.6
    const y = cy + (r() - 0.5) * ry * 1.6
    ctx.fillStyle = `rgba(214, 222, 232, ${0.18 + r() * 0.2})`
    const rr = 6 + Math.floor(r() * 12)
    ctx.beginPath()
    ctx.ellipse(Math.round(x), Math.round(y), rr * 1.6, rr, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

function barrier(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, lights: Lights) {
  for (let a = 0; a < 64; a += 1) {
    if (a % 2) continue
    const ang = (a / 64) * Math.PI * 2
    dot(ctx, Math.round(cx + Math.cos(ang) * rx), Math.round(cy + Math.sin(ang) * ry), '#b58cff')
  }
  lights.glows.push({ x: cx, y: cy, r: Math.max(rx, ry) + 6, color: 'rgba(160, 110, 255, 0.18)' })
}

function gate(ctx: Ctx, x: number, y: number, open: boolean) {
  block(ctx, x - 12, y - 10, x - 7, y + 4, '#7d786e')
  block(ctx, x + 7, y - 10, x + 12, y + 4, '#7d786e')
  block(ctx, x - 12, y - 12, x + 12, y - 9, '#8e897e')
  if (!open) {
    for (let gx = x - 6; gx <= x + 6; gx += 3) block(ctx, gx, y - 8, gx, y + 4, '#3a3a3a')
    for (let gy = y - 6; gy <= y + 3; gy += 3) block(ctx, x - 6, gy, x + 6, gy, '#3a3a3a')
  }
}

function portal(ctx: Ctx, x: number, y: number, lights: Lights) {
  ellipse(ctx, x, y, 5, 8, '#4a2f7a')
  ellipse(ctx, x, y, 3, 6, '#9a6ae8')
  dot(ctx, x, y - 3, '#e8d8ff')
  lights.glows.push({ x, y, r: 12, color: 'rgba(170, 120, 255, 0.5)' })
}

/* --- lighting ---------------------------------------------------------------------------- */

const GRADE: Record<TimeOfDay, string | null> = {
  morning: 'rgba(255, 186, 120, 0.12)',
  day: null,
  evening: 'rgba(92, 40, 96, 0.30)',
  night: 'rgba(8, 16, 52, 0.60)',
}

function grade(ctx: Ctx, t: TimeOfDay, lights: Lights) {
  const wash = GRADE[t]
  if (wash) {
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, WORLD_W, WORLD_H)
  }
  if (t === 'evening') {
    ctx.fillStyle = 'rgba(255, 140, 70, 0.08)'
    ctx.fillRect(0, 0, WORLD_W, WORLD_H)
  }
  if (t !== 'evening' && t !== 'night') return
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const g of lights.glows) {
    const gradient = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r * (t === 'night' ? 1 : 0.7))
    gradient.addColorStop(0, g.color)
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2)
  }
  ctx.restore()
  for (const w of lights.windows) block(ctx, w.x, w.y, w.x + w.w - 1, w.y + w.h - 1, w.color)
}

/* --- the map ---------------------------------------------------------------------------- */

function drawWorld(t: TimeOfDay, locked: Set<RegionId>): string {
  const { canvas, ctx } = makeCanvas(WORLD_W, WORLD_H)
  const lights: Lights = { windows: [], glows: [] }

  grass(ctx)
  mountains(ctx)
  sea(ctx)
  river(ctx)
  roads(ctx)
  bridge(ctx, 151, 206)
  bridge(ctx, 139, 106)
  bridge(ctx, 153, 285)
  bridge(ctx, 240, 62, true)

  forest(ctx, 8, 64, 48, 88, 101, true)
  forest(ctx, 166, 64, 222, 96, 102, true)
  forest(ctx, 272, 118, 350, 166, 103)
  forest(ctx, 6, 118, 36, 196, 104)
  forest(ctx, 286, 204, 346, 244, 105)
  forest(ctx, 168, 314, 206, 354, 106)
  forest(ctx, 300, 318, 372, 356, 107)
  forest(ctx, 440, 126, 476, 170, 108, true)
  forest(ctx, 104, 236, 138, 262, 109)

  scholarsSanctuary(ctx, lights)
  archive(ctx, lights)
  creatorsQuarter(ctx, lights)
  trainingGrounds(ctx, lights)
  buildersDistrict(ctx, lights)
  digitalWorkshop(ctx, lights, locked.has('digital_workshop'))
  innovationDistrict(ctx, lights, locked.has('innovation_district'))
  focusSanctum(ctx, lights)
  eliteCitadel(ctx, lights, locked.has('elite_region'))
  gate(ctx, 240, 70, !locked.has('elite_region'))

  for (const [x, y] of [[198, 196], [292, 184], [240, 250], [200, 116], [320, 104], [300, 256], [110, 214]] as Point[]) lantern(ctx, x, y, lights)
  signpost(ctx, 226, 214)
  signpost(ctx, 256, 124)
  signpost(ctx, 176, 272)

  // People about their day; fewer after dark.
  const r = rng(77)
  const people = t === 'night' ? 3 : t === 'evening' ? 8 : 16
  const spots: Point[] = [[232, 176], [250, 182], [70, 126], [60, 234], [92, 318], [70, 322], [228, 312], [252, 290], [396, 210], [420, 206], [396, 306], [236, 100], [160, 214], [330, 196], [110, 300], [246, 160]]
  for (let i = 0; i < people; i += 1) {
    const [x, y] = spots[i % spots.length]
    villager(ctx, x + Math.floor(r() * 4), y, ['#3a78e8', '#e84a5f', '#3ec1a8', '#f2c14e', '#9a6ad0'][i % 5])
  }

  if (locked.has('digital_workshop')) {
    fog(ctx, REGION_POINTS.digital_workshop.x, REGION_POINTS.digital_workshop.y - 6, 34, 26, 201)
    barrier(ctx, REGION_POINTS.digital_workshop.x, REGION_POINTS.digital_workshop.y - 4, 34, 28, lights)
  }
  if (locked.has('innovation_district')) {
    fog(ctx, REGION_POINTS.innovation_district.x, REGION_POINTS.innovation_district.y - 10, 38, 34, 202)
    barrier(ctx, REGION_POINTS.innovation_district.x, REGION_POINTS.innovation_district.y - 8, 40, 34, lights)
  }
  if (locked.has('elite_region')) {
    fog(ctx, REGION_POINTS.elite_region.x, REGION_POINTS.elite_region.y - 4, 60, 28, 203)
    portal(ctx, 262, 76, lights)
  }
  fog(ctx, UNCHARTED_POINT.x, UNCHARTED_POINT.y - 4, 30, 16, 204)

  grade(ctx, t, lights)
  return canvas.toDataURL()
}

/** The map for a time of day and a set of locked regions, drawn once and kept. */
export function worldImage(t: TimeOfDay, locked: RegionId[]): string {
  const set = new Set(locked)
  const key = `world|${t}|${[...set].sort().join(',')}`
  return cached(key, () => drawWorld(t, set))
}

/** Softer ink for text laid over the map at this time of day. */
export function worldInk(t: TimeOfDay): string {
  return t === 'night' ? mix('#e8ecf5', '#9fb3e8', 0.2) : '#f7f3e8'
}
