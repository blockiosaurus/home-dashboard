import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { loadSystem } from '../system/store'

export const registerWidgetsListRoute = (app: FastifyInstance, db: Database.Database) => {
  app.get('/api/widgets', async () => {
    const { weatherDefault } = loadSystem(db)
    const widgets = app.widgetRegistry.list().map((w) => {
      const defaultConfig = (w.defaultConfig ?? {}) as Record<string, unknown>
      // Weather keeps a location-free default in its own package; the family's
      // saved location lives in the system record, so a widget added from the
      // palette picks it up here and works without any further configuration.
      const config =
        w.id === 'weather' && weatherDefault
          ? {
              ...defaultConfig,
              lat: weatherDefault.lat,
              lon: weatherDefault.lon,
              unit: weatherDefault.unit,
              ...(weatherDefault.label !== undefined ? { label: weatherDefault.label } : {}),
            }
          : defaultConfig
      return {
        id: w.id,
        name: w.name,
        description: w.description ?? '',
        defaultSize: w.defaultSize,
        minSize: w.minSize,
        defaultConfig: config,
      }
    })
    return { widgets }
  })
}
