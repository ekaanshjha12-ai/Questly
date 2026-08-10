/**
 * Minimal EXIF reader for one field: DateTimeOriginal, i.e. when the shutter
 * actually fired.
 *
 * This has to run on the original File. Drawing a photo to a canvas and
 * re-encoding it — which is how uploads are downscaled — discards every scrap
 * of metadata, so by the time the image is ready to send the timestamp is gone.
 *
 * Only JPEG carries EXIF in practice. Screenshots, PNGs and anything that has
 * been through a messaging app usually have none, so a missing timestamp is
 * normal and must not be treated as suspicious on its own.
 */

const APP1 = 0xffe1
const TAG_DATETIME_ORIGINAL = 0x9003
const TAG_EXIF_IFD_POINTER = 0x8769

/** "YYYY:MM:DD HH:MM:SS" in the camera's local time, with no zone information. */
function parseExifDate(value: string): number | null {
  const m = value.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  const date = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  )
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function readIfd(
  view: DataView,
  tiffStart: number,
  ifdOffset: number,
  little: boolean,
  wanted: number,
): { value?: string; exifPointer?: number } {
  const entries = view.getUint16(tiffStart + ifdOffset, little)
  const result: { value?: string; exifPointer?: number } = {}

  for (let i = 0; i < entries; i++) {
    const entry = tiffStart + ifdOffset + 2 + i * 12
    if (entry + 12 > view.byteLength) break

    const tag = view.getUint16(entry, little)
    if (tag === TAG_EXIF_IFD_POINTER) {
      result.exifPointer = view.getUint32(entry + 8, little)
    }
    if (tag !== wanted) continue

    const count = view.getUint32(entry + 4, little)
    const valueOffset = count > 4 ? tiffStart + view.getUint32(entry + 8, little) : entry + 8
    let out = ''
    for (let c = 0; c < count && valueOffset + c < view.byteLength; c++) {
      const code = view.getUint8(valueOffset + c)
      if (code === 0) break
      out += String.fromCharCode(code)
    }
    result.value = out
  }

  return result
}

/** Milliseconds since the epoch when the photo was taken, or null if unknown. */
export async function readCaptureTime(file: File): Promise<number | null> {
  try {
    // The EXIF block sits near the front; no need to read a 5MB photo in full.
    const head = await file.slice(0, 256 * 1024).arrayBuffer()
    const view = new DataView(head)
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null // not a JPEG

    let offset = 2
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset)
      const size = view.getUint16(offset + 2)
      if (marker === APP1) {
        const exifStart = offset + 4
        // "Exif\0\0"
        if (view.getUint32(exifStart) !== 0x45786966) return null

        const tiffStart = exifStart + 6
        const endian = view.getUint16(tiffStart)
        const little = endian === 0x4949
        if (!little && endian !== 0x4d4d) return null

        const firstIfd = view.getUint32(tiffStart + 4, little)
        const root = readIfd(view, tiffStart, firstIfd, little, TAG_DATETIME_ORIGINAL)
        if (root.value) return parseExifDate(root.value)

        // Usually DateTimeOriginal lives in the EXIF sub-IFD, not the root.
        if (root.exifPointer) {
          const sub = readIfd(view, tiffStart, root.exifPointer, little, TAG_DATETIME_ORIGINAL)
          if (sub.value) return parseExifDate(sub.value)
        }
        return null
      }
      if ((marker & 0xff00) !== 0xff00) break
      offset += 2 + size
    }
    return null
  } catch {
    // Any malformed header just means "no timestamp available".
    return null
  }
}
