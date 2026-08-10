import { readCaptureTime } from './exif'

const MAX_EDGE = 1024
const JPEG_QUALITY = 0.82

export interface PreparedImage {
  base64: string
  mediaType: string
  /** Shutter time from EXIF, when the file carried one. */
  capturedAt: number | null
}

/**
 * Downscales a photo in the browser before upload. Phone cameras produce
 * multi-megabyte images; re-encoding to a ~1024px JPEG keeps the request small
 * and costs nothing in accuracy for "does this look like the task" judgements.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  // Read the timestamp first: the canvas re-encode below wipes all metadata.
  const capturedAt = await readCaptureTime(file)

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
      const width = Math.max(1, Math.round(img.width * scale))
      const height = Math.max(1, Math.round(img.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Could not process that image.'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)

      const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
      const base64 = dataUrl.split(',')[1]
      if (!base64) {
        reject(new Error('Could not process that image.'))
        return
      }
      resolve({ base64, mediaType: 'image/jpeg', capturedAt })
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file does not look like an image.'))
    }

    img.src = url
  })
}
