import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServerMessage } from '@dashboard/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../db'
import { applyWeatherDefault } from './apply-weather-default'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'apply-weather-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const insertScene = (
  db: ReturnType<typeof openDatabase>['db']['raw'],
  id: string,
  cells: Array<{ instanceId: string; widgetId: string; config: unknown }>,
) => {
  const now = Date.now()
  db.prepare(
    `INSERT INTO scenes (id, name, layout_json, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, id, JSON.stringify(cells), 0, now, now)
}

describe('applyWeatherDefault', () => {
  it('updates weather cells across scenes, leaves other widgets untouched, and publishes per changed scene', () => {
    const { db, close } = openDatabase(dir)
    insertScene(db.raw, 'scene-a', [
      {
        instanceId: 'weather-1',
        widgetId: 'weather',
        config: { lat: 40.7128, lon: -74.006, unit: 'fahrenheit', label: 'NYC', extra: 'keep-me' },
      },
      { instanceId: 'clock-1', widgetId: 'clock', config: { format: '12h' } },
    ])
    insertScene(db.raw, 'scene-b', [
      {
        instanceId: 'weather-2',
        widgetId: 'weather',
        config: { lat: 0, lon: 0, unit: 'celsius', label: 'Old' },
      },
    ])

    const published: ServerMessage[] = []
    const broker = { publish: (m: ServerMessage) => published.push(m) }

    applyWeatherDefault(db.raw, broker, {
      lat: 51.5074,
      lon: -0.1278,
      unit: 'celsius',
      label: 'London, England',
    })

    const rows = db.raw.prepare('SELECT id, layout_json FROM scenes ORDER BY id').all() as Array<{
      id: string
      layout_json: string
    }>

    const sceneA = JSON.parse(rows.find((r) => r.id === 'scene-a')?.layout_json ?? '[]')
    const weatherCellA = sceneA.find((c: { widgetId: string }) => c.widgetId === 'weather')
    expect(weatherCellA.config).toEqual({
      lat: 51.5074,
      lon: -0.1278,
      unit: 'celsius',
      label: 'London, England',
      extra: 'keep-me',
    })
    const clockCell = sceneA.find((c: { widgetId: string }) => c.widgetId === 'clock')
    expect(clockCell.config).toEqual({ format: '12h' })

    const sceneB = JSON.parse(rows.find((r) => r.id === 'scene-b')?.layout_json ?? '[]')
    expect(sceneB[0].config).toEqual({
      lat: 51.5074,
      lon: -0.1278,
      unit: 'celsius',
      label: 'London, England',
    })

    expect(published).toHaveLength(2)
    expect(published).toEqual(
      expect.arrayContaining([
        { type: 'scene:updated', sceneId: 'scene-a' },
        { type: 'scene:updated', sceneId: 'scene-b' },
      ]),
    )

    close()
  })

  it('is a no-op (no writes, no publish) for scenes with no weather cells', () => {
    const { db, close } = openDatabase(dir)
    insertScene(db.raw, 'scene-no-weather', [
      { instanceId: 'clock-1', widgetId: 'clock', config: { format: '12h' } },
    ])

    const publish = vi.fn()
    const before = db.raw
      .prepare('SELECT updated_at FROM scenes WHERE id = ?')
      .get('scene-no-weather') as {
      updated_at: number
    }

    applyWeatherDefault(
      db.raw,
      { publish },
      { lat: 1, lon: 2, unit: 'celsius', label: 'Somewhere' },
    )

    const after = db.raw
      .prepare('SELECT updated_at, layout_json FROM scenes WHERE id = ?')
      .get('scene-no-weather') as { updated_at: number; layout_json: string }

    expect(after.updated_at).toBe(before.updated_at)
    expect(JSON.parse(after.layout_json)).toEqual([
      { instanceId: 'clock-1', widgetId: 'clock', config: { format: '12h' } },
    ])
    expect(publish).not.toHaveBeenCalled()

    close()
  })
})
