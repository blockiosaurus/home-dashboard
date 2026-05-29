import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './index'
import { seedDefaultScene } from './seed'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'seed-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('seedDefaultScene', () => {
  it('inserts a default Active scene with a clock cell on a fresh db', () => {
    const { db, close } = openDatabase(dir)
    seedDefaultScene(db.raw)
    const rows = db.all<{ name: string; layout_json: string; is_default: number }>(
      'SELECT name, layout_json, is_default FROM scenes',
    )
    expect(rows).toHaveLength(2)
    const activeRow = rows.find((r) => r.name === 'Active')
    if (!activeRow) throw new Error('expected Active row')
    expect(JSON.parse(activeRow.layout_json)).toEqual([
      expect.objectContaining({ widgetId: 'clock' }),
      expect.objectContaining({ widgetId: 'weather' }),
      expect.objectContaining({ widgetId: 'agenda' }),
      expect.objectContaining({ widgetId: 'calendar' }),
      expect.objectContaining({ widgetId: 'slideshow' }),
      expect.objectContaining({ widgetId: 'chores' }),
      expect.objectContaining({ widgetId: 'meal-plan' }),
      expect.objectContaining({ widgetId: 'notes' }),
      expect.objectContaining({ widgetId: 'packages' }),
    ])
    close()
  })

  it('is idempotent', () => {
    const { db, close } = openDatabase(dir)
    seedDefaultScene(db.raw)
    seedDefaultScene(db.raw)
    const count = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM scenes')
    expect(count?.n).toBe(2)
    close()
  })

  it('also seeds a Sleep scene with a schedule rule', () => {
    const { db, close } = openDatabase(dir)
    seedDefaultScene(db.raw)
    const sceneNames = (db.all<{ name: string }>('SELECT name FROM scenes')).map((r) => r.name)
    expect(sceneNames).toEqual(expect.arrayContaining(['Active', 'Sleep']))
    const rules = db.all<{ scene_id: string; cron_expr: string }>(
      'SELECT scene_id, cron_expr FROM scene_schedule',
    )
    expect(rules).toHaveLength(2)
    const sleepRule = rules.find((r) => r.scene_id === 'sleep')
    const wakeRule = rules.find((r) => r.scene_id === 'default')
    expect(sleepRule?.cron_expr).toBe('0 22 * * *')
    expect(wakeRule?.cron_expr).toBe('0 7 * * *')
    close()
  })
})
