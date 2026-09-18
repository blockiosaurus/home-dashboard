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

interface WidgetRow {
  id: string
  name: string
  description: string
  defaultSize: { w: number; h: number }
  minSize: { w: number; h: number }
  defaultConfig: Record<string, unknown>
}

const listWidgets = async (app: Awaited<ReturnType<typeof buildApp>>) => {
  const res = await app.inject({ method: 'GET', url: '/api/widgets' })
  expect(res.statusCode).toBe(200)
  return (res.json() as { widgets: WidgetRow[] }).widgets
}

describe('widgets list route', () => {
  it('GET /api/widgets returns every registered widget with a description and default config', async () => {
    const app = await buildApp({ dataDir: dir })
    const widgets = await listWidgets(app)

    expect(widgets).toHaveLength(9)
    expect(widgets.map((w) => w.id).sort()).toEqual([
      'agenda',
      'calendar',
      'chores',
      'clock',
      'meal-plan',
      'notes',
      'packages',
      'slideshow',
      'weather',
    ])
    for (const w of widgets) {
      expect(w.description).not.toBe('')
      expect(w.defaultSize).toEqual(expect.objectContaining({ w: expect.any(Number) }))
    }
    expect(widgets.find((w) => w.id === 'clock')?.defaultConfig).toEqual({ format: '12h' })
    expect(widgets.find((w) => w.id === 'slideshow')?.defaultConfig).toEqual({
      source: 'local',
      intervalMs: 8000,
      shuffle: true,
    })
    // Stateful widgets no longer carry instanceId in their config.
    expect(widgets.find((w) => w.id === 'chores')?.defaultConfig).toEqual({ title: 'Chores' })
    await app.close()
  })

  it('leaves weather without a location when no default is saved', async () => {
    const app = await buildApp({ dataDir: dir })
    const widgets = await listWidgets(app)
    expect(widgets.find((w) => w.id === 'weather')?.defaultConfig).toEqual({ unit: 'fahrenheit' })
    await app.close()
  })

  it('merges the saved weather default into the weather widget config', async () => {
    const app = await buildApp({ dataDir: dir })
    const put = await app.inject({
      method: 'PUT',
      url: '/api/system',
      payload: { weatherDefault: { lat: 47.6, lon: -122.33, unit: 'celsius', label: 'Seattle' } },
    })
    expect(put.statusCode).toBe(200)

    const widgets = await listWidgets(app)
    expect(widgets.find((w) => w.id === 'weather')?.defaultConfig).toEqual({
      lat: 47.6,
      lon: -122.33,
      unit: 'celsius',
      label: 'Seattle',
    })
    // Other widgets are unaffected by the weather default.
    expect(widgets.find((w) => w.id === 'notes')?.defaultConfig).toEqual({ title: 'Notes' })
    await app.close()
  })
})
