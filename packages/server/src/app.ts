import { readFileSync } from 'node:fs'
import { ClientMessageSchema, type ServerMessage } from '@dashboard/core'
import slideshowDef from '@dashboard/widget-slideshow'
import { createSlideshowBackend } from '@dashboard/widget-slideshow/backend'
import weatherDef from '@dashboard/widget-weather'
import { createWeatherBackend } from '@dashboard/widget-weather/backend'
import websocket from '@fastify/websocket'
import type Database from 'better-sqlite3'
import Fastify from 'fastify'
import { createAccessTokenProvider } from './auth/access-token'
import { refreshAccessToken } from './auth/google'
import { openDatabase } from './db'
import { seedDefaultScene } from './db/seed'
import { registerAccountsRoutes } from './routes/accounts'
import { registerEventWritesRoutes } from './routes/event-writes'
import { registerEventsRoutes } from './routes/events'
import { registerOauthRoutes } from './routes/oauth'
import { registerScenesRoutes } from './routes/scenes'
import { registerWidgetStateRoutes } from './routes/widget-state'
import { registerStatic } from './static'
import { listAlbumMedia } from './sync/google-photos'
import { startSyncService } from './sync/service'
import { fetchWeather } from './sync/weather-client'
import { instancesFromScene } from './widgets/instances-from-scene'
import { createRegistry } from './widgets/registry'
import { startWidgetRuntime } from './widgets/runtime'
import { createBroker } from './ws/broker'

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

  const machineId = (() => {
    try {
      return readFileSync('/etc/machine-id', 'utf8').trim()
    } catch {
      return 'dev-machine'
    }
  })()

  const widgetRegistry = createRegistry()
  widgetRegistry.register({ ...weatherDef, backend: createWeatherBackend(fetchWeather) })

  const getAccessToken =
    opts.googleClientId && opts.googleClientSecret
      ? createAccessTokenProvider({
          db: db.raw,
          machineId,
          refresh: (rt) =>
            refreshAccessToken(
              opts.googleClientId as string,
              opts.googleClientSecret as string,
              rt,
            ),
        })
      : async () => null

  widgetRegistry.register({
    ...slideshowDef,
    backend: createSlideshowBackend(listAlbumMedia, getAccessToken),
  })

  const widgetInstances = (() => {
    const scene = db.raw.prepare('SELECT layout_json FROM scenes WHERE is_default = 1').get() as
      | { layout_json: string }
      | undefined
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
