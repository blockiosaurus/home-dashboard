import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

const PersonBody = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  avatarUrl: z.string().url().optional(),
  primaryCalendarId: z.string().optional(),
})

export const registerPeopleRoutes = (app: FastifyInstance, db: Database.Database) => {
  app.get('/api/people', async () => {
    const rows = db
      .prepare(
        'SELECT id, name, color, avatar_url, primary_calendar_id FROM people ORDER BY name ASC',
      )
      .all() as Array<{
      id: string
      name: string
      color: string
      avatar_url: string | null
      primary_calendar_id: string | null
    }>
    return {
      people: rows.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        avatarUrl: r.avatar_url,
        primaryCalendarId: r.primary_calendar_id,
      })),
    }
  })

  app.put<{ Params: { id: string } }>('/api/people/:id', async (req) => {
    const body = PersonBody.parse(req.body)
    db.prepare(
      `INSERT INTO people (id, name, color, avatar_url, primary_calendar_id)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         color = excluded.color,
         avatar_url = excluded.avatar_url,
         primary_calendar_id = excluded.primary_calendar_id`,
    ).run(
      req.params.id,
      body.name,
      body.color,
      body.avatarUrl ?? null,
      body.primaryCalendarId ?? null,
    )
    return { id: req.params.id, ...body }
  })

  app.delete<{ Params: { id: string } }>('/api/people/:id', async (req, reply) => {
    db.prepare('DELETE FROM people WHERE id = ?').run(req.params.id)
    reply.code(204)
    return null
  })
}
