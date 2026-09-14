/**
 * A tiny pixel-art toolkit.
 *
 * Everything Questly draws — heroes, items, pets — is painted onto a small
 * canvas one block at a time, given a one-pixel outline automatically, and
 * shown many times larger with nearest-neighbour scaling. Drawing in code
 * rather than shipping image files keeps every combination of look and gear
 * possible without an asset per combination, and costs a few kilobytes.
 */

export type Ctx = CanvasRenderingContext2D

export function makeCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas is not available.')
  ctx.imageSmoothingEnabled = false
  return { canvas, ctx }
}

/** A filled rectangle, inclusive of both corners. */
export function block(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) + 1, Math.abs(y1 - y0) + 1)
}

export function dot(ctx: Ctx, x: number, y: number, color: string) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, 1, 1)
}

/** One horizontal run per row: `rows[i] = [x0, x1]` for row `y0 + i`. */
export function runs(ctx: Ctx, y0: number, rows: [number, number][], color: string) {
  ctx.fillStyle = color
  rows.forEach(([a, b], i) => {
    if (b >= a) ctx.fillRect(a, y0 + i, b - a + 1, 1)
  })
}

/** Clears pixels, for cut-outs like a hood's face opening. */
export function erase(ctx: Ctx, x0: number, y0: number, x1: number, y1: number) {
  ctx.clearRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) + 1, Math.abs(y1 - y0) + 1)
}

/**
 * Adds a one-pixel outline around everything opaque on the canvas. Pixels in
 * `keepSoft` alpha range (glows) are left out of the silhouette so a lantern's
 * light does not get a hard edge.
 */
export function outline(ctx: Ctx, color: string) {
  const { width, height } = ctx.canvas
  const image = ctx.getImageData(0, 0, width, height)
  const src = new Uint8ClampedArray(image.data)
  const [r, g, b] = hexToRgb(color)
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && src[(y * width + x) * 4 + 3] > 200
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      if (src[i + 3] > 0) continue
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
        image.data[i] = r
        image.data[i + 1] = g
        image.data[i + 2] = b
        image.data[i + 3] = 255
      }
    }
  }
  ctx.putImageData(image, 0, 0)
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const n = parseInt(full.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Lighter (amount > 0) or darker (amount < 0), mixing toward white or black. */
export function tone(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  if (amount >= 0) return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount)
  return rgbToHex(r * (1 + amount), g * (1 + amount), b * (1 + amount))
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

/** The bounding box of everything opaque, or null for an empty canvas. */
export function opaqueBounds(ctx: Ctx): { x: number; y: number; w: number; h: number } | null {
  const { width, height } = ctx.canvas
  const data = ctx.getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** Keeps generated images for the life of the page — they never change. */
const cache = new Map<string, string>()

export function cached(key: string, draw: () => string): string {
  const hit = cache.get(key)
  if (hit) return hit
  const url = draw()
  if (cache.size > 400) cache.clear()
  cache.set(key, url)
  return url
}
