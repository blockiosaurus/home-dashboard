import type Database from 'better-sqlite3'
import { z } from 'zod'

export const SystemSchema = z.object({
  firstRunComplete: z.boolean().default(false),
  manualScene: z.string().nullable().default(null),
  weatherDefault: z
    .object({
      lat: z.number(),
      lon: z.number(),
      unit: z.enum(['celsius', 'fahrenheit']),
      label: z.string().optional(),
    })
    .nullable()
    .default(null),
  photosAlbumId: z.string().nullable().default(null),
})

export type System = z.infer<typeof SystemSchema>
export type WeatherDefault = NonNullable<System['weatherDefault']>

/** The system record is a JSON blob in `kv` under key `system`. Both the
 * settings route and the widget plumbing need to read it, so the query lives
 * here rather than being duplicated per caller. */
export const loadSystem = (db: Database.Database): System => {
  const row = db.prepare("SELECT value FROM kv WHERE key='system'").get() as
    | { value: string }
    | undefined
  if (!row) return SystemSchema.parse({})
  return SystemSchema.parse(JSON.parse(row.value))
}

export const saveSystem = (db: Database.Database, next: System) => {
  db.prepare(
    `INSERT INTO kv (key, value) VALUES ('system', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(JSON.stringify(next))
}
