import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

const Query = z.object({
  from: z.coerce.number().int(),
  to: z.coerce.number().int(),
})

export const registerEventsRoutes = (app: FastifyInstance, db: Database.Database) => {
  app.get('/api/events', async (req) => {
    const { from, to } = Query.parse(req.query)
    const rows = db
      .prepare(
        `SELECT e.id, e.calendar_id, e.google_event_id, e.start, e.end, e.all_day,
                e.title, e.location, e.description, e.etag,
                COALESCE(p.color, c.color_override, e.color) AS color,
                p.name AS person_name
         FROM events_cache e
         JOIN calendars c ON c.id = e.calendar_id
         LEFT JOIN people p ON p.primary_calendar_id = c.id
         WHERE c.visible = 1
           AND e.deleted_at IS NULL
           AND e.start < ? AND e.end > ?
         ORDER BY e.start ASC`,
      )
      .all(to, from) as Array<{
      id: string
      calendar_id: string
      google_event_id: string
      start: number
      end: number
      all_day: number
      title: string
      location: string | null
      description: string | null
      color: string | null
      person_name: string | null
      etag: string
    }>
    return {
      events: rows.map((r) => ({
        id: r.id,
        calendarId: r.calendar_id,
        googleEventId: r.google_event_id,
        start: r.start,
        end: r.end,
        allDay: r.all_day === 1,
        title: r.title,
        location: r.location,
        description: r.description,
        color: r.color,
        personName: r.person_name,
        etag: r.etag,
      })),
    }
  })
}
