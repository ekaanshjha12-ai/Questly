import jpeg from 'jpeg-js'

/**
 * Perceptual hashing for proof photos.
 *
 * Deliberately server-side: the client could compute a hash far more cheaply,
 * but a hash the client supplies is one the client can forge, which defeats the
 * entire point. The browser only ever sends pixels.
 *
 * Uses pHash: downsample to 32x32 grey, take the 2-D DCT, keep the low-frequency
 * 8x8 corner and record which coefficients sit above the median.
 *
 * A simpler gradient hash (dHash) was tried first and measured badly. It
 * compares neighbouring pixels, so across the large flat regions common in real
 * photos — a wall, the sky — the comparison is a coin flip and JPEG noise flips
 * dozens of bits. In testing the same image re-saved at quality 30 landed 37
 * bits from the original while a completely different image landed 11, leaving
 * no threshold that could separate them. Discarding high frequencies first
 * makes pHash largely immune to exactly that noise.
 */

const SAMPLE = 32 // DCT input size.
const KEEP = 8 // Low-frequency block retained; 8x8 = 64 bits.

function toGrayscale({ data, width, height }) {
  const gray = new Float64Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    // Rec. 601 luma — closer to perceived brightness than a flat average.
    gray[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]
  }
  return gray
}

/** Box-samples the image down to `w`x`h`, averaging source pixels per cell so
 * detail is blended rather than point-sampled. */
function resize(gray, width, height, w, h) {
  const out = new Float64Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * height) / h)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / h))
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * width) / w)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / w))
      let sum = 0
      let count = 0
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          sum += gray[yy * width + xx]
          count++
        }
      }
      out[y * w + x] = count ? sum / count : 0
    }
  }
  return out
}

/** Precomputed DCT-II basis: cos((2x+1) * u * pi / 2N). */
const COS = (() => {
  const table = new Float64Array(SAMPLE * SAMPLE)
  for (let u = 0; u < SAMPLE; u++) {
    for (let x = 0; x < SAMPLE; x++) {
      table[u * SAMPLE + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SAMPLE))
    }
  }
  return table
})()

/** Separable 2-D DCT-II: rows first, then columns. */
function dct2d(values) {
  const rows = new Float64Array(SAMPLE * SAMPLE)
  for (let y = 0; y < SAMPLE; y++) {
    for (let u = 0; u < SAMPLE; u++) {
      let sum = 0
      for (let x = 0; x < SAMPLE; x++) sum += values[y * SAMPLE + x] * COS[u * SAMPLE + x]
      rows[y * SAMPLE + u] = sum
    }
  }

  const out = new Float64Array(SAMPLE * SAMPLE)
  for (let u = 0; u < SAMPLE; u++) {
    for (let v = 0; v < SAMPLE; v++) {
      let sum = 0
      for (let y = 0; y < SAMPLE; y++) sum += rows[y * SAMPLE + u] * COS[v * SAMPLE + y]
      out[v * SAMPLE + u] = sum
    }
  }
  return out
}

/** 64-bit pHash as a 16-character hex string. Throws if the buffer will not
 * decode as a JPEG. */
export function perceptualHash(buffer) {
  const raw = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 64 })
  const gray = toGrayscale(raw)
  const small = resize(gray, raw.width, raw.height, SAMPLE, SAMPLE)
  const freq = dct2d(small)

  // Low-frequency corner, skipping DC — it only encodes overall brightness, so
  // including it would make a simple exposure change look like a new photo.
  const coeffs = []
  for (let y = 0; y < KEEP; y++) {
    for (let x = 0; x < KEEP; x++) {
      if (x === 0 && y === 0) continue
      coeffs.push(freq[y * SAMPLE + x])
    }
  }

  const sorted = [...coeffs].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]

  // 63 coefficients plus a constant pad bit keeps the hash a round 64 bits.
  let bits = coeffs.map((c) => (c > median ? '1' : '0')).join('') + '0'

  let hex = ''
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  }
  return hex
}

/** Number of differing bits between two hex hashes. 0 means identical. */
export function hammingDistance(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return Infinity
  let distance = 0
  for (let i = 0; i < a.length; i++) {
    let xor = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    while (xor) {
      distance += xor & 1
      xor >>= 1
    }
  }
  return distance
}

/**
 * Below this many differing bits, two photos are treated as the same shot.
 *
 * Measured on this implementation: an identical re-upload sits at 0, quality-15
 * recompression at 0, a 50% downscale at 6, a 25% downscale at 8. Photos of
 * genuinely different scenes came in at 28–34. Twelve sits in the empty gap —
 * comfortably above every same-photo variant, well below anything distinct.
 *
 * Note this matches on composition, so two near-identical shots of the same
 * wall from the same angle will collide even if they are separate exposures.
 * That is intended: re-photographing one scene twice is exactly the low-effort
 * proof this is meant to discourage.
 */
export const DUPLICATE_THRESHOLD = 12
