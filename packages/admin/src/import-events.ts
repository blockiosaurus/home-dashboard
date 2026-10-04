import type { IngestUpload, ProposedEvent } from './api'

const DAY_MS = 86_400_000
const DEFAULT_DURATION_MS = 60 * 60_000
/** Claude downsamples anything larger, and phone photos are often 10 MB+. */
const MAX_IMAGE_EDGE = 2000

/** Turn a proposal's local wall-clock strings into the epoch-ms span
 * POST /api/events stores. All-day events follow the Google sync's
 * convention: UTC midnight of the first day to UTC midnight after the last
 * (exclusive). Timed events are read in this browser's zone, which is the
 * household's — the Pi's clock zone may not be. Returns null when the
 * fields don't form a valid span, so the row can be flagged instead of
 * saved wrong. */
export const toEventSpan = (
  e: Pick<ProposedEvent, 'date' | 'endDate' | 'startTime' | 'endTime' | 'allDay'>,
): { start: number; end: number; allDay: boolean } | null => {
  const lastDay = e.endDate || e.date
  if (e.allDay || !e.startTime) {
    const start = Date.parse(`${e.date}T00:00:00Z`)
    const end = Date.parse(`${lastDay}T00:00:00Z`) + DAY_MS
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null
    return { start, end, allDay: true }
  }
  const start = new Date(`${e.date}T${e.startTime}`).getTime()
  if (Number.isNaN(start)) return null
  if (!e.endTime) return { start, end: start + DEFAULT_DURATION_MS, allDay: false }
  let end = new Date(`${lastDay}T${e.endTime}`).getTime()
  // "7pm–1am" on a single-day event runs past midnight.
  if (!e.endDate && end <= start) end += DAY_MS
  if (Number.isNaN(end) || end <= start) return null
  return { start, end, allDay: false }
}

export const localToday = (): string => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const readAsBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result)
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })

/** Re-encode a photo as a capped-size JPEG. This also converts formats the
 * API doesn't take (iPhone HEIC, which Safari can still decode) and strips
 * the multi-megabyte originals down to something quick to upload. */
const imageToJpeg = async (file: File): Promise<string> => {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`Couldn't open ${file.name} as an image.`)
  })
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
  if (!blob) throw new Error(`Couldn't convert ${file.name}.`)
  return readAsBase64(blob)
}

export const isImportable = (file: File): boolean =>
  file.type === 'application/pdf' ||
  file.type.startsWith('image/') ||
  /\.(pdf|heic|heif)$/i.test(file.name)

export const prepareUpload = async (file: File): Promise<IngestUpload> => {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return { name: file.name, mediaType: 'application/pdf', data: await readAsBase64(file) }
  }
  return { name: file.name, mediaType: 'image/jpeg', data: await imageToJpeg(file) }
}
