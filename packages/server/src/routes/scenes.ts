import { SceneSchema } from '@dashboard/core'
import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'

export const registerScenesRoutes = (app: FastifyInstance, db: Database.Database) => {
  app.get('/api/scenes', async () => {
    const rows = db
      .prepare('SELECT id, name, layout_json, is_default FROM scenes ORDER BY created_at ASC')
      .all() as Array<{ id: string; name: string; layout_json: string; is_default: number }>
    return {
      scenes: rows.map((r) => ({
        id: r.id,
        name: r.name,
        isDefault: r.is_default === 1,
        cells: JSON.parse(r.layout_json),
      })),
    }
  })

  app.post('/api/scenes', async (req, reply) => {
    let scene
    try {
      scene = SceneSchema.parse(req.body)
    } catch (err) {
      if (err instanceof ZodError) {
        reply.code(422)
        return {
          error: 'invalid scene',
          issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        }
      }
      throw err
    }
    const now = Date.now()
    db.prepare(
      `INSERT INTO scenes (id, name, layout_json, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         layout_json = excluded.layout_json,
         is_default = excluded.is_default,
         updated_at = excluded.updated_at`,
    ).run(scene.id, scene.name, JSON.stringify(scene.cells), scene.isDefault ? 1 : 0, now, now)
    reply.code(201)
    app.broker.publish({ type: 'scene:updated', sceneId: scene.id })
    return scene
  })
}
