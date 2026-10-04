import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../app'
import { ExtractError } from '../ingest/extract'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ingest-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const upload = {
  files: [{ name: 'flyer.png', mediaType: 'image/png', data: 'aGVsbG8=' }],
  today: '2026-10-04',
  timezone: 'America/Chicago',
}

describe('ingest routes', () => {
  it('returns 503 and reports unconfigured when no API key is set', async () => {
    const app = await buildApp({ dataDir: dir })
    const res = await app.inject({ method: 'POST', url: '/api/ingest/extract', payload: upload })
    expect(res.statusCode).toBe(503)
    const sys = await app.inject({ method: 'GET', url: '/api/system' })
    expect(sys.json()).toMatchObject({ aiImportConfigured: false })
    await app.close()
  })

  it('passes files to the extractor and returns its proposals without writing events', async () => {
    const extract = vi.fn().mockResolvedValue({ events: [], notes: 'nothing dated' })
    const app = await buildApp({ dataDir: dir, extractEvents: extract })
    const res = await app.inject({ method: 'POST', url: '/api/ingest/extract', payload: upload })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ events: [], notes: 'nothing dated' })
    expect(extract).toHaveBeenCalledWith(upload.files, {
      today: '2026-10-04',
      timezone: 'America/Chicago',
    })
    const cache = app.db.prepare('SELECT COUNT(*) AS n FROM events_cache').get() as { n: number }
    expect(cache.n).toBe(0)
    const sys = await app.inject({ method: 'GET', url: '/api/system' })
    expect(sys.json()).toMatchObject({ aiImportConfigured: true })
    await app.close()
  })

  it('rejects unsupported file types', async () => {
    const extract = vi.fn()
    const app = await buildApp({ dataDir: dir, extractEvents: extract })
    const res = await app.inject({
      method: 'POST',
      url: '/api/ingest/extract',
      payload: { ...upload, files: [{ name: 'a.heic', mediaType: 'image/heic', data: 'eA==' }] },
    })
    expect(res.statusCode).toBe(400)
    expect(extract).not.toHaveBeenCalled()
    await app.close()
  })

  it('maps extractor errors to 422 with a readable message', async () => {
    const extract = vi
      .fn()
      .mockRejectedValue(new ExtractError('Claude declined to read these files.'))
    const app = await buildApp({ dataDir: dir, extractEvents: extract })
    const res = await app.inject({ method: 'POST', url: '/api/ingest/extract', payload: upload })
    expect(res.statusCode).toBe(422)
    expect(res.json()).toEqual({ error: 'Claude declined to read these files.' })
    await app.close()
  })
})
