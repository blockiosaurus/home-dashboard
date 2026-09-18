import type Database from 'better-sqlite3'
import cronParser from 'cron-parser'
import type { FastifyInstance } from 'fastify'
import { ZodError, z } from 'zod'

const { parseExpression } = cronParser

const isValidCron = (expr: string): boolean => {
  try {
    parseExpression(expr)
    return true
  } catch {
    return false
  }
}

const Body = z.object({
  sceneId: z.string().min(1),
  cronExpr: z.string().min(1).refine(isValidCron, { message: 'invalid cron expression' }),
  priority: z.number().int().default(0),
})

export const registerSceneScheduleRoutes = (app: FastifyInstance, db: Database.Database) => {
  app.get('/api/scene-schedule', async () => {
    const rows = db
      .prepare(
        'SELECT id, scene_id, cron_expr, priority FROM scene_schedule ORDER BY priority DESC',
      )
      .all() as Array<{ id: string; scene_id: string; cron_expr: string; priority: number }>
    return {
      rules: rows.map((r) => ({
        id: r.id,
        sceneId: r.scene_id,
        cronExpr: r.cron_expr,
        priority: r.priority,
      })),
    }
  })

  app.put<{ Params: { id: string } }>('/api/scene-schedule/:id', async (req, reply) => {
    let body: z.infer<typeof Body>
    try {
      body = Body.parse(req.body)
    } catch (err) {
      if (err instanceof ZodError) {
        reply.code(422)
        return {
          error: 'invalid rule',
          issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        }
      }
      throw err
    }
    db.prepare(
      `INSERT INTO scene_schedule (id, scene_id, cron_expr, priority)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         scene_id = excluded.scene_id,
         cron_expr = excluded.cron_expr,
         priority = excluded.priority`,
    ).run(req.params.id, body.sceneId, body.cronExpr, body.priority)
    return { id: req.params.id, ...body }
  })

  app.delete<{ Params: { id: string } }>('/api/scene-schedule/:id', async (req, reply) => {
    db.prepare('DELETE FROM scene_schedule WHERE id = ?').run(req.params.id)
    reply.code(204)
    return null
  })
}
