import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createStateStore } from '../widgets/state-store'

const Body = z.object({
  widgetId: z.string().min(1),
  data: z.unknown(),
  expectedVersion: z.number().int().nonnegative().optional(),
})

export const registerWidgetStateRoutes = (app: FastifyInstance, db: Database.Database) => {
  const store = createStateStore(db)

  app.get<{ Params: { instanceId: string } }>(
    '/api/widgets/:instanceId/state',
    async (req, reply) => {
      const record = store.get(req.params.instanceId)
      if (!record) {
        reply.code(404)
        return { error: 'not found' }
      }
      return record
    },
  )

  app.put<{ Params: { instanceId: string } }>(
    '/api/widgets/:instanceId/state',
    async (req, reply) => {
      const body = Body.parse(req.body)
      try {
        const record = store.put(
          req.params.instanceId,
          body.widgetId,
          body.data,
          body.expectedVersion ?? null,
        )
        app.broker.publish({ type: 'widget:data', instanceId: req.params.instanceId, payload: record.data })
        return record
      } catch (err) {
        if (String(err).includes('conflict')) {
          reply.code(409)
          return { error: 'version conflict' }
        }
        throw err
      }
    },
  )
}
