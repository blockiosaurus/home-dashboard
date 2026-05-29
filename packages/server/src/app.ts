import { readFileSync } from 'node:fs'
import { ClientMessageSchema, type ServerMessage } from '@dashboard/core'
import websocket from '@fastify/websocket'
import type Database from 'better-sqlite3'
import Fastify from 'fastify'
import weatherDef from '@dashboard/widget-weather'
import { createWeatherBackend } from '@dashboard/widget-weather/backend'
import { openDatabase } from './db'
import { seedDefaultScene } from './db/seed'
import { registerAccountsRoutes } from './routes/accounts'
import { registerEventWritesRoutes } from './routes/event-writes'
import { registerWidgetStateRoutes } from './routes/widget-state'
import { registerEventsRoutes } from './routes/events'
import { registerOauthRoutes } from './routes/oauth'
import { registerScenesRoutes } from './routes/scenes'
import { registerStatic } from './static'
import { startSyncService } from './sync/service'
import { fetchWeather } from './sync/weather-client'
import { createBroker } from './ws/broker'
import { createRegistry } from './widgets/registry'
import { startWidgetRuntime } from './widgets/runtime'
import { instancesFromScene } from './widgets/instances-from-scene'

export interface AppOptions {
  dataDir: string
  googleClientId?: string
  googleClientSecret?: string
}

export const buildApp = async (opts: AppOptions) => {
  const app = Fastify({ logger: { transport: { target: 'pino-pretty' } } })
  const broker = createBroker()
  const { db, close: closeDb } = openDatabase(opts.dataDir)
  seedDefaultScene(db.raw)

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

  const widgetRegistry = createRegistry()
  widgetRegistry.register({ ...weatherDef, backend: createWeatherBackend(fetchWeather) })

  const widgetInstances = (() => {
    const scene = db.raw
      .prepare('SELECT layout_json FROM scenes WHERE is_default = 1')
      .get() as { layout_json: string } | undefined
    if (!scene) return []
    return instancesFromScene(JSON.parse(scene.layout_json))
  })()

  const stopWidgets = startWidgetRuntime({
    broker,
    widgets: widgetRegistry.list(),
    instances: widgetInstances,
  })
  app.addHook('onClose', async () => stopWidgets())
  app.decorate('widgetRegistry', widgetRegistry)

  app.decorate('broker', broker)
  app.decorate('db', db.raw)
  registerScenesRoutes(app, db.raw)
  registerEventsRoutes(app, db.raw)
  registerEventWritesRoutes(app, db.raw)
  registerWidgetStateRoutes(app, db.raw)
  registerAccountsRoutes(app, db.raw)

  await registerStatic(app)

  const machineId = (() => {
    try {
      return readFileSync('/etc/machine-id', 'utf8').trim()
    } catch {
      return 'dev-machine'
    }
  })()

  registerOauthRoutes(app, db.raw, {
    ...(opts.googleClientId !== undefined ? { clientId: opts.googleClientId } : {}),
    ...(opts.googleClientSecret !== undefined ? { clientSecret: opts.googleClientSecret } : {}),
    machineId,
  })

  const sync = await startSyncService({
    db: db.raw,
    broker,
    config: {
      ...(opts.googleClientId !== undefined ? { googleClientId: opts.googleClientId } : {}),
      ...(opts.googleClientSecret !== undefined
        ? { googleClientSecret: opts.googleClientSecret }
        : {}),
    },
    machineId,
  })
  app.addHook('onClose', async () => sync.stop())

  app.addHook('onClose', async () => closeDb())
  return app
}

declare module 'fastify' {
  interface FastifyInstance {
    broker: ReturnType<typeof createBroker>
    db: Database.Database
    widgetRegistry: ReturnType<typeof createRegistry>
  }
}
