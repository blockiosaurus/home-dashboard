import { type Scene, SceneSchema } from '@dashboard/core'
import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { collectInstances } from '../widgets/instances-from-scene'

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
    let scene: Scene
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

    // Upsert plus the is_default bookkeeping run as one transaction so a
    // save never leaves the table with two defaults (or, via the guard
    // below, zero).
    const upsert = db.transaction((s: Scene): boolean => {
      let isDefault = s.isDefault
      if (!isDefault) {
        // Refuse to un-default the only default scene — the kiosk and the
        // scene scheduler both need exactly one default to fall back to.
        const current = db.prepare('SELECT is_default FROM scenes WHERE id = ?').get(s.id) as
          | { is_default: number }
          | undefined
        if (current?.is_default === 1) {
          const { n } = db
            .prepare('SELECT COUNT(*) as n FROM scenes WHERE is_default = 1')
            .get() as { n: number }
          if (n <= 1) isDefault = true
        }
      }
      if (isDefault) {
        db.prepare('UPDATE scenes SET is_default = 0 WHERE id != ?').run(s.id)
      }
      db.prepare(
        `INSERT INTO scenes (id, name, layout_json, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           layout_json = excluded.layout_json,
           is_default = excluded.is_default,
           updated_at = excluded.updated_at`,
      ).run(s.id, s.name, JSON.stringify(s.cells), isDefault ? 1 : 0, now, now)
      return isDefault
    })
    const savedIsDefault = upsert(scene)
    const savedScene: Scene = { ...scene, isDefault: savedIsDefault }

    reply.code(201)
    // Tell the kiosk first: the scene is already saved, so a failure to rebuild
    // the widget runtime must not cost the user their scene change or turn a
    // successful save into a 500.
    app.broker.publish({ type: 'scene:updated', sceneId: scene.id })
    // Widget backends are keyed off the saved scenes, so a widget added (or
    // removed) in the editor only starts (or stops) producing data once the
    // runtime is rebuilt from the new layout. Worst case the widget shows no
    // data until the next restart, which beats losing the save.
    try {
      app.widgetRuntime.reload(collectInstances(db))
    } catch (err) {
      app.log.error({ err }, 'widget runtime reload after scene save failed')
    }
    return savedScene
  })
}
