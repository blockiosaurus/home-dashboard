import type Database from 'better-sqlite3'

const sleepCells = [
  {
    instanceId: 'clock-sleep',
    widgetId: 'clock',
    x: 0,
    y: 0,
    w: 8,
    h: 2,
    config: { format: '12h' },
  },
  {
    instanceId: 'agenda-sleep',
    widgetId: 'agenda',
    x: 0,
    y: 2,
    w: 8,
    h: 3,
    config: { daysAhead: 1, title: 'Up next' },
  },
  {
    instanceId: 'photos-sleep',
    widgetId: 'slideshow',
    x: 0,
    y: 5,
    w: 8,
    h: 7,
    config: { albumId: 'placeholder' },
  },
]

export const seedDefaultScene = (db: Database.Database) => {
  const existing = db.prepare('SELECT id FROM scenes WHERE is_default = 1').get()
  if (existing) return
  const now = Date.now()
  const activeCells = [
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
  const insert = db.prepare(
    `INSERT INTO scenes (id, name, layout_json, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  insert.run('default', 'Active', JSON.stringify(activeCells), 1, now, now)
  insert.run('sleep', 'Sleep', JSON.stringify(sleepCells), 0, now, now)

  const rule = db.prepare(
    'INSERT INTO scene_schedule (id, scene_id, cron_expr, priority) VALUES (?, ?, ?, ?)',
  )
  rule.run('sleep-22', 'sleep', '0 22 * * *', 10)
  rule.run('wake-07', 'default', '0 7 * * *', 10)
}
