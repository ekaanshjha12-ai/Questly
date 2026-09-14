/**
 * Strips hidden metadata from uploaded pictures.
 *
 * A photo straight off a phone carries where it was taken (GPS), when, on what
 * device, and sometimes a thumbnail of the uncropped original. The app's own
 * upload path redraws pictures on a canvas, which drops all of that, but the
 * API cannot rely on every request coming from the app. So every stored or
 * forwarded picture passes through here first.
 *
 * Only the container is rewritten — the image data is copied byte for byte,
 * so nothing is re-encoded and nothing loses quality. What stays is what the
 * picture needs to display correctly: colour profiles, and a JPEG's
 * orientation (kept as a minimal EXIF block holding that one value, since
 * phone cameras rely on it to show a photo the right way up).
 *
 * Returns the cleaned bytes, or null when the file's structure cannot be read
 * — a picture that cannot be walked cannot be vouched for.
 */

export function stripImageMetadata(bytes, mime) {
  try {
    if (mime === 'image/jpeg') return stripJpeg(bytes)
    if (mime === 'image/png') return stripPng(bytes)
    if (mime === 'image/webp') return stripWebp(bytes)
    return null
  } catch {
    return null
  }
}

/* --- JPEG ------------------------------------------------------------------ */

const EXIF_HEADER = Buffer.from('Exif\0\0', 'binary')
const ICC_HEADER = Buffer.from('ICC_PROFILE\0', 'binary')

function stripJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const out = [bytes.subarray(0, 2)]
  let i = 2
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return null
    // Any number of 0xFF fill bytes may precede a marker.
    let m = i + 1
    while (m < bytes.length && bytes[m] === 0xff) m += 1
    if (m >= bytes.length) return null
    const marker = bytes[m]
    const start = m - 1

    // Start of scan: everything from here is image data up to the end.
    if (marker === 0xda || marker === 0xd9) {
      out.push(bytes.subarray(start))
      return Buffer.concat(out)
    }
    // Markers with no length.
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(bytes.subarray(start, m + 1))
      i = m + 1
      continue
    }
    if (m + 2 >= bytes.length) return null
    const length = bytes.readUInt16BE(m + 1)
    const end = m + 1 + length
    if (length < 2 || end > bytes.length) return null
    const data = bytes.subarray(m + 3, end)

    if (marker === 0xe1) {
      // EXIF (or XMP). Only the orientation survives.
      if (startsWith(data, EXIF_HEADER)) {
        const orientation = readOrientation(data.subarray(EXIF_HEADER.length))
        if (orientation && orientation !== 1) out.push(orientationSegment(orientation))
      }
    } else if (marker === 0xe2) {
      if (startsWith(data, ICC_HEADER)) out.push(bytes.subarray(start, end))
    } else if ((marker >= 0xe3 && marker <= 0xed) || marker === 0xef || marker === 0xfe) {
      // APP3–APP13 (IPTC and Photoshop blocks among them), APP15 and comments.
    } else {
      // APP0 (JFIF), APP14 (Adobe colour transform), tables, frame headers.
      out.push(bytes.subarray(start, end))
    }
    i = end
  }
  return null
}

function startsWith(buffer, prefix) {
  return buffer.length >= prefix.length && buffer.subarray(0, prefix.length).equals(prefix)
}

/** The Orientation tag (0x0112) from the first IFD of a TIFF block, or null. */
function readOrientation(tiff) {
  if (tiff.length < 8) return null
  const order = tiff.toString('binary', 0, 2)
  const little = order === 'II'
  if (!little && order !== 'MM') return null
  const u16 = (at) => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at))
  const u32 = (at) => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at))
  if (u16(2) !== 42) return null
  const ifd = u32(4)
  if (ifd + 2 > tiff.length) return null
  const count = u16(ifd)
  for (let n = 0; n < count; n += 1) {
    const entry = ifd + 2 + n * 12
    if (entry + 12 > tiff.length) return null
    if (u16(entry) === 0x0112 && u16(entry + 2) === 3) {
      const value = u16(entry + 8)
      return value >= 1 && value <= 8 ? value : null
    }
  }
  return null
}

/** An APP1 segment whose EXIF holds nothing but an orientation. */
function orientationSegment(orientation) {
  const segment = Buffer.alloc(36)
  segment.writeUInt16BE(0xffe1, 0)
  segment.writeUInt16BE(34, 2)
  EXIF_HEADER.copy(segment, 4)
  segment.write('MM', 10, 'binary')
  segment.writeUInt16BE(42, 12)
  segment.writeUInt32BE(8, 14) // first IFD straight after the header
  segment.writeUInt16BE(1, 18) // one entry
  segment.writeUInt16BE(0x0112, 20)
  segment.writeUInt16BE(3, 22) // SHORT
  segment.writeUInt32BE(1, 24)
  segment.writeUInt16BE(orientation, 28)
  segment.writeUInt32BE(0, 32) // no further IFDs
  return segment
}

/* --- PNG ------------------------------------------------------------------- */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
/** Text, EXIF and timestamp chunks. Colour chunks (iCCP, sRGB, gAMA) stay. */
const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'])

function stripPng(bytes) {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null
  const out = [PNG_SIGNATURE]
  let i = 8
  while (i + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(i)
    const type = bytes.toString('binary', i + 4, i + 8)
    const end = i + 12 + length
    if (end > bytes.length) return null
    if (!PNG_DROP.has(type)) out.push(bytes.subarray(i, end))
    i = end
    if (type === 'IEND') return Buffer.concat(out)
  }
  return null
}

/* --- WebP ------------------------------------------------------------------ */

function stripWebp(bytes) {
  if (bytes.length < 12 || bytes.toString('binary', 0, 4) !== 'RIFF' || bytes.toString('binary', 8, 12) !== 'WEBP') return null
  const chunks = []
  let i = 12
  while (i + 8 <= bytes.length) {
    const type = bytes.toString('binary', i, i + 4)
    const size = bytes.readUInt32LE(i + 4)
    const padded = size + (size % 2)
    const end = i + 8 + padded
    if (i + 8 + size > bytes.length) return null
    if (type === 'EXIF' || type === 'XMP ') {
      i = end
      continue
    }
    const chunk = Buffer.from(bytes.subarray(i, Math.min(end, bytes.length)))
    if (type === 'VP8X' && size >= 1) {
      // The extended header flags say which metadata chunks follow.
      chunk[8] &= ~(0x08 | 0x04)
    }
    chunks.push(chunk)
    i = end
  }
  if (!chunks.length) return null
  const body = Buffer.concat(chunks)
  const header = Buffer.alloc(12)
  header.write('RIFF', 0, 'binary')
  header.writeUInt32LE(4 + body.length, 4)
  header.write('WEBP', 8, 'binary')
  return Buffer.concat([header, body])
}
