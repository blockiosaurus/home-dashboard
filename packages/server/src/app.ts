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
import { registerAccountsWriteRoutes } from './routes/accounts-write'
import { registerEventWritesRoutes } from './routes/event-writes'
import { registerEventsRoutes } from './routes/events'
import { registerGoogleAlbumsRoute } from './routes/google-albums'
import { registerOauthRoutes } from './routes/oauth'
import { registerPeopleRoutes } from './routes/people'
import { registerPhotosRoutes } from './routes/photos'
import { registerPhotosAmbientRoutes } from './routes/photos-ambient'
import { registerSceneScheduleRoutes } from './routes/scene-schedule'
import { registerScenesRoutes } from './routes/scenes'
import { registerSystemRoutes } from './routes/system'
import { registerWidgetStateRoutes } from './routes/widget-state'
import { registerWidgetsListRoute } from './routes/widgets-list'
import { registerStatic } from './static'
import { listAmbientMediaItems } from './sync/google-ambient'
import { listAlbumMedia } from './sync/google-photos'
import { listLocalPhotos } from './sync/local-photos'
import { startSceneScheduler } from './sync/scene-scheduler'
import { startSyncService } from './sync/service'
import { fetchWeather } from './sync/weather-client'
import { instancesFromScene } from './widgets/instances-from-scene'
import { createRegistry } from './widgets/registry'
import { startWidgetRuntime } from './widgets/runtime'
import { createBroker } from './ws/broker'

export interface AppOptions {
  dataDir: string
  localPhotosDir?: string
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
  // Defer-binding the runtime handle so the WS route can replay the cache to
  // newly-connected clients. Populated below after startWidgetRuntime.
  let widgetCache: { entries: () => Iterable<[string, unknown]> } | null = null

  app.get('/ws', { websocket: true }, (socket) => {
    const send = (m: ServerMessage) => socket.send(JSON.stringify(m))
    const unsub = broker.subscribe(send)
    // Replay last-known widget data so a fresh kiosk doesn't sit at "Loading…"
    // until the next backend tick (which can be up to 15 minutes for weather).
    if (widgetCache) {
      for (const [instanceId, payload] of widgetCache.entries()) {
        send({ type: 'widget:data', instanceId, payload })
      }
    }
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

  registerGoogleAlbumsRoute(app, { getAccessToken })

  const localPhotosDir = opts.localPhotosDir ?? './data/photos'
  const listAmbientForFirstAccount = async () => {
    const row = db.raw
      .prepare(
        'SELECT ambient_device_id FROM accounts WHERE ambient_device_id IS NOT NULL ORDER BY created_at ASC LIMIT 1',
      )
      .get() as { ambient_device_id: string } | undefined
    if (!row) return []
    const token = await getAccessToken()
    if (!token) return []
    try {
      return await listAmbientMediaItems(token, row.ambient_device_id)
    } catch (err) {
      app.log.warn({ err }, 'ambient media fetch failed')
      return []
    }
  }
  widgetRegistry.register({
    ...slideshowDef,
    backend: createSlideshowBackend({
      googlePhotos: { list: listAlbumMedia, getAccessToken },
      local: { list: () => listLocalPhotos(localPhotosDir) },
      ambient: { list: listAmbientForFirstAccount },
    }),
  })

  const widgetInstances = (() => {
    const scene = db.raw.prepare('SELECT layout_json FROM scenes WHERE is_default = 1').get() as
      | { layout_json: string }
      | undefined
    if (!scene) return []
    return instancesFromScene(JSON.parse(scene.layout_json))
  })()

  const widgetRuntime = startWidgetRuntime({
    broker,
    widgets: widgetRegistry.list(),
    instances: widgetInstances,
  })
  widgetCache = widgetRuntime.cache
  app.addHook('onClose', async () => widgetRuntime.stop())
  app.decorate('widgetRegistry', widgetRegistry)

  app.decorate('broker', broker)
  app.decorate('db', db.raw)
  registerScenesRoutes(app, db.raw)
  registerEventsRoutes(app, db.raw)
  registerEventWritesRoutes(app, db.raw)
  registerWidgetStateRoutes(app, db.raw)
  registerAccountsRoutes(app, db.raw)
  registerAccountsWriteRoutes(app, db.raw, { machineId })
  registerWidgetsListRoute(app)
  registerPeopleRoutes(app, db.raw)
  registerSystemRoutes(app, db.raw)
  registerSceneScheduleRoutes(app, db.raw)
  registerPhotosRoutes(app, { localPhotosDir })
  registerPhotosAmbientRoutes(app, db.raw, { getAccessToken })

  await registerStatic(app, { localPhotosDir })

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

  const sceneSched = startSceneScheduler({ db: db.raw, broker })
  app.addHook('onClose', async () => sceneSched.stop())

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
