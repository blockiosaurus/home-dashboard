import type { GoogleEvent } from './google-client'

export interface CachedEvent {
  id: string
  calendarId: string
  googleEventId: string
  etag: string
  start: Date
  end: Date
  allDay: boolean
  title: string
  location: string | null
  description: string | null
  color: string | null
  lastSyncedAt: Date
}

export type EventsCacheMap = Map<string, CachedEvent>

const toDate = (s: GoogleEvent['start']): { date: Date; allDay: boolean } | null => {
  if (!s) return null
  if (s.dateTime) return { date: new Date(s.dateTime), allDay: false }
  if (s.date) return { date: new Date(`${s.date}T00:00:00Z`), allDay: true }
  return null
}

export interface DiffResult {
  upserts: number
  deletes: number
  skipped: number
}

export const cacheKey = (calendarId: string, eventId: string) => `${calendarId}::${eventId}`

export const applyEventsDiff = (
  cache: EventsCacheMap,
  calendarId: string,
  events: GoogleEvent[],
  syncedAt: number,
): DiffResult => {
  let upserts = 0
  let deletes = 0
  let skipped = 0
  for (const ev of events) {
    const key = cacheKey(calendarId, ev.id)
    if (ev.status === 'cancelled') {
      if (cache.delete(key)) deletes++
      continue
    }
    const start = toDate(ev.start)
    const end = toDate(ev.end)
    if (!start || !end) {
      skipped++
      continue
    }
    cache.set(key, {
      id: key,
      calendarId,
      googleEventId: ev.id,
      etag: ev.etag,
      start: start.date,
      end: end.date,
      allDay: start.allDay,
      title: ev.summary ?? '(no title)',
      location: ev.location ?? null,
      description: ev.description ?? null,
      color: ev.colorId ?? null,
      lastSyncedAt: new Date(syncedAt),
    })
    upserts++
  }
  return { upserts, deletes, skipped }
}
