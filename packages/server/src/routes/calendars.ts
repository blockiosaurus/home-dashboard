import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

const CalendarPatch = z.object({
  visible: z.boolean().optional(),
  color: z.string().nullable().optional(),
})

interface CalendarRow {
  id: string
  account_id: string
  summary: string
  visible: number
  color_override: string | null
}

const toApi = (row: CalendarRow) => ({
  id: row.id,
  accountId: row.account_id,
  summary: row.summary,
  visible: Boolean(row.visible),
  color: row.color_override,
})

export const registerCalendarsRoutes = (app: FastifyInstance, db: Database.Database) => {
  app.get('/api/calendars', async () => {
    const rows = db
      .prepare(
        'SELECT id, account_id, summary, visible, color_override FROM calendars ORDER BY summary ASC',
      )
      .all() as CalendarRow[]
    return { calendars: rows.map(toApi) }
  })

  app.put<{ Params: { id: string } }>('/api/calendars/:id', async (req, reply) => {
    const body = CalendarPatch.parse(req.body)
    const existing = db
      .prepare(
        'SELECT id, account_id, summary, visible, color_override FROM calendars WHERE id = ?',
      )
      .get(req.params.id) as CalendarRow | undefined
    if (!existing) {
      reply.code(404)
      return { error: 'not found' }
    }
    if (body.visible !== undefined) {
      db.prepare('UPDATE calendars SET visible = ? WHERE id = ?').run(
        body.visible ? 1 : 0,
        req.params.id,
      )
    }
    if (body.color !== undefined) {
      db.prepare('UPDATE calendars SET color_override = ? WHERE id = ?').run(
        body.color,
        req.params.id,
      )
    }
    const row = db
      .prepare(
        'SELECT id, account_id, summary, visible, color_override FROM calendars WHERE id = ?',
      )
      .get(req.params.id) as CalendarRow
    return toApi(row)
  })
}
