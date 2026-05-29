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

export const setSyncToken = (db: Database.Database, calendarId: string, token: string | null) => {
  db.prepare('UPDATE calendars SET sync_token = ? WHERE id = ?').run(token, calendarId)
}

export const getSyncToken = (db: Database.Database, calendarId: string): string | null => {
  const row = db
    .prepare('SELECT sync_token FROM calendars WHERE id = ?')
    .get(calendarId) as { sync_token: string | null } | undefined
  return row?.sync_token ?? null
}
