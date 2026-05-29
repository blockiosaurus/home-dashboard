import type Database from 'better-sqlite3'

export const seedDefaultScene = (db: Database.Database) => {
  const existing = db.prepare('SELECT id FROM scenes WHERE is_default = 1').get()
  if (existing) return
  const now = Date.now()
  const cells = [
    { instanceId: 'clock-1', widgetId: 'clock', x: 0, y: 0, w: 8, h: 1, config: {} },
    {
      instanceId: 'weather-1',
      widgetId: 'weather',
      x: 5,
      y: 1,
      w: 3,
      h: 2,
      config: { lat: 40.7128, lon: -74.006, unit: 'fahrenheit', label: 'NYC' },
    },
    {
      instanceId: 'agenda-1',
      widgetId: 'agenda',
      x: 0,
      y: 1,
      w: 5,
      h: 2,
      config: { daysAhead: 1 },
    },
    {
      instanceId: 'cal-1',
      widgetId: 'calendar',
      x: 0,
      y: 3,
      w: 8,
      h: 4,
      config: { view: 'week' },
    },
    {
      instanceId: 'photos-1',
      widgetId: 'slideshow',
      x: 5,
      y: 7,
      w: 3,
      h: 5,
      config: { albumId: 'placeholder' },
    },
    {
      instanceId: 'chores-1',
      widgetId: 'chores',
      x: 0,
      y: 7,
      w: 3,
      h: 3,
      config: { instanceId: 'chores-1', title: 'Chores', initial: [] },
    },
    {
      instanceId: 'meal-1',
      widgetId: 'meal-plan',
      x: 3,
      y: 7,
      w: 2,
      h: 3,
      config: { instanceId: 'meal-1', title: 'Meals' },
    },
    {
      instanceId: 'notes-1',
      widgetId: 'notes',
      x: 0,
      y: 10,
      w: 5,
      h: 2,
      config: { instanceId: 'notes-1', title: 'Notes' },
    },
    {
      instanceId: 'packages-1',
      widgetId: 'packages',
      x: 5,
      y: 10,
      w: 3,
      h: 2,
      config: { instanceId: 'packages-1', title: 'Packages' },
    },
  ]
  db.prepare(
    `INSERT INTO scenes (id, name, layout_json, is_default, created_at, updated_at)
     VALUES ('default', 'Active', ?, 1, ?, ?)`,
  ).run(JSON.stringify(cells), now, now)
}
