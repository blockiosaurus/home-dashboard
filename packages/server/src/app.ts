import Fastify from 'fastify'

export interface AppOptions {
  dataDir: string
}

export const buildApp = async (_opts: AppOptions) => {
  const app = Fastify({ logger: { transport: { target: 'pino-pretty' } } })

  app.get('/api/health', async () => ({ status: 'ok' }))

  return app
}
