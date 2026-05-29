import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  email: text('email').notNull(),
  refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
  scopes: text('scopes').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export const calendars = sqliteTable('calendars', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  googleCalendarId: text('google_calendar_id').notNull(),
  summary: text('summary').notNull(),
  colorOverride: text('color_override'),
  visible: integer('visible', { mode: 'boolean' }).notNull().default(true),
  syncToken: text('sync_token'),
})

export const people = sqliteTable('people', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  avatarUrl: text('avatar_url'),
  primaryCalendarId: text('primary_calendar_id'),
})

export const eventsCache = sqliteTable('events_cache', {
  id: text('id').primaryKey(),
  calendarId: text('calendar_id').notNull(),
  googleEventId: text('google_event_id').notNull(),
  etag: text('etag').notNull(),
  start: integer('start', { mode: 'timestamp_ms' }).notNull(),
  end: integer('end', { mode: 'timestamp_ms' }).notNull(),
  allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
  title: text('title').notNull(),
  location: text('location'),
  description: text('description'),
  color: text('color'),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }).notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
})

export const eventsOutbox = sqliteTable('events_outbox', {
  id: text('id').primaryKey(),
  op: text('op', { enum: ['create', 'update', 'delete'] }).notNull(),
  payloadJson: text('payload_json').notNull(),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp_ms' }).notNull(),
})

export const scenes = sqliteTable('scenes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  layoutJson: text('layout_json').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const sceneSchedule = sqliteTable('scene_schedule', {
  id: text('id').primaryKey(),
  sceneId: text('scene_id').notNull(),
  cronExpr: text('cron_expr').notNull(),
  priority: integer('priority').notNull().default(0),
})

export const widgetConfigs = sqliteTable('widget_configs', {
  id: text('id').primaryKey(),
  sceneId: text('scene_id').notNull(),
  widgetId: text('widget_id').notNull(),
  instanceId: text('instance_id').notNull(),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  w: integer('w').notNull(),
  h: integer('h').notNull(),
  configJson: text('config_json').notNull(),
})

export const kv = sqliteTable('kv', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})
