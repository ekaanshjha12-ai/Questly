/**
 * Profile helpers for the browser: the age check, the sign-up lockout, and
 * making the profile picture.
 *
 * The age check here is only for an instant answer. The server runs the same
 * check and is the one that counts — see server/profile.js.
 */

export const MIN_AGE = 15
export const BIO_MAX = 160

export function ageFromBirthdate(ymd: string, today: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const check = new Date(year, month - 1, day)
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null
  let age = today.getFullYear() - year
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--
  return age
}

/**
 * After an under-age answer, sign-up stays closed on this device for a day.
 *
 * Without it the form invites the obvious next move — go back one step and
 * pick an earlier year. It is a speed bump, not a wall: clearing site data
 * lifts it, and the server's check is what actually refuses the account.
 */
const LOCK_KEY = 'questly:v1:age-lock'
const LOCK_MS = 24 * 60 * 60 * 1000

export function ageLocked(): boolean {
  try {
    const at = Number(localStorage.getItem(LOCK_KEY))
    return Number.isFinite(at) && at > 0 && Date.now() - at < LOCK_MS
  } catch {
    return false
  }
}

export function lockForAge(): void {
  try {
    localStorage.setItem(LOCK_KEY, String(Date.now()))
  } catch {
    // Storage blocked — the server check still applies.
  }
}

/** A short, year-free birthday for display. The year is the part that says how
 * old someone is, and a card is exactly the kind of thing that gets shared. */
export function birthdayLabel(ymd: string | null | undefined): string | null {
  const match = ymd ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) : null
  if (!match) return null
  const date = new Date(2000, Number(match[2]) - 1, Number(match[3]))
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/* --- the picture ---------------------------------------------------------- */

export interface PreparedAvatar {
  base64: string
  mediaType: 'image/jpeg'
  dataUrl: string
}

const SIZE = 256

function fromCanvas(canvas: HTMLCanvasElement): PreparedAvatar {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('That picture could not be opened. Try a JPEG or PNG.'))
    img.src = src
  })
}

/**
 * Crops a photo to a centred square and shrinks it to 256px.
 *
 * Re-drawing through a canvas also strips everything the file carried besides
 * the pixels — including GPS coordinates, which a phone photo often has and a
 * profile picture should never pass on.
 *
 * `zoom` of 1 fits the shorter side; higher values crop tighter around the
 * centre, offset by `panX`/`panY` in the range -1..1.
 */
export async function cropPhoto(dataUrl: string, zoom = 1, panX = 0, panY = 0): Promise<PreparedAvatar> {
  const img = await loadImage(dataUrl)
  const side = Math.min(img.naturalWidth, img.naturalHeight) / Math.max(1, zoom)
  const maxX = (img.naturalWidth - side) / 2
  const maxY = (img.naturalHeight - side) / 2
  const sx = maxX + panX * maxX
  const sy = maxY + panY * maxY

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot prepare pictures.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE)
  return fromCanvas(canvas)
}

export function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Choose an image file.'))
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      reject(new Error('That picture is over 15MB. Choose a smaller one.'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('That picture could not be read.'))
    reader.readAsDataURL(file)
  })
}

export const AVATAR_BACKDROPS = [
  ['#22c55e', '#15803d'],
  ['#0ea5b7', '#1e3a8a'],
  ['#8b5cf6', '#4c1d95'],
  ['#f59e0b', '#c2410c'],
  ['#ec4899', '#9d174d'],
  ['#404040', '#0a0a0a'],
] as const

/**
 * A picture made from a letter or an emoji, for anyone who would rather not
 * upload a photo of themselves — a real option, not a placeholder, and the
 * card treats it exactly like a photo.
 */
export function makeAvatar(glyph: string, backdrop: readonly [string, string]): PreparedAvatar {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createLinearGradient(0, 0, SIZE, SIZE)
  gradient.addColorStop(0, backdrop[0])
  gradient.addColorStop(1, backdrop[1])
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, SIZE, SIZE)

  // A soft light from the top-left, so it reads as an object rather than a
  // flat swatch — the same depth the rest of the app has.
  const light = ctx.createRadialGradient(SIZE * 0.3, SIZE * 0.25, 10, SIZE * 0.3, SIZE * 0.25, SIZE * 0.8)
  light.addColorStop(0, 'rgba(255,255,255,0.28)')
  light.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = light
  ctx.fillRect(0, 0, SIZE, SIZE)

  const isLetter = /^\p{L}$/u.test(glyph)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = isLetter
    ? `700 ${SIZE * 0.5}px Cinzel, Georgia, serif`
    : `${SIZE * 0.52}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
  ctx.shadowColor = 'rgba(0,0,0,0.25)'
  ctx.shadowOffsetY = 4
  ctx.shadowBlur = 8
  ctx.fillText(isLetter ? glyph.toUpperCase() : glyph, SIZE / 2, SIZE / 2 + (isLetter ? SIZE * 0.04 : SIZE * 0.03))
  return fromCanvas(canvas)
}
