import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

const SystemSchema = z.object({
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

type System = z.infer<typeof SystemSchema>

const loadSystem = (db: Database.Database): System => {
  const row = db.prepare("SELECT value FROM kv WHERE key='system'").get() as
    | { value: string }
    | undefined
  if (!row) return SystemSchema.parse({})
  return SystemSchema.parse(JSON.parse(row.value))
}

const saveSystem = (db: Database.Database, next: System) => {
  db.prepare(
    `INSERT INTO kv (key, value) VALUES ('system', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(JSON.stringify(next))
}

export const registerSystemRoutes = (app: FastifyInstance, db: Database.Database) => {
  app.get('/api/system', async () => loadSystem(db))

  app.put('/api/system', async (req) => {
    const current = loadSystem(db)
    const merged = SystemSchema.parse({ ...current, ...(req.body as Record<string, unknown>) })
    saveSystem(db, merged)
    return merged
  })
}
