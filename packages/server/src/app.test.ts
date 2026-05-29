import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'app-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('app', () => {
  it('GET /api/health returns ok', async () => {
    const app = await buildApp({ dataDir: dir })
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    await app.close()
  })
})
