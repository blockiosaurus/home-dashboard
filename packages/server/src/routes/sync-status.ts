import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { loadSyncStatus } from '../sync/sync-status'

export const registerSyncStatusRoutes = (app: FastifyInstance, db: Database.Database) => {
  app.get('/api/sync/status', async () => {
    const status = loadSyncStatus(db)
    const { n } = db
      .prepare('SELECT count(*) as n FROM events_cache WHERE deleted_at IS NULL')
      .get() as { n: number }
    return { ...status, eventCount: n }
  })
}
