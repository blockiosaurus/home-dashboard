import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'system-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('system routes', () => {
  it('GET returns defaults', async () => {
    const app = await buildApp({ dataDir: dir })
    const res = await app.inject({ method: 'GET', url: '/api/system' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ firstRunComplete: false })
    await app.close()
  })

  it('PUT updates partial fields', async () => {
    const app = await buildApp({ dataDir: dir })
    await app.inject({
      method: 'PUT',
      url: '/api/system',
      payload: { firstRunComplete: true, manualScene: 'sleep' },
    })
    const res = await app.inject({ method: 'GET', url: '/api/system' })
    expect(res.json()).toMatchObject({ firstRunComplete: true, manualScene: 'sleep' })
    await app.close()
  })
})
