import { readFileSync } from 'node:fs'
import { ClientMessageSchema, type ServerMessage } from '@dashboard/core'
import agendaDef from '@dashboard/widget-agenda'
import calendarDef from '@dashboard/widget-calendar'
import choresDef from '@dashboard/widget-chores'
import clockDef from '@dashboard/widget-clock'
import mealPlanDef from '@dashboard/widget-meal-plan'
import notesDef from '@dashboard/widget-notes'
import packagesDef from '@dashboard/widget-packages'
import slideshowDef from '@dashboard/widget-slideshow'
import { createSlideshowBackend } from '@dashboard/widget-slideshow/backend'
import weatherDef from '@dashboard/widget-weather'
import { createWeatherBackend } from '@dashboard/widget-weather/backend'
import websocket from '@fastify/websocket'
import type Database from 'better-sqlite3'
import Fastify from 'fastify'
import { openDatabase } from './db'
import { seedDefaultScene } from './db/seed'
import { createAnthropicClient, extractEvents } from './ingest/extract'
import { registerAccountsRoutes } from './routes/accounts'
import { registerAccountsWriteRoutes } from './routes/accounts-write'
import { registerCalendarsRoutes } from './routes/calendars'
import { registerEventWritesRoutes } from './routes/event-writes'
import { registerEventsRoutes } from './routes/events'
import { type Extractor, registerIngestRoutes } from './routes/ingest'
import { registerOauthRoutes } from './routes/oauth'
import { registerPeopleRoutes } from './routes/people'
import { registerPhotosRoutes } from './routes/photos'
import { registerSceneScheduleRoutes } from './routes/scene-schedule'
import { registerScenesRoutes } from './routes/scenes'
import { registerSyncStatusRoutes } from './routes/sync-status'
import { registerSystemRoutes } from './routes/system'
import { registerWidgetStateRoutes } from './routes/widget-state'
import { registerWidgetsListRoute } from './routes/widgets-list'
import { registerStatic } from './static'
import { listLocalPhotos } from './sync/local-photos'
import { startSceneScheduler } from './sync/scene-scheduler'
import { startSyncService } from './sync/service'
import { type WeatherInput, fetchWeather } from './sync/weather-client'
import { collectInstances } from './widgets/instances-from-scene'
import { createRegistry } from './widgets/registry'
import { startWidgetRuntime } from './widgets/runtime'
import { createBroker } from './ws/broker'

export interface AppOptions {
  dataDir: string
  localPhotosDir?: string
  googleClientId?: string
  googleClientSecret?: string
  port?: number
  /** Overrides the open-meteo client the weather backend calls. Only tests
   * pass this; production uses the real `fetchWeather`. */
  fetchWeather?: (input: WeatherInput) => Promise<unknown>
  /** Enables AI import of flyers/PDFs/photos into events. */
  anthropicApiKey?: string
  /** Overrides the Claude-backed extractor. Only tests pass this. */
  extractEvents?: Extractor
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
  // Every widget the editor can place must be registered here, otherwise the
  // palette can't offer it and a scene containing it renders an empty tile.
  // Only weather and slideshow need a server-side backend; the rest either
  // render from the client's own clock/API calls or keep state via
  // /api/widgets/:id/state.
  widgetRegistry.register(clockDef)
  widgetRegistry.register(calendarDef)
  widgetRegistry.register(agendaDef)
  widgetRegistry.register(choresDef)
  widgetRegistry.register(mealPlanDef)
  widgetRegistry.register(notesDef)
  widgetRegistry.register(packagesDef)
  widgetRegistry.register({
    ...weatherDef,
    backend: createWeatherBackend(opts.fetchWeather ?? fetchWeather),
  })

  const localPhotosDir = opts.localPhotosDir ?? './data/photos'
  widgetRegistry.register({
    ...slideshowDef,
    backend: createSlideshowBackend({
      local: { list: () => listLocalPhotos(localPhotosDir) },
    }),
  })

  // Backends run for every scene's widgets, not just the default one, so the
  // Sleep scene's slideshow already has photos by the time it takes over.
  const widgetRuntime = startWidgetRuntime({
    broker,
    widgets: widgetRegistry.list(),
    instances: collectInstances(db.raw),
  })
  widgetCache = widgetRuntime.cache
  app.addHook('onClose', async () => widgetRuntime.stop())
  app.decorate('widgetRegistry', widgetRegistry)
  app.decorate('widgetRuntime', widgetRuntime)

  app.decorate('broker', broker)
  app.decorate('db', db.raw)
  registerScenesRoutes(app, db.raw)
  registerEventsRoutes(app, db.raw)
  registerEventWritesRoutes(app, db.raw)
  registerWidgetStateRoutes(app, db.raw)
  registerAccountsRoutes(app, db.raw)
  registerAccountsWriteRoutes(app, db.raw, { machineId })
  registerCalendarsRoutes(app, db.raw)
  registerWidgetsListRoute(app, db.raw)
  registerPeopleRoutes(app, db.raw)
  const extract: Extractor | undefined =
    opts.extractEvents ??
    (opts.anthropicApiKey
      ? (() => {
          const client = createAnthropicClient(opts.anthropicApiKey)
          return (files, ctx) => extractEvents(client, files, ctx)
        })()
      : undefined)
  registerIngestRoutes(app, extract ? { extract } : {})
  registerSystemRoutes(app, db.raw, {
    googleConfigured: Boolean(opts.googleClientId && opts.googleClientSecret),
    aiImportConfigured: Boolean(extract),
    port: opts.port ?? 3000,
  })
  registerSceneScheduleRoutes(app, db.raw)
  registerSyncStatusRoutes(app, db.raw)
  registerPhotosRoutes(app, { localPhotosDir })

  await registerStatic(app, { localPhotosDir })

  // Sync starts before the OAuth routes so `onAccountAdded` below has a real
  // `runNow` to call as soon as the device flow completes — otherwise a
  // freshly connected account would sit until the next 60s tick before its
  // calendars are discovered, leaving the wizard's calendar picker empty.
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

  registerOauthRoutes(app, db.raw, {
    ...(opts.googleClientId !== undefined ? { clientId: opts.googleClientId } : {}),
    ...(opts.googleClientSecret !== undefined ? { clientSecret: opts.googleClientSecret } : {}),
    machineId,
    onAccountAdded: () => sync.runNow(),
  })

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
    widgetRuntime: ReturnType<typeof startWidgetRuntime>
  }
}
