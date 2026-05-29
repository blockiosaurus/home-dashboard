import { ClientMessageSchema, type ServerMessage } from '@dashboard/core'
import websocket from '@fastify/websocket'
import type Database from 'better-sqlite3'
import Fastify from 'fastify'
import { openDatabase } from './db'
import { registerAccountsRoutes } from './routes/accounts'
import { registerEventWritesRoutes } from './routes/event-writes'
import { registerEventsRoutes } from './routes/events'
import { registerScenesRoutes } from './routes/scenes'
import { registerStatic } from './static'
import { createBroker } from './ws/broker'

export interface AppOptions {
  dataDir: string
}

export const buildApp = async (opts: AppOptions) => {
  const app = Fastify({ logger: { transport: { target: 'pino-pretty' } } })
  const broker = createBroker()
  const { db, close: closeDb } = openDatabase(opts.dataDir)

  await app.register(websocket)

  app.get('/api/health', async () => ({ status: 'ok' }))
  app.get('/ws', { websocket: true }, (socket) => {
    const send = (m: ServerMessage) => socket.send(JSON.stringify(m))
    const unsub = broker.subscribe(send)
    socket.on('message', (raw: Buffer) => {
      try {
        ClientMessageSchema.parse(JSON.parse(raw.toString()))
      } catch {
        // ignore malformed
      }
    })
    socket.on('close', unsub)
  })

  app.decorate('broker', broker)
  app.decorate('db', db.raw)
  registerScenesRoutes(app, db.raw)
  registerEventsRoutes(app, db.raw)
  registerEventWritesRoutes(app, db.raw)
  registerAccountsRoutes(app, db.raw)

  await registerStatic(app)

  app.addHook('onClose', async () => closeDb())
  return app
}

declare module 'fastify' {
  interface FastifyInstance {
    broker: ReturnType<typeof createBroker>
    db: Database.Database
  }
}
