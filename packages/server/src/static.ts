import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import staticPlugin from '@fastify/static'
import type { FastifyInstance } from 'fastify'

const here = dirname(fileURLToPath(import.meta.url))

const resolveDistRoot = (pkg: 'dashboard' | 'admin'): string | null => {
  // Server runs from packages/server/dist; the sibling SPA dist sits at packages/<pkg>/dist.
  const candidate = join(here, '..', '..', pkg, 'dist')
  return existsSync(candidate) ? candidate : null
}

export const registerStatic = async (app: FastifyInstance) => {
  const dashboard = resolveDistRoot('dashboard')
  if (dashboard) {
    await app.register(staticPlugin, { root: dashboard, prefix: '/', decorateReply: false })
  }
  const admin = resolveDistRoot('admin')
  if (admin) {
    await app.register(staticPlugin, {
      root: admin,
      prefix: '/admin/',
      decorateReply: false,
    })
    app.get('/admin', async (_, reply) => reply.redirect('/admin/'))
  }

  app.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith('/admin/')) {
      if (admin) {
        const html = readFileSync(join(admin, 'index.html'), 'utf8')
        return reply.type('text/html').send(html)
      }
    }
    reply.code(404)
    return { error: 'not found' }
  })
}
