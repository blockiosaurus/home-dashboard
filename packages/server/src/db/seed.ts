import type Database from 'better-sqlite3'

export const seedDefaultScene = (db: Database.Database) => {
  const existing = db.prepare('SELECT id FROM scenes WHERE is_default = 1').get()
  if (existing) return
  const now = Date.now()
  const cells = [
    { instanceId: 'clock-1', widgetId: 'clock', x: 0, y: 0, w: 8, h: 1, config: {} },
    {
      instanceId: 'cal-1',
      widgetId: 'calendar',
      x: 0,
      y: 1,
      w: 8,
      h: 6,
      config: { view: 'week' },
    },
  ]
  db.prepare(
    `INSERT INTO scenes (id, name, layout_json, is_default, created_at, updated_at)
     VALUES ('default', 'Active', ?, 1, ?, ?)`,
  ).run(JSON.stringify(cells), now, now)
}
