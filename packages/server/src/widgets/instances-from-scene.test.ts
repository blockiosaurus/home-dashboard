import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import { collectInstances, instancesFromScene } from './instances-from-scene'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'collect-instances-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

type RawDb = ReturnType<typeof openDatabase>['db']['raw']

const insertScene = (
  db: RawDb,
  id: string,
  cells: Array<{ instanceId: string; widgetId: string; config: unknown }>,
) => {
  const now = Date.now()
  db.prepare(
    `INSERT INTO scenes (id, name, layout_json, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, id, JSON.stringify(cells), 0, now, now)
}

const setWeatherDefault = (db: RawDb, weatherDefault: unknown) => {
  db.prepare(
    `INSERT INTO kv (key, value) VALUES ('system', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(JSON.stringify({ weatherDefault }))
}

describe('instancesFromScene', () => {
  it('extracts widget instances from a scene cells array', () => {
    const cells = [
      { instanceId: 'a', widgetId: 'weather', x: 0, y: 0, w: 4, h: 2, config: { lat: 1, lon: 2 } },
      { instanceId: 'b', widgetId: 'agenda', x: 4, y: 0, w: 4, h: 2, config: {} },
    ]
    const out = instancesFromScene(cells)
    expect(out).toEqual([
      { instanceId: 'a', widgetId: 'weather', config: { lat: 1, lon: 2 } },
      { instanceId: 'b', widgetId: 'agenda', config: {} },
    ])
  })
})

describe('collectInstances', () => {
  it('collects instances from every scene, de-duplicated by instanceId', () => {
    const { db, close } = openDatabase(dir)
    insertScene(db.raw, 'scene-a', [
      { instanceId: 'clock-1', widgetId: 'clock', config: { format: '12h' } },
      { instanceId: 'photos-1', widgetId: 'slideshow', config: { source: 'local' } },
    ])
    insertScene(db.raw, 'scene-b', [
      // Same instance in a second scene must not produce a second set of timers.
      { instanceId: 'clock-1', widgetId: 'clock', config: { format: '12h' } },
      { instanceId: 'photos-sleep', widgetId: 'slideshow', config: { source: 'local' } },
    ])

    const out = collectInstances(db.raw)

    expect(out.map((i) => i.instanceId)).toEqual(['clock-1', 'photos-1', 'photos-sleep'])
    close()
  })

  it('fills weather instances that have no coordinates from the saved default', () => {
    const { db, close } = openDatabase(dir)
    setWeatherDefault(db.raw, { lat: 47.6, lon: -122.33, unit: 'celsius', label: 'Seattle' })
    insertScene(db.raw, 'scene-a', [
      { instanceId: 'w-new', widgetId: 'weather', config: { unit: 'fahrenheit' } },
      {
        instanceId: 'w-pinned',
        widgetId: 'weather',
        config: { lat: 40.7128, lon: -74.006, unit: 'fahrenheit', label: 'NYC' },
      },
    ])

    const byId = new Map(collectInstances(db.raw).map((i) => [i.instanceId, i.config]))

    // Location comes from the default; the instance's own unit still wins.
    expect(byId.get('w-new')).toEqual({
      lat: 47.6,
      lon: -122.33,
      unit: 'fahrenheit',
      label: 'Seattle',
    })
    // An instance with its own coordinates is left exactly as configured.
    expect(byId.get('w-pinned')).toEqual({
      lat: 40.7128,
      lon: -74.006,
      unit: 'fahrenheit',
      label: 'NYC',
    })
    close()
  })

  it('leaves weather instances without coordinates alone when no default is saved', () => {
    const { db, close } = openDatabase(dir)
    insertScene(db.raw, 'scene-a', [
      { instanceId: 'w-new', widgetId: 'weather', config: { unit: 'fahrenheit' } },
    ])

    expect(collectInstances(db.raw)[0]?.config).toEqual({ unit: 'fahrenheit' })
    close()
  })
})
