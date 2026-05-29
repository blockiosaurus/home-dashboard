import type { FastifyInstance } from 'fastify'

export const registerWidgetsListRoute = (app: FastifyInstance) => {
  app.get('/api/widgets', async () => {
    const widgets = app.widgetRegistry.list().map((w) => ({
      id: w.id,
      name: w.name,
      defaultSize: w.defaultSize,
      minSize: w.minSize,
    }))
    return { widgets }
  })
}
