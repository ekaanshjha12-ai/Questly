import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { open } from 'node:fs/promises'
import ffmpegStatic from 'ffmpeg-static'

/**
 * Feed videos: checking what an upload really is, pulling frames out of it for
 * the safety check, and re-encoding it into something every browser can play.
 *
 * Everything goes through ffmpeg. The npm package ships a static binary for the
 * machine it is installed on, so the server needs nothing installed beside
 * Node; FFMPEG_PATH points at a different one if the host has its own.
 *
 * Re-encoding every video, rather than serving the upload as it came, does
 * three jobs at once: phones record in formats other browsers cannot play
 * (HEVC from an iPhone does not play in most of them), a phone video carries
 * the GPS position it was filmed at in its metadata, and a file that has been
 * decoded and encoded again is known to be a video and nothing else.
 */

export const VIDEO_MAX_BYTES = 50 * 1024 * 1024
export const VIDEO_MAX_SECONDS = 60
/** Frames looked at by the safety check, spread evenly through the video. */
export const VIDEO_CHECK_FRAMES = 5

function binary() {
  return process.env.FFMPEG_PATH || ffmpegStatic || null
}

export function videoConfigured() {
  const path = binary()
  if (!path) return false
  // A bare command name is looked up on PATH when it runs; a path can be checked now.
  return /[\\/]/.test(path) ? existsSync(path) : true
}

/** Runs ffmpeg, collecting stdout as bytes and the tail of stderr as text. */
function run(args, { timeoutMs = 120_000, stdoutLimit = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary(), ['-hide_banner', '-nostdin', ...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    const out = []
    let outBytes = 0
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(Object.assign(new Error('Processing the video took too long.'), { code: 'timeout' }))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      outBytes += chunk.length
      if (outBytes <= stdoutLimit) out.push(chunk)
    })
    child.stderr.on('data', (chunk) => {
      err = (err + chunk.toString()).slice(-16_000)
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout: Buffer.concat(out), stderr: err })
    })
  })
}

/**
 * Whether the first bytes are a container a video can come in: the ISO media
 * family (mp4, mov, 3gp — an `ftyp` box, or an older QuickTime file opening
 * straight into a movie atom) or Matroska/WebM.
 */
export async function looksLikeVideo(path) {
  const handle = await open(path, 'r')
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(16), 0, 16, 0)
    if (bytesRead < 12) return false
    const box = buffer.toString('latin1', 4, 8)
    if (['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].includes(box)) return true
    return buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3
  } finally {
    await handle.close()
  }
}

/**
 * Reads duration, size and streams from ffmpeg's description of the input.
 * @returns {Promise<{ durationMs: number, width: number, height: number, hasAudio: boolean } | null>}
 */
export async function probe(path) {
  const { stderr } = await run(['-i', path], { timeoutMs: 20_000 })
  const duration = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr)
  const video = /Stream #\d+:\d+[^\n]*: Video: [^\n]*?(\d{2,5})x(\d{2,5})/.exec(stderr)
  if (!duration || !video) return null
  const durationMs = Math.round((Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])) * 1000)
  let width = Number(video[1])
  let height = Number(video[2])
  // A phone held upright records sideways and says so; the picture people see
  // is the other way round.
  const rotation = /rotation of (-?\d+(?:\.\d+)?) degrees/.exec(stderr)
  if (rotation && Math.abs(Math.round(Number(rotation[1]))) % 180 === 90) [width, height] = [height, width]
  return { durationMs, width, height, hasAudio: /Stream #\d+:\d+[^\n]*: Audio:/.test(stderr) }
}

/** A single frame as a JPEG no wider or taller than `maxSide`. */
async function frameAt(path, seconds, maxSide) {
  const { stdout, code, stderr } = await run(
    [
      '-ss', seconds.toFixed(3),
      '-i', path,
      '-frames:v', '1',
      '-vf', `scale=w='min(${maxSide},iw)':h='min(${maxSide},ih)':force_original_aspect_ratio=decrease`,
      '-q:v', '4',
      '-f', 'image2pipe',
      '-vcodec', 'mjpeg',
      'pipe:1',
    ],
    { timeoutMs: 30_000 },
  )
  if (code !== 0 || stdout.length < 100) {
    throw Object.assign(new Error('Could not read frames from that video.'), { code: 'unreadable', detail: stderr.slice(-500) })
  }
  return stdout
}

/** Frames spread evenly through the video, avoiding the very first and last
 * instants, which are often black. */
export async function sampleFrames(path, durationMs, count = VIDEO_CHECK_FRAMES, maxSide = 768) {
  const seconds = durationMs / 1000
  const frames = []
  for (let i = 0; i < count; i++) {
    const at = Math.max(0, Math.min(seconds - 0.05, seconds * ((i + 0.5) / count)))
    frames.push(await frameAt(path, at, maxSide))
  }
  return frames
}

/**
 * Re-encodes to H.264 and AAC in an mp4 that starts playing before it has fully
 * downloaded: at most 1280 pixels on the long side, at most 30 frames a second,
 * no longer than the limit, and with every piece of metadata — including
 * location — left behind.
 */
export async function transcode(input, output) {
  const { code, stderr } = await run(
    [
      '-y',
      '-i', input,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-t', String(VIDEO_MAX_SECONDS),
      '-vf', "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p",
      '-fpsmax', '30',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '26',
      '-profile:v', 'high',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',
      '-map_metadata', '-1',
      '-map_chapters', '-1',
      '-movflags', '+faststart',
      output,
    ],
    { timeoutMs: 240_000, stdoutLimit: 0 },
  )
  if (code !== 0) {
    throw Object.assign(new Error('That video could not be converted. Try an MP4 or MOV file.'), { code: 'unreadable', detail: stderr.slice(-800) })
  }
}

/**
 * One video at a time. Encoding is the heaviest thing this server does; a queue
 * keeps a burst of uploads from starving everyone else's requests.
 */
let tail = Promise.resolve()
export function oneAtATime(task) {
  const result = tail.then(task, task)
  tail = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}
