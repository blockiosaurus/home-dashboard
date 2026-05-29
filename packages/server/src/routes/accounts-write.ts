import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { createEncryptor, deriveKey } from '../auth/encryption'
import { revokeRefreshToken } from '../auth/google-revoke'

export interface AccountsWriteDeps {
  machineId: string
}

export const registerAccountsWriteRoutes = (
  app: FastifyInstance,
  db: Database.Database,
  deps: AccountsWriteDeps,
) => {
  app.delete<{ Params: { id: string } }>('/api/accounts/:id', async (req, reply) => {
    const row = db
      .prepare('SELECT refresh_token_encrypted FROM accounts WHERE id = ?')
      .get(req.params.id) as { refresh_token_encrypted: string } | undefined
    if (!row) {
      reply.code(404)
      return { error: 'not found' }
    }
    const saltRow = db.prepare("SELECT value FROM kv WHERE key='salt'").get() as
      | { value: string }
      | undefined
    if (saltRow) {
      try {
        const key = await deriveKey(deps.machineId, saltRow.value)
        const enc = await createEncryptor(key)
        const refreshToken = enc.decrypt(row.refresh_token_encrypted)
        await revokeRefreshToken(refreshToken)
      } catch (err) {
        app.log.warn({ err }, 'token revocation failed; deleting row anyway')
      }
    }
    db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id)
    reply.code(204)
    return null
  })
}
