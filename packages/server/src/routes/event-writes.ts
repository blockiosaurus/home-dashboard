import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

const NewEvent = z.object({
  calendarId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.number().int(),
  end: z.number().int(),
  allDay: z.boolean().default(false),
})

export const registerEventWritesRoutes = (app: FastifyInstance, db: Database.Database) => {
  app.post('/api/events', async (req, reply) => {
    const body = NewEvent.parse(req.body)
    const id = `${body.calendarId}::pending-${randomUUID()}`
    const now = Date.now()
    db.transaction(() => {
      db.prepare(
        `INSERT INTO events_cache
          (id, calendar_id, google_event_id, etag, start, end, all_day,
           title, location, description, color, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      ).run(
        id,
        body.calendarId,
        '',
        'pending',
        body.start,
        body.end,
        body.allDay ? 1 : 0,
        body.title,
        body.location ?? null,
        body.description ?? null,
        now,
      )
      db.prepare(
        `INSERT INTO events_outbox
          (id, op, payload_json, attempts, next_attempt_at, created_at)
         VALUES (?, 'create', ?, 0, ?, ?)`,
      ).run(randomUUID(), JSON.stringify({ cacheId: id, body }), now, now)
    })()
    app.broker.publish({ type: 'calendar:changed' })
    reply.code(201)
    return { id }
  })
}
