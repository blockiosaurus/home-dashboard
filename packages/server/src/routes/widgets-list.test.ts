import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'widgets-list-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('widgets list route', () => {
  it('GET /api/widgets returns registered widget metadata', async () => {
    const app = await buildApp({ dataDir: dir })
    const res = await app.inject({ method: 'GET', url: '/api/widgets' })
    expect(res.statusCode).toBe(200)
    const json = res.json() as { widgets: Array<{ id: string; name: string }> }
    const ids = json.widgets.map((w) => w.id)
    expect(ids).toContain('weather')
    expect(ids).toContain('slideshow')
    await app.close()
  })
})
