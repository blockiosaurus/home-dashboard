import { existsSync } from 'node:fs'
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
}
