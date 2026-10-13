import type Database from 'better-sqlite3'
import type { CachedEvent } from './calendar-sync'

export const upsertEvents = (db: Database.Database, events: CachedEvent[]) => {
  const stmt = db.prepare(`
    INSERT INTO events_cache
      (id, calendar_id, google_event_id, etag, start, end, all_day,
       title, location, description, color, last_synced_at)
    VALUES (@id, @calendarId, @googleEventId, @etag, @start, @end, @allDay,
            @title, @location, @description, @color, @lastSyncedAt)
    ON CONFLICT(id) DO UPDATE SET
      etag = excluded.etag,
      start = excluded.start,
      end = excluded.end,
      all_day = excluded.all_day,
      title = excluded.title,
      location = excluded.location,
      description = excluded.description,
      color = excluded.color,
      last_synced_at = excluded.last_synced_at,
      deleted_at = NULL
  `)
  const tx = db.transaction((rows: CachedEvent[]) => {
    for (const r of rows) {
      stmt.run({
        id: r.id,
        calendarId: r.calendarId,
        googleEventId: r.googleEventId,
        etag: r.etag,
        start: r.start.getTime(),
        end: r.end.getTime(),
        allDay: r.allDay ? 1 : 0,
        title: r.title,
        location: r.location,
        description: r.description,
        color: r.color,
        lastSyncedAt: r.lastSyncedAt.getTime(),
      })
    }
  })
  tx(events)
}

export const deleteEvent = (db: Database.Database, id: string) => {
  db.prepare('DELETE FROM events_cache WHERE id = ?').run(id)
}

/** Deletes the given cache ids from one calendar; returns rows removed. */
export const removeEvents = (db: Database.Database, calendarId: string, ids: string[]): number => {
  const stmt = db.prepare('DELETE FROM events_cache WHERE calendar_id = ? AND id = ?')
  const tx = db.transaction((rows: string[]) =>
    rows.reduce((n, id) => n + stmt.run(calendarId, id).changes, 0),
  )
  return tx(ids)
}

/** Deletes a calendar's cached rows overlapping [from, to) whose ids are not
 * in `keep`. Rows still waiting on the outbox (etag 'pending') aren't in
 * Google yet, so they're left alone. Returns rows removed. */
export const pruneEventsNotIn = (
  db: Database.Database,
  calendarId: string,
  window: { from: number; to: number },
  keep: string[],
): number => {
  const keepSet = new Set(keep)
  const candidates = db
    .prepare(
      `SELECT id FROM events_cache
       WHERE calendar_id = ? AND start < ? AND end > ? AND etag != 'pending'`,
    )
    .all(calendarId, window.to, window.from) as Array<{ id: string }>
  return removeEvents(
    db,
    calendarId,
    candidates.map((r) => r.id).filter((id) => !keepSet.has(id)),
  )
}

const fullSyncKey = (calendarId: string) => `calendar_full_sync_at:${calendarId}`

export const getFullSyncAt = (db: Database.Database, calendarId: string): number | null => {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(fullSyncKey(calendarId)) as
    | { value: string }
    | undefined
  return row ? Number(row.value) : null
}

export const setFullSyncAt = (db: Database.Database, calendarId: string, at: number) => {
  db.prepare(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(fullSyncKey(calendarId), String(at))
}

export const setSyncToken = (db: Database.Database, calendarId: string, token: string | null) => {
  db.prepare('UPDATE calendars SET sync_token = ? WHERE id = ?').run(token, calendarId)
}

export const getSyncToken = (db: Database.Database, calendarId: string): string | null => {
  const row = db.prepare('SELECT sync_token FROM calendars WHERE id = ?').get(calendarId) as
    | { sync_token: string | null }
    | undefined
  return row?.sync_token ?? null
}
