import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import {
  pollDeviceFlow,
  startDeviceFlow,
  type DeviceFlowStart,
} from '../auth/google'
import { createEncryptor, deriveKey } from '../auth/encryption'

interface PendingFlow extends DeviceFlowStart {
  startedAt: number
}

export const registerOauthRoutes = (
  app: FastifyInstance,
  db: Database.Database,
  config: { clientId?: string; clientSecret?: string; machineId: string },
) => {
  const pending = new Map<string, PendingFlow>()

  app.post('/api/oauth/start', async (_, reply) => {
    if (!config.clientId) {
      reply.code(400)
      return { error: 'google client id not configured' }
    }
    const flow = await startDeviceFlow(config.clientId)
    pending.set(flow.deviceCode, { ...flow, startedAt: Date.now() })
    return {
      userCode: flow.userCode,
      verificationUrl: flow.verificationUrl,
      expiresAt: flow.expiresAt,
      deviceCode: flow.deviceCode,
    }
  })

  app.post<{ Body: { deviceCode: string } }>('/api/oauth/poll', async (req) => {
    if (!config.clientId || !config.clientSecret) return { status: 'error' }
    const { deviceCode } = req.body
    if (!pending.has(deviceCode)) return { status: 'unknown' }
    const result = await pollDeviceFlow(config.clientId, config.clientSecret, deviceCode)
    if (result === 'pending') return { status: 'pending' }
    if (result === 'denied' || result === 'expired') {
      pending.delete(deviceCode)
      return { status: result }
    }
    pending.delete(deviceCode)
    // Persist account
    const saltRow = db.prepare("SELECT value FROM kv WHERE key='salt'").get() as
      | { value: string }
      | undefined
    let salt = saltRow?.value
    if (!salt) {
      salt = randomUUID()
      db.prepare("INSERT INTO kv (key, value) VALUES ('salt', ?)").run(salt)
    }
    const key = await deriveKey(config.machineId, salt)
    const enc = await createEncryptor(key)
    const encryptedRefresh = enc.encrypt(result.refreshToken)
    const id = randomUUID()
    db.prepare(
      `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
       VALUES (?, 'google', '', ?, ?, ?)`,
    ).run(id, encryptedRefresh, 'calendar', Date.now())
    return { status: 'ok', accountId: id }
  })
}
