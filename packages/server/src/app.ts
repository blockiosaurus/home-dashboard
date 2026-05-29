import { ClientMessageSchema, type ServerMessage } from '@dashboard/core'
import websocket from '@fastify/websocket'
import Fastify from 'fastify'
import { createBroker } from './ws/broker'

export interface AppOptions {
  dataDir: string
}

export const buildApp = async (_opts: AppOptions) => {
  const app = Fastify({ logger: { transport: { target: 'pino-pretty' } } })
  const broker = createBroker()

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
  return app
}

declare module 'fastify' {
  interface FastifyInstance {
    broker: ReturnType<typeof createBroker>
  }
}
