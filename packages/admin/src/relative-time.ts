/** Tiny "3 minutes ago" formatter — no dependency, just seconds → a plain
 * English phrase. Only ever needs coarse precision (sync ticks every 60s),
 * so it doesn't bother with weeks/months/years. */
export const relativeTime = (from: number, now: number = Date.now()): string => {
  const seconds = Math.max(0, Math.round((now - from) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
