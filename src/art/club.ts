import { block, cached, dot, makeCanvas, outline, tone, type Ctx } from './pixel'
import type { ClubTierId } from '../lib/api'

/**
 * A club's building, as it stands in the world. It grows with the club:
 *
 *   workshop      level 1–4    a timber hut with the club's banner
 *   hall          level 5–9    a guild hall of stone and beams
 *   headquarters  level 10–14  a fortified house with a watchtower
 *   landmark      level 15+    a spired landmark, trimmed in gold
 *
 * Drawn at 48 × 44 in the club's colour, outlined, cached per tier and colour.
 */

export const CLUB_SPRITE_W = 48
export const CLUB_SPRITE_H = 44

function banner(ctx: Ctx, x: number, y: number, h: number, accent: string) {
  block(ctx, x, y, x, y + h, '#4a3220')
  block(ctx, x + 1, y, x + 5, y + 5, accent)
  dot(ctx, x + 3, y + 6, accent)
  dot(ctx, x + 3, y + 2, tone(accent, 0.45))
}

function windowsRow(ctx: Ctx, x0: number, x1: number, y: number, step: number, lit = '#ffd56b') {
  for (let x = x0; x <= x1; x += step) {
    block(ctx, x, y, x + 1, y + 2, '#2b2f3a')
    dot(ctx, x, y, lit)
  }
}

function workshop(ctx: Ctx, accent: string) {
  // walls and roof
  block(ctx, 12, 24, 35, 40, '#9a6f48')
  for (let x = 12; x <= 35; x += 4) block(ctx, x, 24, x, 40, '#86603e')
  for (let i = 0; i < 13; i += 1) block(ctx, 10 + i, 23 - i, 37 - i, 23 - i, i % 3 === 0 ? tone('#7e3a28', -0.15) : '#8e4430')
  block(ctx, 21, 31, 26, 40, '#4a3220')
  dot(ctx, 25, 36, '#d8b04a')
  windowsRow(ctx, 15, 15, 29, 4)
  windowsRow(ctx, 31, 31, 29, 4)
  // crates and banner
  block(ctx, 37, 35, 42, 40, '#a37a4a')
  block(ctx, 37, 35, 42, 35, '#c69a5e')
  banner(ctx, 6, 18, 22, accent)
}

function hall(ctx: Ctx, accent: string) {
  block(ctx, 6, 20, 41, 40, '#b3a894')
  for (let x = 6; x <= 41; x += 6) block(ctx, x, 20, x, 40, '#7a5634')
  block(ctx, 6, 29, 41, 29, '#7a5634')
  for (let i = 0; i < 12; i += 1) block(ctx, 4 + i, 19 - i, 43 - i, 19 - i, i % 2 ? '#5f3a2a' : '#6f4432')
  block(ctx, 34, 4, 37, 12, '#8a857c')
  block(ctx, 20, 31, 27, 40, '#4a3220')
  block(ctx, 23, 31, 24, 40, '#3a2618')
  windowsRow(ctx, 9, 39, 23, 6)
  windowsRow(ctx, 9, 15, 33, 6)
  windowsRow(ctx, 33, 39, 33, 6)
  // the club crest over the door
  block(ctx, 21, 13, 26, 17, accent)
  dot(ctx, 23, 15, tone(accent, 0.5))
  banner(ctx, 1, 16, 24, accent)
  banner(ctx, 42, 16, 24, accent)
}

function headquarters(ctx: Ctx, accent: string) {
  block(ctx, 4, 22, 33, 40, '#9a958c')
  for (let x = 4; x <= 32; x += 4) block(ctx, x, 20, x + 1, 21, '#9a958c')
  windowsRow(ctx, 7, 31, 26, 6)
  windowsRow(ctx, 7, 31, 33, 6)
  block(ctx, 15, 32, 21, 40, '#3a2a1c')
  // watchtower
  block(ctx, 33, 8, 43, 40, '#8a857c')
  for (let x = 33; x <= 43; x += 3) block(ctx, x, 6, x + 1, 7, '#8a857c')
  windowsRow(ctx, 36, 40, 13, 4)
  windowsRow(ctx, 36, 40, 22, 4)
  block(ctx, 38, 0, 38, 5, '#4a3220')
  block(ctx, 39, 0, 44, 3, accent)
  // shield on the wall
  block(ctx, 16, 12, 21, 17, accent)
  block(ctx, 17, 18, 20, 18, accent)
  dot(ctx, 18, 14, tone(accent, 0.5))
  banner(ctx, 0, 14, 26, accent)
}

function landmark(ctx: Ctx, accent: string) {
  // wings
  block(ctx, 2, 26, 45, 40, '#d8d2c4')
  for (let x = 4; x <= 44; x += 5) block(ctx, x, 27, x + 1, 39, '#efe9dc')
  windowsRow(ctx, 6, 41, 30, 5, '#fff0b0')
  // central tower with spire
  block(ctx, 17, 10, 30, 40, '#e6e0d2')
  block(ctx, 17, 10, 30, 11, '#d8b04a')
  for (let i = 0; i < 10; i += 1) block(ctx, 18 + Math.floor(i / 2), 9 - i, 29 - Math.floor(i / 2), 9 - i, i % 2 ? '#e8b84a' : '#d8a83a')
  block(ctx, 23, 0, 24, 1, '#fff0b0')
  block(ctx, 21, 16, 26, 22, accent)
  dot(ctx, 23, 18, '#fff0b0')
  dot(ctx, 24, 19, tone(accent, 0.5))
  block(ctx, 20, 32, 27, 40, '#4a3a26')
  block(ctx, 20, 32, 27, 32, '#d8b04a')
  // gold trim and banners
  block(ctx, 2, 25, 45, 25, '#d8b04a')
  banner(ctx, 6, 12, 14, accent)
  banner(ctx, 36, 12, 14, accent)
}

const DRAW: Record<ClubTierId, (ctx: Ctx, accent: string) => void> = { workshop, hall, headquarters, landmark }

export function clubBuilding(tier: ClubTierId, accent: string): string {
  return cached(`club|${tier}|${accent}`, () => {
    const { canvas, ctx } = makeCanvas(CLUB_SPRITE_W, CLUB_SPRITE_H)
    DRAW[tier](ctx, accent)
    // Ground shadow under the building.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'
    ctx.fillRect(4, 41, 40, 2)
    outline(ctx, '#1a1410')
    return canvas.toDataURL()
  })
}
