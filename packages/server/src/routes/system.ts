import os from 'node:os'
import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { applyWeatherDefault } from '../scenes/apply-weather-default'
import { buildAdminUrls } from '../system/admin-urls'
import { SystemSchema, loadSystem, saveSystem } from '../system/store'
import { collectInstances } from '../widgets/instances-from-scene'

export const registerSystemRoutes = (
  app: FastifyInstance,
  db: Database.Database,
  deps: { googleConfigured: boolean; port: number },
) => {
  const adminUrls = () =>
    buildAdminUrls({ hostname: os.hostname(), interfaces: os.networkInterfaces(), port: deps.port })

  app.get('/api/system', async () => ({
    ...loadSystem(db),
    googleConfigured: deps.googleConfigured,
    adminUrls: adminUrls(),
  }))

  app.put('/api/system', async (req) => {
    const current = loadSystem(db)
    const body = req.body as Record<string, unknown>
    // googleConfigured is derived from server config, not client-settable; SystemSchema
    // doesn't include it in its shape so zod strips it from the merged body automatically.
    const merged = SystemSchema.parse({ ...current, ...body })
    saveSystem(db, merged)
    // Only push the new default onto scene widgets when the request actually
    // supplied one — a PUT that touches unrelated fields (e.g. manualScene)
    // shouldn't re-apply the existing default and republish every scene.
    if ('weatherDefault' in body && merged.weatherDefault) {
      applyWeatherDefault(db, app.broker, merged.weatherDefault)
      // The weather backend reads lat/lon from the instance config it was
      // started with, so rewriting the cells alone leaves the running backend
      // fetching the old city — the kiosk would show the new label over the
      // old town's temperatures until a restart. Rebuild the runtime from the
      // updated scenes, same as a scene save does.
      try {
        app.widgetRuntime.reload(collectInstances(db))
      } catch (err) {
        app.log.error({ err }, 'widget runtime reload after weather default change failed')
      }
    }
    app.broker.publish({ type: 'system:updated' })
    return { ...merged, googleConfigured: deps.googleConfigured }
  })
}
