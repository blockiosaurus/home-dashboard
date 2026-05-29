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
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('Active')
    const firstRow = rows[0]
    if (!firstRow) throw new Error('expected one row')
    expect(JSON.parse(firstRow.layout_json)).toEqual([
      expect.objectContaining({ widgetId: 'clock' }),
      expect.objectContaining({ widgetId: 'weather' }),
      expect.objectContaining({ widgetId: 'calendar' }),
    ])
    close()
  })

  it('is idempotent', () => {
    const { db, close } = openDatabase(dir)
    seedDefaultScene(db.raw)
    seedDefaultScene(db.raw)
    const count = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM scenes')
    expect(count?.n).toBe(1)
    close()
  })
})
