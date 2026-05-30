import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import staticPlugin from '@fastify/static'
import type { FastifyInstance } from 'fastify'

const here = dirname(fileURLToPath(import.meta.url))

const resolveDistRoot = (pkg: 'dashboard' | 'admin'): string | null => {
  // Server runs from packages/server/dist; the sibling SPA dist sits at packages/<pkg>/dist.
  const candidate = join(here, '..', '..', pkg, 'dist')
  return existsSync(candidate) ? candidate : null
}

export interface StaticOptions {
  /** Absolute or process-cwd-relative path to a folder of family photos. */
  localPhotosDir?: string
}

export const registerStatic = async (app: FastifyInstance, opts: StaticOptions = {}) => {
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

  if (opts.localPhotosDir) {
    const photosRoot = isAbsolute(opts.localPhotosDir)
      ? opts.localPhotosDir
      : resolve(process.cwd(), opts.localPhotosDir)
    // Create the dir so the static plugin doesn't refuse to load when it's
    // missing. Users drop photos into this folder.
    mkdirSync(photosRoot, { recursive: true })
    await app.register(staticPlugin, {
      root: photosRoot,
      prefix: '/photos/',
      decorateReply: false,
      // Long cache: families add photos slowly. Cache busts naturally when
      // filenames change.
      maxAge: 86_400_000,
    })
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
