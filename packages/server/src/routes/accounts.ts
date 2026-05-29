import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'

export const registerAccountsRoutes = (app: FastifyInstance, db: Database.Database) => {
  app.get('/api/accounts', async () => {
    const rows = db
      .prepare('SELECT id, provider, email, created_at FROM accounts ORDER BY created_at ASC')
      .all() as Array<{ id: string; provider: string; email: string; created_at: number }>
    return { accounts: rows }
  })
}
