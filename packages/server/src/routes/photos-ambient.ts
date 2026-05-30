import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { createAmbientDevice, deleteAmbientDevice, getAmbientDevice } from '../sync/google-ambient'

export interface PhotosAmbientDeps {
  getAccessToken: () => Promise<string | null>
}

const accountRow = (db: Database.Database) =>
  db.prepare('SELECT id, ambient_device_id FROM accounts ORDER BY created_at ASC LIMIT 1').get() as
    | { id: string; ambient_device_id: string | null }
    | undefined

export const registerPhotosAmbientRoutes = (
  app: FastifyInstance,
  db: Database.Database,
  deps: PhotosAmbientDeps,
) => {
  // Create (or return existing) ambient device for the connected account.
  // Returns the device id + settingsUri the wizard renders as a QR code.
  app.post('/api/photos/ambient/register', async (_, reply) => {
    const account = accountRow(db)
    if (!account) {
      reply.code(400)
      return { error: 'connect a google account first' }
    }
    const token = await deps.getAccessToken()
    if (!token) {
      reply.code(400)
      return { error: 'no access token (re-authorize google)' }
    }

    // If we've registered before, return the existing device unless it's been
    // revoked on Google's side (treat 404 as "make a fresh one").
    if (account.ambient_device_id) {
      try {
        const existing = await getAmbientDevice(token, account.ambient_device_id)
        return existing
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!msg.includes('404')) {
          app.log.warn({ err }, 'getAmbientDevice failed; creating a new one')
        }
      }
    }

    try {
      const device = await createAmbientDevice(token)
      db.prepare('UPDATE accounts SET ambient_device_id = ? WHERE id = ?').run(
        device.deviceId,
        account.id,
      )
      return device
    } catch (err) {
      app.log.error({ err }, 'createAmbientDevice failed')
      reply.code(502)
      return {
        error: err instanceof Error ? err.message : 'google ambient register failed',
      }
    }
  })

  // Poll until the user finishes picking sources in the Google Photos app.
  app.get('/api/photos/ambient/status', async (_, reply) => {
    const account = accountRow(db)
    if (!account?.ambient_device_id) {
      reply.code(404)
      return { error: 'no ambient device registered' }
    }
    const token = await deps.getAccessToken()
    if (!token) {
      reply.code(400)
      return { error: 'no access token' }
    }
    return getAmbientDevice(token, account.ambient_device_id)
  })

  // Tear down — used when the user wants to re-pick sources or disconnect.
  app.delete('/api/photos/ambient', async (_, reply) => {
    const account = accountRow(db)
    if (!account?.ambient_device_id) {
      reply.code(204)
      return null
    }
    const token = await deps.getAccessToken()
    if (token) {
      try {
        await deleteAmbientDevice(token, account.ambient_device_id)
      } catch (err) {
        app.log.warn({ err }, 'deleteAmbientDevice failed; clearing row anyway')
      }
    }
    db.prepare('UPDATE accounts SET ambient_device_id = NULL WHERE id = ?').run(account.id)
    reply.code(204)
    return null
  })
}
