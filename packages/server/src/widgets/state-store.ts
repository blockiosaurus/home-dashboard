import type Database from 'better-sqlite3'

export interface StateRecord {
  instanceId: string
  widgetId: string
  version: number
  data: unknown
  updatedAt: number
}

export interface StateStore {
  get: (instanceId: string) => StateRecord | null
  put: (
    instanceId: string,
    widgetId: string,
    data: unknown,
    expectedVersion: number | null,
  ) => StateRecord
}

export const createStateStore = (db: Database.Database): StateStore => {
  const selectStmt = db.prepare(
    'SELECT instance_id, widget_id, version, data, updated_at FROM widget_state WHERE instance_id = ?',
  )
  const insertStmt = db.prepare(`
    INSERT INTO widget_state (instance_id, widget_id, version, data, updated_at)
    VALUES (@instanceId, @widgetId, 1, @data, @now)
  `)
  const updateStmt = db.prepare(`
    UPDATE widget_state
    SET version = version + 1, data = @data, updated_at = @now
    WHERE instance_id = @instanceId AND version = @expectedVersion
  `)

  const map = (row: {
    instance_id: string
    widget_id: string
    version: number
    data: string
    updated_at: number
  }): StateRecord => ({
    instanceId: row.instance_id,
    widgetId: row.widget_id,
    version: row.version,
    data: JSON.parse(row.data),
    updatedAt: row.updated_at,
  })

  return {
    get: (instanceId) => {
      const row = selectStmt.get(instanceId) as Parameters<typeof map>[0] | undefined
      return row ? map(row) : null
    },
    put: (instanceId, widgetId, data, expectedVersion) => {
      const now = Date.now()
      const payload = JSON.stringify(data)
      if (expectedVersion === null) {
        try {
          insertStmt.run({ instanceId, widgetId, data: payload, now })
        } catch (err) {
          if (String(err).includes('UNIQUE')) throw new Error('conflict: row exists')
          throw err
        }
      } else {
        const result = updateStmt.run({ instanceId, data: payload, now, expectedVersion })
        if (result.changes === 0) throw new Error('conflict: version mismatch')
      }
      const row = selectStmt.get(instanceId) as Parameters<typeof map>[0]
      return map(row)
    },
  }
}
