# Widget Pack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7 first-party widgets (Weather, Agenda, Slideshow, Chores, Meal Plan, Notes, Packages) on top of the foundation shipped in v0.1.0-mvp. End state: a full default scene that exercises every widget kind — read-only externals (weather, photos) and stateful local widgets (chores, meals, notes, packages).

**Architecture:** Each widget is a TypeScript package under `packages/widgets/<name>/` following the contract defined in `@dashboard/core`. Widgets that need server-side polling (Weather, Slideshow) provide a `backend` runner that posts data to clients over the WebSocket broker. Widgets that carry **local state** (Chores, Meal Plan, Notes, Packages) read/write through a new shared `widget_state` REST endpoint backed by a `widget_state` SQLite table. Agenda is pure render — it reuses `events_cache`. The dashboard `widgets.ts` registers each loader; the server-side widget runner picks up the backends.

**Tech Stack:** TypeScript, React 19, Vite, Tailwind v4, Open-Meteo (no key), Google Photos Library API (existing OAuth scope already requested in Plan 1), Drizzle ORM, Zod, Vitest.

---

## File Plan

New widget packages (`package.json`, `tsconfig.json`, `src/index.ts`, `src/view.tsx`, optional `src/backend.ts`):

- `packages/widgets/weather/`
- `packages/widgets/agenda/`
- `packages/widgets/slideshow/`
- `packages/widgets/chores/`
- `packages/widgets/meal-plan/`
- `packages/widgets/notes/`
- `packages/widgets/packages/`

New server-side modules:

- `packages/server/src/widgets/state-store.ts` — generic per-instance state with optimistic concurrency (version)
- `packages/server/src/routes/widget-state.ts` — REST `GET/PUT /api/widgets/:instanceId/state`
- `packages/server/src/widgets/runtime.ts` — boot the backend cron runner for widgets that declare one
- `packages/server/src/sync/google-photos.ts` — minimal Photos Library API client
- `packages/server/src/db/schema.ts` — add `widget_state` table
- `packages/server/drizzle/0001_widget_state.sql` — generated migration

Modified server files:

- `packages/server/src/app.ts` — register new routes + boot widget runtime
- `packages/server/src/db/seed.ts` — extended default scene with all 7 new widgets

Modified dashboard files:

- `packages/dashboard/package.json` — add 7 new widget workspace deps
- `packages/dashboard/src/widgets.ts` — register 7 new loaders
- `packages/dashboard/src/hooks/use-widget-state.ts` — shared TanStack Query hook for the state endpoint

---

## Phase 0: Widget State Plumbing

### Task 1: Add `widget_state` table to schema and migration

**Files:**

- Modify: `packages/server/src/db/schema.ts`
- Create: `packages/server/drizzle/0001_widget_state.sql` (generated)

- [ ] **Step 1: Add table to schema**

Edit `packages/server/src/db/schema.ts` — append after the existing tables:

```ts
export const widgetState = sqliteTable('widget_state', {
  instanceId: text('instance_id').primaryKey(),
  widgetId: text('widget_id').notNull(),
  version: integer('version').notNull().default(0),
  data: text('data').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})
```

- [ ] **Step 2: Generate migration**

```bash
cd packages/server
pnpm exec drizzle-kit generate --name=widget_state
cd ../..
```

Expected: `packages/server/drizzle/0001_widget_state.sql` created.

- [ ] **Step 3: Verify migration runs**

```bash
pnpm --filter @dashboard/server test
```

Expected: all 36 tests pass (the `openDatabase` test exercises the migrator).

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/db/schema.ts packages/server/drizzle
git commit -m "feat(server): widget_state table for stateful widgets"
```

### Task 2: Widget state store

**Files:**

- Create: `packages/server/src/widgets/state-store.ts`
- Create: `packages/server/src/widgets/state-store.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import { createStateStore } from './state-store'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'state-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('state-store', () => {
  it('returns null for missing instance', () => {
    const { db, close } = openDatabase(dir)
    const store = createStateStore(db.raw)
    expect(store.get('absent')).toBeNull()
    close()
  })

  it('put creates then increments version', () => {
    const { db, close } = openDatabase(dir)
    const store = createStateStore(db.raw)
    const a = store.put('i1', 'chores', { items: [] }, null)
    expect(a.version).toBe(1)
    const b = store.put('i1', 'chores', { items: ['a'] }, 1)
    expect(b.version).toBe(2)
    expect(store.get('i1')?.data).toEqual({ items: ['a'] })
    close()
  })

  it('rejects stale put', () => {
    const { db, close } = openDatabase(dir)
    const store = createStateStore(db.raw)
    store.put('i1', 'chores', { v: 0 }, null)
    expect(() => store.put('i1', 'chores', { v: 1 }, 0)).toThrow(/conflict/)
    close()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @dashboard/server test -- src/widgets/state-store.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
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
```

- [ ] **Step 4: Re-run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): widget state store with optimistic versioning"
```

### Task 3: Widget state REST routes

**Files:**

- Create: `packages/server/src/routes/widget-state.ts`
- Create: `packages/server/src/routes/widget-state.test.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Write failing test**

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ws-routes-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('widget state routes', () => {
  it('GET returns 404 when absent', async () => {
    const app = await buildApp({ dataDir: dir })
    const res = await app.inject({ method: 'GET', url: '/api/widgets/x/state' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('PUT creates then GET returns it', async () => {
    const app = await buildApp({ dataDir: dir })
    const put = await app.inject({
      method: 'PUT',
      url: '/api/widgets/x/state',
      payload: { widgetId: 'chores', data: { items: ['dishes'] } },
    })
    expect(put.statusCode).toBe(200)
    expect(put.json()).toMatchObject({ version: 1 })
    const get = await app.inject({ method: 'GET', url: '/api/widgets/x/state' })
    expect(get.statusCode).toBe(200)
    expect(get.json()).toMatchObject({
      instanceId: 'x',
      widgetId: 'chores',
      version: 1,
      data: { items: ['dishes'] },
    })
    await app.close()
  })

  it('PUT with stale version returns 409', async () => {
    const app = await buildApp({ dataDir: dir })
    await app.inject({
      method: 'PUT',
      url: '/api/widgets/x/state',
      payload: { widgetId: 'chores', data: {} },
    })
    const stale = await app.inject({
      method: 'PUT',
      url: '/api/widgets/x/state',
      payload: { widgetId: 'chores', data: {}, expectedVersion: 0 },
    })
    expect(stale.statusCode).toBe(409)
    await app.close()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL (404 with no /api/widgets route registered).

- [ ] **Step 3: Implement `routes/widget-state.ts`**

```ts
import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createStateStore } from '../widgets/state-store'

const Body = z.object({
  widgetId: z.string().min(1),
  data: z.unknown(),
  expectedVersion: z.number().int().nonnegative().optional(),
})

export const registerWidgetStateRoutes = (app: FastifyInstance, db: Database.Database) => {
  const store = createStateStore(db)

  app.get<{ Params: { instanceId: string } }>(
    '/api/widgets/:instanceId/state',
    async (req, reply) => {
      const record = store.get(req.params.instanceId)
      if (!record) {
        reply.code(404)
        return { error: 'not found' }
      }
      return record
    },
  )

  app.put<{ Params: { instanceId: string } }>(
    '/api/widgets/:instanceId/state',
    async (req, reply) => {
      const body = Body.parse(req.body)
      try {
        const record = store.put(
          req.params.instanceId,
          body.widgetId,
          body.data,
          body.expectedVersion ?? null,
        )
        app.broker.publish({ type: 'widget:data', instanceId: req.params.instanceId, payload: record.data })
        return record
      } catch (err) {
        if (String(err).includes('conflict')) {
          reply.code(409)
          return { error: 'version conflict' }
        }
        throw err
      }
    },
  )
}
```

- [ ] **Step 4: Wire into `app.ts`**

Edit `packages/server/src/app.ts` — add the import and call:

```ts
import { registerWidgetStateRoutes } from './routes/widget-state'
// ...
registerWidgetStateRoutes(app, db.raw)
```

Place after the existing `registerEventWritesRoutes(app, db.raw)` line.

- [ ] **Step 5: Re-run tests**

Expected: 3 new tests pass; existing 36 still pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server
git commit -m "feat(server): /api/widgets/:instanceId/state endpoint"
```

### Task 4: Widget runtime — boot widget backends from server

**Files:**

- Create: `packages/server/src/widgets/runtime.ts`
- Create: `packages/server/src/widgets/runtime.test.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Write failing test**

```ts
import type { WidgetDefinition } from '@dashboard/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createBroker } from '../ws/broker'
import { startWidgetRuntime } from './runtime'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('startWidgetRuntime', () => {
  it('runs backends for instances in the active scene and publishes via broker', async () => {
    const broker = createBroker()
    const seen: Array<{ instanceId: string; payload: unknown }> = []
    broker.subscribe((m) => {
      if (m.type === 'widget:data') seen.push({ instanceId: m.instanceId, payload: m.payload })
    })

    const widget: WidgetDefinition = {
      id: 'ticker',
      name: 'Ticker',
      defaultSize: { w: 1, h: 1 },
      minSize: { w: 1, h: 1 },
      configSchema: z.object({}),
      backend: {
        intervalMs: 1000,
        run: async (ctx) => ctx.publish({ at: ctx.now().getTime() }),
      },
    }

    const stop = startWidgetRuntime({
      broker,
      widgets: [widget],
      instances: [{ widgetId: 'ticker', instanceId: 'i1', config: {} }],
    })
    await vi.advanceTimersByTimeAsync(2500)
    stop()
    expect(seen.length).toBeGreaterThanOrEqual(2)
    expect(seen[0]?.instanceId).toBe('i1')
  })
})
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Implement `runtime.ts`**

```ts
import type { WidgetDefinition } from '@dashboard/core'
import type { Broker } from '../ws/broker'
import { runWidgetBackends, type WidgetInstance } from './cron-runner'

export interface RuntimeArgs {
  broker: Broker
  widgets: WidgetDefinition[]
  instances: WidgetInstance[]
}

export const startWidgetRuntime = ({ broker, widgets, instances }: RuntimeArgs) =>
  runWidgetBackends({
    widgets,
    instances,
    publish: (instanceId, payload) =>
      broker.publish({ type: 'widget:data', instanceId, payload }),
    now: () => new Date(),
  })
```

- [ ] **Step 4: Re-run test**

Expected: PASS.

- [ ] **Step 5: Wire into `app.ts` (instances initially empty — wired up per-widget later)**

Edit `packages/server/src/app.ts`:

```ts
import { startWidgetRuntime } from './widgets/runtime'
import { createRegistry } from './widgets/registry'

// after broker + db are created:
const widgetRegistry = createRegistry()
const widgetInstances: { widgetId: string; instanceId: string; config: unknown }[] = []
const stopWidgets = startWidgetRuntime({
  broker,
  widgets: widgetRegistry.list(),
  instances: widgetInstances,
})
app.addHook('onClose', async () => stopWidgets())
app.decorate('widgetRegistry', widgetRegistry)
```

Augment the FastifyInstance:

```ts
declare module 'fastify' {
  interface FastifyInstance {
    broker: ReturnType<typeof createBroker>
    db: Database.Database
    widgetRegistry: ReturnType<typeof createRegistry>
  }
}
```

Note: instances list is empty for now. Later tasks (Weather, Slideshow) will register widgets + their instances by reading them from `widget_configs`. For this task we just want the runtime present and inert.

- [ ] **Step 6: Re-run all server tests**

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/server
git commit -m "feat(server): widget runtime wiring (no widgets registered yet)"
```

### Task 5: Server-side scene→instances helper

**Files:**

- Create: `packages/server/src/widgets/instances-from-scene.ts`
- Create: `packages/server/src/widgets/instances-from-scene.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest'
import { instancesFromScene } from './instances-from-scene'

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
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type { LayoutCell } from '@dashboard/core'
import type { WidgetInstance } from './cron-runner'

export const instancesFromScene = (cells: LayoutCell[]): WidgetInstance[] =>
  cells.map((c) => ({ widgetId: c.widgetId, instanceId: c.instanceId, config: c.config }))
```

- [ ] **Step 4: Re-run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): instancesFromScene helper"
```

---

## Phase 1: Weather Widget (Open-Meteo)

### Task 6: Open-Meteo HTTP client

**Files:**

- Create: `packages/server/src/sync/weather-client.ts`
- Create: `packages/server/src/sync/weather-client.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWeather } from './weather-client'

const fetchMock = vi.fn()
vi.mock('undici', () => ({ fetch: (...a: unknown[]) => fetchMock(...a) }))

afterEach(() => fetchMock.mockReset())

describe('fetchWeather', () => {
  it('queries Open-Meteo and normalises the response', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          current: { temperature_2m: 72.3, weather_code: 0, is_day: 1, wind_speed_10m: 5 },
          daily: { time: ['2026-05-29'], temperature_2m_min: [60], temperature_2m_max: [78] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const out = await fetchWeather({ lat: 40.7, lon: -74.0, unit: 'fahrenheit' })
    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain('latitude=40.7')
    expect(url).toContain('longitude=-74')
    expect(url).toContain('temperature_unit=fahrenheit')
    expect(out.current.temperature).toBe(72.3)
    expect(out.current.isDay).toBe(true)
    expect(out.today.high).toBe(78)
    expect(out.today.low).toBe(60)
  })
})
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { fetch } from 'undici'

export interface WeatherInput {
  lat: number
  lon: number
  unit: 'celsius' | 'fahrenheit'
}

export interface WeatherData {
  current: { temperature: number; weatherCode: number; isDay: boolean; windSpeed: number }
  today: { high: number; low: number }
  fetchedAt: number
}

export const fetchWeather = async (input: WeatherInput): Promise<WeatherData> => {
  const params = new URLSearchParams({
    latitude: String(input.lat),
    longitude: String(input.lon),
    current: 'temperature_2m,weather_code,is_day,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min',
    temperature_unit: input.unit,
    wind_speed_unit: 'mph',
    timezone: 'auto',
    forecast_days: '1',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error(`open-meteo failed: ${res.status}`)
  const j = (await res.json()) as {
    current: { temperature_2m: number; weather_code: number; is_day: number; wind_speed_10m: number }
    daily: { temperature_2m_min: number[]; temperature_2m_max: number[] }
  }
  return {
    current: {
      temperature: j.current.temperature_2m,
      weatherCode: j.current.weather_code,
      isDay: j.current.is_day === 1,
      windSpeed: j.current.wind_speed_10m,
    },
    today: {
      high: j.daily.temperature_2m_max[0] ?? 0,
      low: j.daily.temperature_2m_min[0] ?? 0,
    },
    fetchedAt: Date.now(),
  }
}
```

- [ ] **Step 4: Re-run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): Open-Meteo weather client"
```

### Task 7: Weather widget package

**Files:**

- Create: `packages/widgets/weather/package.json`
- Create: `packages/widgets/weather/tsconfig.json`
- Create: `packages/widgets/weather/src/index.ts`
- Create: `packages/widgets/weather/src/view.tsx`
- Create: `packages/widgets/weather/src/backend.ts`

- [ ] **Step 1: Create directory and `package.json`**

```bash
mkdir -p packages/widgets/weather/src
```

`packages/widgets/weather/package.json`:

```json
{
  "name": "@dashboard/widget-weather",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": { ".": "./dist/index.js" },
  "scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run --passWithNoTests" },
  "dependencies": {
    "@dashboard/core": "workspace:*",
    "zod": "3.23.8"
  },
  "peerDependencies": { "react": "^19.0.0" },
  "devDependencies": {
    "@types/react": "19.0.2",
    "typescript": "5.7.2",
    "vitest": "2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `src/view.tsx`**

```tsx
export interface WeatherConfig {
  lat: number
  lon: number
  unit?: 'celsius' | 'fahrenheit'
  label?: string
}

export interface WeatherData {
  current: { temperature: number; weatherCode: number; isDay: boolean; windSpeed: number }
  today: { high: number; low: number }
  fetchedAt: number
}

const codeToEmoji = (code: number, isDay: boolean): string => {
  if (code === 0) return isDay ? '☀️' : '🌙'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌧️'
  if (code <= 99) return '⛈️'
  return '☁️'
}

export const WeatherView = ({
  config,
  data,
}: {
  config: WeatherConfig
  data: WeatherData | undefined
}) => {
  const unit = config.unit === 'celsius' ? '°C' : '°F'
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-dim)]">
        Loading weather…
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col items-center justify-center p-3 text-center">
      <div className="text-4xl leading-none">{codeToEmoji(data.current.weatherCode, data.current.isDay)}</div>
      <div className="mt-1 text-3xl font-extrabold" style={{ color: 'var(--accent)' }}>
        {Math.round(data.current.temperature)}
        {unit}
      </div>
      <div className="text-xs text-[var(--text-dim)]">
        H {Math.round(data.today.high)}
        {unit} · L {Math.round(data.today.low)}
        {unit}
      </div>
      {config.label ? <div className="mt-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">{config.label}</div> : null}
    </div>
  )
}
```

- [ ] **Step 4: Write `src/backend.ts`**

```ts
import type { WidgetBackend, WidgetBackendContext } from '@dashboard/core'
import { z } from 'zod'

const Config = z.object({
  lat: z.number(),
  lon: z.number(),
  unit: z.enum(['celsius', 'fahrenheit']).optional(),
})

export const createWeatherBackend = (
  fetcher: (input: { lat: number; lon: number; unit: 'celsius' | 'fahrenheit' }) => Promise<unknown>,
): WidgetBackend => ({
  intervalMs: 15 * 60_000,
  run: async (ctx: WidgetBackendContext) => {
    const cfg = Config.parse(ctx.config)
    const data = await fetcher({ lat: cfg.lat, lon: cfg.lon, unit: cfg.unit ?? 'fahrenheit' })
    ctx.publish(data)
  },
})
```

- [ ] **Step 5: Write `src/index.ts`**

```ts
import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { WeatherView } from './view'

const ConfigSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  unit: z.enum(['celsius', 'fahrenheit']).optional(),
  label: z.string().optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'weather',
  name: 'Weather',
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  configSchema: ConfigSchema,
}

export default { ...definition, Render: WeatherView }
```

- [ ] **Step 6: Build + commit**

```bash
pnpm install
pnpm --filter @dashboard/widget-weather build
git add packages/widgets/weather
git commit -m "feat(widget-weather): widget package with Open-Meteo backend factory"
```

### Task 8: Register weather widget in server + dashboard

**Files:**

- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/widgets/runtime.ts` (no — runtime stays generic)
- Modify: `packages/server/src/db/seed.ts`
- Modify: `packages/server/src/db/seed.test.ts`
- Modify: `packages/dashboard/package.json`
- Modify: `packages/dashboard/src/widgets.ts`

- [ ] **Step 1: Register weather in the server-side registry**

Edit `packages/server/src/app.ts` — inside the section where the registry is created, import the weather definition and create its backend, then add it to `widgetRegistry`. Replace the previously empty registry block with:

```ts
import weatherDef from '@dashboard/widget-weather'
import { createWeatherBackend } from '@dashboard/widget-weather/backend'
import { fetchWeather } from './sync/weather-client'
import { instancesFromScene } from './widgets/instances-from-scene'

const widgetRegistry = createRegistry()
widgetRegistry.register({ ...weatherDef, backend: createWeatherBackend(fetchWeather) })

const widgetInstances = (() => {
  const scene = db.raw
    .prepare('SELECT layout_json FROM scenes WHERE is_default = 1')
    .get() as { layout_json: string } | undefined
  if (!scene) return []
  return instancesFromScene(JSON.parse(scene.layout_json))
})()

const stopWidgets = startWidgetRuntime({
  broker,
  widgets: widgetRegistry.list(),
  instances: widgetInstances,
})
```

Note: `@dashboard/widget-weather/backend` must be exported. Update the weather package.json `exports`:

```json
"exports": {
  ".": "./dist/index.js",
  "./backend": "./dist/backend.js"
}
```

Then rebuild the weather widget so the `dist/backend.js` exists.

- [ ] **Step 2: Add weather to dashboard deps + loader**

`packages/dashboard/package.json` — add to dependencies:

```json
"@dashboard/widget-weather": "workspace:*"
```

`packages/dashboard/src/widgets.ts` — append:

```ts
registerWidgetLoader('weather', () =>
  import('@dashboard/widget-weather').then((m) => m.default),
)
```

- [ ] **Step 3: Add weather cell to seed**

Edit `packages/server/src/db/seed.ts` — update the cells array:

```ts
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
    instanceId: 'cal-1',
    widgetId: 'calendar',
    x: 0,
    y: 3,
    w: 8,
    h: 4,
    config: { view: 'week' },
  },
]
```

- [ ] **Step 4: Update seed test**

Edit `packages/server/src/db/seed.test.ts` — update the expectation:

```ts
expect(JSON.parse(firstRow.layout_json)).toEqual([
  expect.objectContaining({ widgetId: 'clock' }),
  expect.objectContaining({ widgetId: 'weather' }),
  expect.objectContaining({ widgetId: 'calendar' }),
])
```

- [ ] **Step 5: Install + build + run all tests**

```bash
pnpm install
pnpm --filter @dashboard/widget-weather build
pnpm --filter @dashboard/dashboard build
pnpm --filter @dashboard/server test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server packages/dashboard packages/widgets/weather
git commit -m "feat(weather): register weather widget end-to-end"
```

---

## Phase 2: Agenda Widget

### Task 9: Agenda widget package

**Files:**

- Create: `packages/widgets/agenda/package.json`
- Create: `packages/widgets/agenda/tsconfig.json`
- Create: `packages/widgets/agenda/src/index.ts`
- Create: `packages/widgets/agenda/src/view.tsx`

- [ ] **Step 1: Create directory and `package.json`**

```bash
mkdir -p packages/widgets/agenda/src
```

`packages/widgets/agenda/package.json`:

```json
{
  "name": "@dashboard/widget-agenda",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": { ".": "./dist/index.js" },
  "scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run --passWithNoTests" },
  "dependencies": {
    "@dashboard/core": "workspace:*",
    "date-fns": "4.1.0",
    "zod": "3.23.8"
  },
  "peerDependencies": {
    "@tanstack/react-query": "^5.0.0",
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@tanstack/react-query": "5.62.7",
    "@types/react": "19.0.2",
    "typescript": "5.7.2",
    "vitest": "2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `src/view.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query'
import { addDays, endOfDay, format, isSameDay, startOfDay } from 'date-fns'

interface ApiEvent {
  id: string
  start: number
  end: number
  allDay: boolean
  title: string
  color: string | null
}

export interface AgendaConfig {
  daysAhead?: number
  title?: string
}

export const AgendaView = ({ config }: { config: AgendaConfig; data: undefined }) => {
  const now = new Date()
  const days = config.daysAhead ?? 1
  const from = startOfDay(now).getTime()
  const to = endOfDay(addDays(now, days)).getTime()

  const { data: events = [] } = useQuery({
    queryKey: ['agenda', from, to],
    queryFn: async () => {
      const res = await fetch(`/api/events?from=${from}&to=${to}`)
      if (!res.ok) throw new Error('events fetch failed')
      return ((await res.json()) as { events: ApiEvent[] }).events
    },
    refetchInterval: 60_000,
  })

  const grouped = events.reduce<Map<string, ApiEvent[]>>((acc, ev) => {
    const key = format(new Date(ev.start), 'yyyy-MM-dd')
    const list = acc.get(key) ?? []
    list.push(ev)
    acc.set(key, list)
    return acc
  }, new Map())

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
        {config.title ?? 'Up next'}
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {[...grouped.entries()].map(([day, list]) => {
          const date = new Date(`${day}T00:00:00`)
          const heading = isSameDay(date, now)
            ? 'Today'
            : isSameDay(date, addDays(now, 1))
              ? 'Tomorrow'
              : format(date, 'EEE MMM d')
          return (
            <div key={day}>
              <div className="text-[10px] font-semibold uppercase text-[var(--text-dim)]">
                {heading}
              </div>
              {list.map((ev) => (
                <div
                  key={ev.id}
                  className="mt-1 rounded-md px-2 py-1 text-xs text-white"
                  style={{ background: ev.color ?? 'var(--accent)' }}
                >
                  {ev.allDay ? 'All day' : format(new Date(ev.start), 'h:mma')} · {ev.title}
                </div>
              ))}
            </div>
          )
        })}
        {events.length === 0 ? (
          <div className="text-xs text-[var(--text-dim)]">Nothing scheduled.</div>
        ) : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write `src/index.ts`**

```ts
import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { AgendaView } from './view'

const ConfigSchema = z.object({
  daysAhead: z.number().int().min(0).max(7).optional(),
  title: z.string().optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'agenda',
  name: 'Agenda',
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 3, h: 3 },
  configSchema: ConfigSchema,
}

export default { ...definition, Render: AgendaView }
```

- [ ] **Step 5: Install + build**

```bash
pnpm install
pnpm --filter @dashboard/widget-agenda build
```

- [ ] **Step 6: Commit**

```bash
git add packages/widgets/agenda
git commit -m "feat(widget-agenda): today/tomorrow grouped agenda"
```

### Task 10: Register agenda widget + add to scene

**Files:**

- Modify: `packages/dashboard/package.json`
- Modify: `packages/dashboard/src/widgets.ts`
- Modify: `packages/server/src/db/seed.ts`
- Modify: `packages/server/src/db/seed.test.ts`

- [ ] **Step 1: Add dependency + loader**

`packages/dashboard/package.json` — add:

```json
"@dashboard/widget-agenda": "workspace:*"
```

`packages/dashboard/src/widgets.ts` — append:

```ts
registerWidgetLoader('agenda', () =>
  import('@dashboard/widget-agenda').then((m) => m.default),
)
```

- [ ] **Step 2: Add agenda cell to seed**

Edit `packages/server/src/db/seed.ts` — replace the cells array:

```ts
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
  { instanceId: 'agenda-1', widgetId: 'agenda', x: 0, y: 1, w: 5, h: 2, config: { daysAhead: 1 } },
  {
    instanceId: 'cal-1',
    widgetId: 'calendar',
    x: 0,
    y: 3,
    w: 8,
    h: 4,
    config: { view: 'week' },
  },
]
```

- [ ] **Step 3: Update seed test expectation**

```ts
expect(JSON.parse(firstRow.layout_json)).toEqual([
  expect.objectContaining({ widgetId: 'clock' }),
  expect.objectContaining({ widgetId: 'weather' }),
  expect.objectContaining({ widgetId: 'agenda' }),
  expect.objectContaining({ widgetId: 'calendar' }),
])
```

- [ ] **Step 4: Install + build + test**

```bash
pnpm install
pnpm --filter @dashboard/widget-agenda build
pnpm --filter @dashboard/dashboard build
pnpm --filter @dashboard/server test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server packages/dashboard
git commit -m "feat(agenda): register widget + add to default scene"
```

---

## Phase 3: Slideshow Widget (Google Photos)

### Task 11: Google Photos client

**Files:**

- Create: `packages/server/src/sync/google-photos.ts`
- Create: `packages/server/src/sync/google-photos.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listAlbumMedia } from './google-photos'

const fetchMock = vi.fn()
vi.mock('undici', () => ({ fetch: (...a: unknown[]) => fetchMock(...a) }))

afterEach(() => fetchMock.mockReset())

describe('listAlbumMedia', () => {
  it('paginates through mediaItems search and returns base urls', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            mediaItems: [{ id: '1', baseUrl: 'https://lh3.googleusercontent.com/a' }],
            nextPageToken: 'TOKEN',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            mediaItems: [{ id: '2', baseUrl: 'https://lh3.googleusercontent.com/b' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )

    const out = await listAlbumMedia('TOKEN', 'ALBUM_1')
    expect(out.map((m) => m.id)).toEqual(['1', '2'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { fetch } from 'undici'

const API = 'https://photoslibrary.googleapis.com/v1'

export interface MediaItem {
  id: string
  baseUrl: string
  mimeType?: string
}

export const listAlbumMedia = async (
  accessToken: string,
  albumId: string,
): Promise<MediaItem[]> => {
  const all: MediaItem[] = []
  let pageToken: string | undefined
  for (;;) {
    const body: Record<string, unknown> = { albumId, pageSize: 100 }
    if (pageToken) body.pageToken = pageToken
    const res = await fetch(`${API}/mediaItems:search`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`google photos failed: ${res.status}`)
    const j = (await res.json()) as { mediaItems?: MediaItem[]; nextPageToken?: string }
    if (j.mediaItems) all.push(...j.mediaItems)
    if (!j.nextPageToken) break
    pageToken = j.nextPageToken
  }
  return all
}

export const listSharedAlbums = async (
  accessToken: string,
): Promise<Array<{ id: string; title: string }>> => {
  const res = await fetch(`${API}/sharedAlbums?pageSize=50`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`google sharedAlbums failed: ${res.status}`)
  const j = (await res.json()) as { sharedAlbums?: Array<{ id: string; title: string }> }
  return j.sharedAlbums ?? []
}
```

- [ ] **Step 4: Re-run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): Google Photos album media client"
```

### Task 12: Slideshow widget package

**Files:**

- Create: `packages/widgets/slideshow/package.json`
- Create: `packages/widgets/slideshow/tsconfig.json`
- Create: `packages/widgets/slideshow/src/index.ts`
- Create: `packages/widgets/slideshow/src/view.tsx`
- Create: `packages/widgets/slideshow/src/backend.ts`

- [ ] **Step 1: Create directory and `package.json`**

```bash
mkdir -p packages/widgets/slideshow/src
```

`packages/widgets/slideshow/package.json`:

```json
{
  "name": "@dashboard/widget-slideshow",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".": "./dist/index.js",
    "./backend": "./dist/backend.js"
  },
  "scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run --passWithNoTests" },
  "dependencies": {
    "@dashboard/core": "workspace:*",
    "zod": "3.23.8"
  },
  "peerDependencies": { "react": "^19.0.0" },
  "devDependencies": {
    "@types/react": "19.0.2",
    "typescript": "5.7.2",
    "vitest": "2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `src/view.tsx`**

```tsx
import { useEffect, useState } from 'react'

export interface SlideshowConfig {
  intervalMs?: number
  size?: 'w1200-h1200' | 'w800-h800' | 'w2000-h2000'
}

interface SlideshowData {
  baseUrls: string[]
  fetchedAt: number
}

export const SlideshowView = ({
  config,
  data,
}: {
  config: SlideshowConfig
  data: SlideshowData | undefined
}) => {
  const [index, setIndex] = useState(0)
  const interval = config.intervalMs ?? 8000
  const size = config.size ?? 'w1200-h1200'
  const images = data?.baseUrls ?? []

  useEffect(() => {
    if (images.length === 0) return
    const t = setInterval(() => setIndex((i) => (i + 1) % images.length), interval)
    return () => clearInterval(t)
  }, [images.length, interval])

  if (images.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-dim)]">
        No photos yet
      </div>
    )
  }
  const url = `${images[index]}=${size}`
  return (
    <div
      className="h-full w-full bg-cover bg-center transition-opacity duration-700"
      style={{ backgroundImage: `url(${url})` }}
      role="img"
      aria-label="Family photo"
    />
  )
}
```

- [ ] **Step 4: Write `src/backend.ts`**

```ts
import type { WidgetBackend, WidgetBackendContext } from '@dashboard/core'
import { z } from 'zod'

const Config = z.object({
  albumId: z.string().min(1),
})

export type ListAlbumMedia = (
  accessToken: string,
  albumId: string,
) => Promise<Array<{ baseUrl: string }>>

export const createSlideshowBackend = (
  list: ListAlbumMedia,
  getAccessToken: () => Promise<string | null>,
): WidgetBackend => ({
  intervalMs: 60 * 60_000,
  run: async (ctx: WidgetBackendContext) => {
    const cfg = Config.parse(ctx.config)
    const token = await getAccessToken()
    if (!token) {
      ctx.publish({ baseUrls: [], fetchedAt: ctx.now().getTime() })
      return
    }
    const media = await list(token, cfg.albumId)
    ctx.publish({ baseUrls: media.map((m) => m.baseUrl), fetchedAt: ctx.now().getTime() })
  },
})
```

- [ ] **Step 5: Write `src/index.ts`**

```ts
import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { SlideshowView } from './view'

const ConfigSchema = z.object({
  albumId: z.string().min(1),
  intervalMs: z.number().int().min(2000).optional(),
  size: z.enum(['w1200-h1200', 'w800-h800', 'w2000-h2000']).optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'slideshow',
  name: 'Slideshow',
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  configSchema: ConfigSchema,
}

export default { ...definition, Render: SlideshowView }
```

- [ ] **Step 6: Install + build + commit**

```bash
pnpm install
pnpm --filter @dashboard/widget-slideshow build
git add packages/widgets/slideshow
git commit -m "feat(widget-slideshow): Google Photos slideshow + backend factory"
```

### Task 13: Server access-token bridge for slideshow

**Files:**

- Create: `packages/server/src/auth/access-token.ts`
- Create: `packages/server/src/auth/access-token.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../db'
import { createEncryptor, deriveKey } from './encryption'
import { createAccessTokenProvider } from './access-token'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'at-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('createAccessTokenProvider', () => {
  it('returns null when no account exists', async () => {
    const { db, close } = openDatabase(dir)
    const provider = createAccessTokenProvider({
      db: db.raw,
      machineId: 'm',
      refresh: vi.fn(),
    })
    expect(await provider()).toBeNull()
    close()
  })

  it('decrypts refresh token and returns fresh access token', async () => {
    const { db, close } = openDatabase(dir)
    db.raw.prepare("INSERT INTO kv (key, value) VALUES ('salt', 'S')").run()
    const key = await deriveKey('m', 'S')
    const enc = await createEncryptor(key)
    const encrypted = enc.encrypt('rt-secret')
    db.raw
      .prepare(
        `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
         VALUES ('a1', 'google', '', ?, 'calendar', ?)`,
      )
      .run(encrypted, Date.now())

    const refresh = vi.fn(async (rt: string) => {
      expect(rt).toBe('rt-secret')
      return { accessToken: 'AT', expiresAt: Date.now() + 60_000 }
    })
    const provider = createAccessTokenProvider({ db: db.raw, machineId: 'm', refresh })
    expect(await provider()).toBe('AT')
    close()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type Database from 'better-sqlite3'
import { createEncryptor, deriveKey } from './encryption'
import { createTokenCache } from './token-cache'

export interface ProviderArgs {
  db: Database.Database
  machineId: string
  refresh: (rt: string) => Promise<{ accessToken: string; expiresAt: number }>
}

export const createAccessTokenProvider = (args: ProviderArgs): (() => Promise<string | null>) => {
  const cache = createTokenCache(args.refresh)
  return async () => {
    const acc = args.db
      .prepare('SELECT refresh_token_encrypted FROM accounts ORDER BY created_at ASC LIMIT 1')
      .get() as { refresh_token_encrypted: string } | undefined
    if (!acc) return null
    const saltRow = args.db.prepare("SELECT value FROM kv WHERE key='salt'").get() as
      | { value: string }
      | undefined
    if (!saltRow) return null
    const key = await deriveKey(args.machineId, saltRow.value)
    const enc = await createEncryptor(key)
    const refreshToken = enc.decrypt(acc.refresh_token_encrypted)
    return cache.get(refreshToken)
  }
}
```

- [ ] **Step 4: Re-run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): access token provider for widget backends"
```

### Task 14: Register slideshow widget end-to-end

**Files:**

- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/db/seed.ts`
- Modify: `packages/server/src/db/seed.test.ts`
- Modify: `packages/dashboard/package.json`
- Modify: `packages/dashboard/src/widgets.ts`

- [ ] **Step 1: Wire slideshow backend into server**

Edit `packages/server/src/app.ts` — add imports:

```ts
import slideshowDef from '@dashboard/widget-slideshow'
import { createSlideshowBackend } from '@dashboard/widget-slideshow/backend'
import { listAlbumMedia } from './sync/google-photos'
import { createAccessTokenProvider } from './auth/access-token'
import { refreshAccessToken } from './auth/google'
```

In the widget registry setup section, after `widgetRegistry.register({ ...weatherDef, ... })`, add:

```ts
const getAccessToken =
  opts.googleClientId && opts.googleClientSecret
    ? createAccessTokenProvider({
        db: db.raw,
        machineId,
        refresh: (rt) =>
          refreshAccessToken(opts.googleClientId as string, opts.googleClientSecret as string, rt),
      })
    : async () => null

widgetRegistry.register({
  ...slideshowDef,
  backend: createSlideshowBackend(listAlbumMedia, getAccessToken),
})
```

- [ ] **Step 2: Add slideshow to dashboard**

`packages/dashboard/package.json` — add:

```json
"@dashboard/widget-slideshow": "workspace:*"
```

`packages/dashboard/src/widgets.ts` — append:

```ts
registerWidgetLoader('slideshow', () =>
  import('@dashboard/widget-slideshow').then((m) => m.default),
)
```

- [ ] **Step 3: Add slideshow cell to seed (placeholder albumId)**

Edit `packages/server/src/db/seed.ts` — replace the cells array:

```ts
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
  { instanceId: 'agenda-1', widgetId: 'agenda', x: 0, y: 1, w: 5, h: 2, config: { daysAhead: 1 } },
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
]
```

- [ ] **Step 4: Update seed test**

```ts
expect(JSON.parse(firstRow.layout_json)).toEqual([
  expect.objectContaining({ widgetId: 'clock' }),
  expect.objectContaining({ widgetId: 'weather' }),
  expect.objectContaining({ widgetId: 'agenda' }),
  expect.objectContaining({ widgetId: 'calendar' }),
  expect.objectContaining({ widgetId: 'slideshow' }),
])
```

- [ ] **Step 5: Install + build + test**

```bash
pnpm install
pnpm --filter @dashboard/widget-slideshow build
pnpm --filter @dashboard/dashboard build
pnpm --filter @dashboard/server test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server packages/dashboard
git commit -m "feat(slideshow): register slideshow widget end-to-end"
```

---

## Phase 4: Chores Widget

### Task 15: Shared widget-state React hook

**Files:**

- Create: `packages/dashboard/src/hooks/use-widget-state.ts`

- [ ] **Step 1: Implement**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface WidgetStateRecord<T> {
  instanceId: string
  widgetId: string
  version: number
  data: T
  updatedAt: number
}

export interface UseWidgetStateArgs<T> {
  instanceId: string
  widgetId: string
  initial: T
}

export const useWidgetState = <T>(args: UseWidgetStateArgs<T>) => {
  const qc = useQueryClient()
  const key = ['widget-state', args.instanceId]

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<WidgetStateRecord<T>> => {
      const res = await fetch(`/api/widgets/${args.instanceId}/state`)
      if (res.status === 404) {
        return {
          instanceId: args.instanceId,
          widgetId: args.widgetId,
          version: 0,
          data: args.initial,
          updatedAt: 0,
        }
      }
      if (!res.ok) throw new Error('widget state load failed')
      return (await res.json()) as WidgetStateRecord<T>
    },
    refetchInterval: 30_000,
  })

  const mutation = useMutation({
    mutationFn: async (data: T) => {
      const current = qc.getQueryData<WidgetStateRecord<T>>(key)
      const res = await fetch(`/api/widgets/${args.instanceId}/state`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          widgetId: args.widgetId,
          data,
          ...(current && current.version > 0 ? { expectedVersion: current.version } : {}),
        }),
      })
      if (!res.ok) throw new Error('widget state save failed')
      return (await res.json()) as WidgetStateRecord<T>
    },
    onSuccess: (next) => qc.setQueryData(key, next),
  })

  return {
    data: query.data?.data ?? args.initial,
    save: (next: T) => mutation.mutate(next),
    isSaving: mutation.isPending,
  }
}
```

- [ ] **Step 2: Build dashboard**

```bash
pnpm --filter @dashboard/dashboard build
```

Expected: succeeds (no consumer yet, just verifying types).

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard
git commit -m "feat(dashboard): useWidgetState hook for stateful widgets"
```

### Task 16: Chores widget package

**Files:**

- Create: `packages/widgets/chores/package.json`
- Create: `packages/widgets/chores/tsconfig.json`
- Create: `packages/widgets/chores/src/index.ts`
- Create: `packages/widgets/chores/src/view.tsx`

- [ ] **Step 1: Create directory and `package.json`**

```bash
mkdir -p packages/widgets/chores/src
```

`packages/widgets/chores/package.json`:

```json
{
  "name": "@dashboard/widget-chores",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": { ".": "./dist/index.js" },
  "scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run --passWithNoTests" },
  "dependencies": {
    "@dashboard/core": "workspace:*",
    "zod": "3.23.8"
  },
  "peerDependencies": {
    "@tanstack/react-query": "^5.0.0",
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@tanstack/react-query": "5.62.7",
    "@types/react": "19.0.2",
    "typescript": "5.7.2",
    "vitest": "2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `src/view.tsx`**

```tsx
import { useEffect, useState } from 'react'

export interface ChoresConfig {
  instanceId: string
  title?: string
  initial?: string[]
}

interface ChoreItem {
  id: string
  text: string
  done: boolean
}

interface ChoresState {
  items: ChoreItem[]
}

const stateUrl = (instanceId: string) => `/api/widgets/${instanceId}/state`

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const ChoresView = ({ config }: { config: ChoresConfig; data: undefined }) => {
  const [state, setState] = useState<ChoresState>({
    items: (config.initial ?? []).map((text) => ({ id: newId(), text, done: false })),
  })
  const [version, setVersion] = useState(0)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(stateUrl(config.instanceId))
      if (res.status === 404) return
      if (!res.ok) return
      const j = (await res.json()) as { version: number; data: ChoresState }
      if (!cancelled) {
        setState(j.data)
        setVersion(j.version)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [config.instanceId])

  const persist = async (next: ChoresState) => {
    setState(next)
    const body: { widgetId: string; data: ChoresState; expectedVersion?: number } = {
      widgetId: 'chores',
      data: next,
    }
    if (version > 0) body.expectedVersion = version
    const res = await fetch(stateUrl(config.instanceId), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const j = (await res.json()) as { version: number }
      setVersion(j.version)
    }
  }

  const toggle = (id: string) => {
    void persist({
      items: state.items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)),
    })
  }

  const add = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    void persist({ items: [...state.items, { id: newId(), text, done: false }] })
  }

  return (
    <div className="flex h-full flex-col p-3">
      <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
        {config.title ?? 'Chores'}
      </div>
      <div className="mt-2 flex flex-1 flex-col gap-1 overflow-y-auto">
        {state.items.map((item) => (
          <label key={item.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={item.done}
              onChange={() => toggle(item.id)}
              className="h-4 w-4"
            />
            <span className={item.done ? 'line-through text-[var(--text-dim)]' : ''}>
              {item.text}
            </span>
          </label>
        ))}
        {state.items.length === 0 ? (
          <div className="text-xs text-[var(--text-dim)]">No chores yet — add one below.</div>
        ) : null}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="mt-2 flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a chore"
          className="flex-1 rounded-md border border-[var(--text-dim)]/30 bg-white px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="rounded-md px-3 py-1 text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          Add
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Write `src/index.ts`**

```ts
import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { ChoresView } from './view'

const ConfigSchema = z.object({
  instanceId: z.string().min(1),
  title: z.string().optional(),
  initial: z.array(z.string()).optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'chores',
  name: 'Chores',
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  configSchema: ConfigSchema,
}

export default { ...definition, Render: ChoresView }
```

- [ ] **Step 5: Install + build**

```bash
pnpm install
pnpm --filter @dashboard/widget-chores build
```

- [ ] **Step 6: Commit**

```bash
git add packages/widgets/chores
git commit -m "feat(widget-chores): checklist with state persistence"
```

### Task 17: Register chores + add to scene

**Files:**

- Modify: `packages/dashboard/package.json`
- Modify: `packages/dashboard/src/widgets.ts`
- Modify: `packages/server/src/db/seed.ts`
- Modify: `packages/server/src/db/seed.test.ts`

- [ ] **Step 1: Register loader**

`packages/dashboard/package.json` — add:

```json
"@dashboard/widget-chores": "workspace:*"
```

`packages/dashboard/src/widgets.ts` — append:

```ts
registerWidgetLoader('chores', () =>
  import('@dashboard/widget-chores').then((m) => m.default),
)
```

- [ ] **Step 2: Add chores cell to seed**

Edit `packages/server/src/db/seed.ts` — append a chore cell. New cells array (each instanceId carries through to ChoresView via config):

```ts
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
  { instanceId: 'agenda-1', widgetId: 'agenda', x: 0, y: 1, w: 5, h: 2, config: { daysAhead: 1 } },
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
]
```

- [ ] **Step 3: Update seed test**

```ts
expect(JSON.parse(firstRow.layout_json)).toEqual([
  expect.objectContaining({ widgetId: 'clock' }),
  expect.objectContaining({ widgetId: 'weather' }),
  expect.objectContaining({ widgetId: 'agenda' }),
  expect.objectContaining({ widgetId: 'calendar' }),
  expect.objectContaining({ widgetId: 'slideshow' }),
  expect.objectContaining({ widgetId: 'chores' }),
])
```

- [ ] **Step 4: Install + build + test**

```bash
pnpm install
pnpm --filter @dashboard/widget-chores build
pnpm --filter @dashboard/dashboard build
pnpm --filter @dashboard/server test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server packages/dashboard
git commit -m "feat(chores): register chores widget + add to default scene"
```

---

## Phase 5: Meal Plan Widget

### Task 18: Meal-plan widget package

**Files:**

- Create: `packages/widgets/meal-plan/package.json`
- Create: `packages/widgets/meal-plan/tsconfig.json`
- Create: `packages/widgets/meal-plan/src/index.ts`
- Create: `packages/widgets/meal-plan/src/view.tsx`

- [ ] **Step 1: Create directory + `package.json`**

```bash
mkdir -p packages/widgets/meal-plan/src
```

`packages/widgets/meal-plan/package.json`:

```json
{
  "name": "@dashboard/widget-meal-plan",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": { ".": "./dist/index.js" },
  "scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run --passWithNoTests" },
  "dependencies": {
    "@dashboard/core": "workspace:*",
    "date-fns": "4.1.0",
    "zod": "3.23.8"
  },
  "peerDependencies": { "react": "^19.0.0" },
  "devDependencies": {
    "@types/react": "19.0.2",
    "typescript": "5.7.2",
    "vitest": "2.1.8"
  }
}
```

- [ ] **Step 2: `tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write `src/view.tsx`**

```tsx
import { format, startOfWeek, addDays } from 'date-fns'
import { useEffect, useState } from 'react'

export interface MealPlanConfig {
  instanceId: string
  title?: string
}

type WeekKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

interface MealPlanState {
  meals: Record<WeekKey, string>
}

const KEYS: WeekKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const emptyState = (): MealPlanState => ({
  meals: { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' },
})

const stateUrl = (id: string) => `/api/widgets/${id}/state`

export const MealPlanView = ({ config }: { config: MealPlanConfig; data: undefined }) => {
  const [state, setState] = useState<MealPlanState>(emptyState)
  const [version, setVersion] = useState(0)
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(stateUrl(config.instanceId))
      if (res.status === 404) return
      if (!res.ok) return
      const j = (await res.json()) as { version: number; data: MealPlanState }
      if (!cancelled) {
        setState(j.data)
        setVersion(j.version)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [config.instanceId])

  const update = async (key: WeekKey, value: string) => {
    const next: MealPlanState = { meals: { ...state.meals, [key]: value } }
    setState(next)
    const body: { widgetId: string; data: MealPlanState; expectedVersion?: number } = {
      widgetId: 'meal-plan',
      data: next,
    }
    if (version > 0) body.expectedVersion = version
    const res = await fetch(stateUrl(config.instanceId), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const j = (await res.json()) as { version: number }
      setVersion(j.version)
    }
  }

  return (
    <div className="flex h-full flex-col p-3">
      <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
        {config.title ?? 'This week'}
      </div>
      <div className="mt-2 flex flex-1 flex-col gap-1 overflow-y-auto">
        {KEYS.map((k, i) => (
          <div key={k} className="flex items-center gap-2 text-sm">
            <span className="w-10 text-xs font-semibold uppercase text-[var(--text-dim)]">
              {format(addDays(monday, i), 'EEE')}
            </span>
            <input
              value={state.meals[k]}
              onChange={(e) => void update(k, e.target.value)}
              placeholder="—"
              className="flex-1 rounded-md border border-[var(--text-dim)]/30 bg-white px-2 py-1"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write `src/index.ts`**

```ts
import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { MealPlanView } from './view'

const ConfigSchema = z.object({
  instanceId: z.string().min(1),
  title: z.string().optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'meal-plan',
  name: 'Meal Plan',
  defaultSize: { w: 3, h: 4 },
  minSize: { w: 2, h: 3 },
  configSchema: ConfigSchema,
}

export default { ...definition, Render: MealPlanView }
```

- [ ] **Step 5: Install + build + commit**

```bash
pnpm install
pnpm --filter @dashboard/widget-meal-plan build
git add packages/widgets/meal-plan
git commit -m "feat(widget-meal-plan): weekly meal planner"
```

### Task 19: Register meal-plan + add to scene

**Files:**

- Modify: `packages/dashboard/package.json`
- Modify: `packages/dashboard/src/widgets.ts`
- Modify: `packages/server/src/db/seed.ts`
- Modify: `packages/server/src/db/seed.test.ts`

- [ ] **Step 1: Register loader**

`packages/dashboard/package.json`:

```json
"@dashboard/widget-meal-plan": "workspace:*"
```

`packages/dashboard/src/widgets.ts` — append:

```ts
registerWidgetLoader('meal-plan', () =>
  import('@dashboard/widget-meal-plan').then((m) => m.default),
)
```

- [ ] **Step 2: Add meal-plan cell to seed**

Append to the seed cells array:

```ts
{
  instanceId: 'meal-1',
  widgetId: 'meal-plan',
  x: 3,
  y: 7,
  w: 2,
  h: 3,
  config: { instanceId: 'meal-1', title: 'Meals' },
},
```

- [ ] **Step 3: Update seed test**

Append:

```ts
expect.objectContaining({ widgetId: 'meal-plan' }),
```

- [ ] **Step 4: Install + build + test**

```bash
pnpm install
pnpm --filter @dashboard/widget-meal-plan build
pnpm --filter @dashboard/dashboard build
pnpm --filter @dashboard/server test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server packages/dashboard
git commit -m "feat(meal-plan): register meal-plan widget + add to scene"
```

---

## Phase 6: Notes Widget

### Task 20: Notes widget package

**Files:**

- Create: `packages/widgets/notes/package.json`
- Create: `packages/widgets/notes/tsconfig.json`
- Create: `packages/widgets/notes/src/index.ts`
- Create: `packages/widgets/notes/src/view.tsx`

- [ ] **Step 1: Create directory + files**

```bash
mkdir -p packages/widgets/notes/src
```

`packages/widgets/notes/package.json`:

```json
{
  "name": "@dashboard/widget-notes",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": { ".": "./dist/index.js" },
  "scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run --passWithNoTests" },
  "dependencies": {
    "@dashboard/core": "workspace:*",
    "zod": "3.23.8"
  },
  "peerDependencies": { "react": "^19.0.0" },
  "devDependencies": {
    "@types/react": "19.0.2",
    "typescript": "5.7.2",
    "vitest": "2.1.8"
  }
}
```

`packages/widgets/notes/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Write `src/view.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'

export interface NotesConfig {
  instanceId: string
  title?: string
}

interface NotesState {
  text: string
}

const stateUrl = (id: string) => `/api/widgets/${id}/state`

export const NotesView = ({ config }: { config: NotesConfig; data: undefined }) => {
  const [text, setText] = useState('')
  const [version, setVersion] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(stateUrl(config.instanceId))
      if (res.status === 404) return
      if (!res.ok) return
      const j = (await res.json()) as { version: number; data: NotesState }
      if (!cancelled) {
        setText(j.data.text)
        setVersion(j.version)
      }
    })()
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [config.instanceId])

  const schedule = (next: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void persist(next), 500)
  }

  const persist = async (next: string) => {
    const body: { widgetId: string; data: NotesState; expectedVersion?: number } = {
      widgetId: 'notes',
      data: { text: next },
    }
    if (version > 0) body.expectedVersion = version
    const res = await fetch(stateUrl(config.instanceId), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const j = (await res.json()) as { version: number }
      setVersion(j.version)
    }
  }

  return (
    <div className="flex h-full flex-col p-3">
      <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
        {config.title ?? 'Notes'}
      </div>
      <textarea
        className="mt-2 flex-1 resize-none rounded-md border border-[var(--text-dim)]/30 bg-white p-2 text-sm leading-relaxed"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          schedule(e.target.value)
        }}
        placeholder="Write something for the family…"
      />
    </div>
  )
}
```

- [ ] **Step 3: Write `src/index.ts`**

```ts
import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { NotesView } from './view'

const ConfigSchema = z.object({
  instanceId: z.string().min(1),
  title: z.string().optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'notes',
  name: 'Notes',
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  configSchema: ConfigSchema,
}

export default { ...definition, Render: NotesView }
```

- [ ] **Step 4: Install + build + commit**

```bash
pnpm install
pnpm --filter @dashboard/widget-notes build
git add packages/widgets/notes
git commit -m "feat(widget-notes): autosaving family notepad"
```

### Task 21: Register notes + add to scene

**Files:**

- Modify: `packages/dashboard/package.json`
- Modify: `packages/dashboard/src/widgets.ts`
- Modify: `packages/server/src/db/seed.ts`
- Modify: `packages/server/src/db/seed.test.ts`

- [ ] **Step 1: Register loader**

`packages/dashboard/package.json`:

```json
"@dashboard/widget-notes": "workspace:*"
```

`packages/dashboard/src/widgets.ts`:

```ts
registerWidgetLoader('notes', () =>
  import('@dashboard/widget-notes').then((m) => m.default),
)
```

- [ ] **Step 2: Append notes cell to seed**

```ts
{
  instanceId: 'notes-1',
  widgetId: 'notes',
  x: 0,
  y: 10,
  w: 5,
  h: 2,
  config: { instanceId: 'notes-1', title: 'Notes' },
},
```

- [ ] **Step 3: Update seed test**

Append:

```ts
expect.objectContaining({ widgetId: 'notes' }),
```

- [ ] **Step 4: Install + build + test**

```bash
pnpm install
pnpm --filter @dashboard/widget-notes build
pnpm --filter @dashboard/dashboard build
pnpm --filter @dashboard/server test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server packages/dashboard
git commit -m "feat(notes): register notes widget + add to scene"
```

---

## Phase 7: Packages Widget

### Task 22: Packages widget package

**Files:**

- Create: `packages/widgets/packages/package.json`
- Create: `packages/widgets/packages/tsconfig.json`
- Create: `packages/widgets/packages/src/index.ts`
- Create: `packages/widgets/packages/src/view.tsx`

- [ ] **Step 1: Create directory + files**

```bash
mkdir -p packages/widgets/packages/src
```

`packages/widgets/packages/package.json`:

```json
{
  "name": "@dashboard/widget-packages",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": { ".": "./dist/index.js" },
  "scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run --passWithNoTests" },
  "dependencies": {
    "@dashboard/core": "workspace:*",
    "zod": "3.23.8"
  },
  "peerDependencies": { "react": "^19.0.0" },
  "devDependencies": {
    "@types/react": "19.0.2",
    "typescript": "5.7.2",
    "vitest": "2.1.8"
  }
}
```

`packages/widgets/packages/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Write `src/view.tsx`**

```tsx
import { useEffect, useState } from 'react'

export interface PackagesConfig {
  instanceId: string
  title?: string
}

interface Pkg {
  id: string
  label: string
  expectedDate: string
  arrived: boolean
}

interface PackagesState {
  items: Pkg[]
}

const stateUrl = (id: string) => `/api/widgets/${id}/state`

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const PackagesView = ({ config }: { config: PackagesConfig; data: undefined }) => {
  const [state, setState] = useState<PackagesState>({ items: [] })
  const [version, setVersion] = useState(0)
  const [label, setLabel] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(stateUrl(config.instanceId))
      if (res.status === 404) return
      if (!res.ok) return
      const j = (await res.json()) as { version: number; data: PackagesState }
      if (!cancelled) {
        setState(j.data)
        setVersion(j.version)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [config.instanceId])

  const persist = async (next: PackagesState) => {
    setState(next)
    const body: { widgetId: string; data: PackagesState; expectedVersion?: number } = {
      widgetId: 'packages',
      data: next,
    }
    if (version > 0) body.expectedVersion = version
    const res = await fetch(stateUrl(config.instanceId), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const j = (await res.json()) as { version: number }
      setVersion(j.version)
    }
  }

  const add = () => {
    if (!label.trim() || !date) return
    void persist({
      items: [
        ...state.items,
        { id: newId(), label: label.trim(), expectedDate: date, arrived: false },
      ],
    })
    setLabel('')
    setDate('')
  }

  const toggle = (id: string) => {
    void persist({
      items: state.items.map((p) => (p.id === id ? { ...p, arrived: !p.arrived } : p)),
    })
  }

  const remove = (id: string) => {
    void persist({ items: state.items.filter((p) => p.id !== id) })
  }

  return (
    <div className="flex h-full flex-col p-3">
      <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
        {config.title ?? 'Packages'}
      </div>
      <div className="mt-2 flex flex-1 flex-col gap-1 overflow-y-auto">
        {state.items.map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={p.arrived}
              onChange={() => toggle(p.id)}
              className="h-4 w-4"
            />
            <span className={p.arrived ? 'flex-1 text-[var(--text-dim)] line-through' : 'flex-1'}>
              {p.label}
            </span>
            <span className="text-xs text-[var(--text-dim)]">{p.expectedDate}</span>
            <button
              type="button"
              onClick={() => remove(p.id)}
              className="text-[10px] text-[var(--text-dim)] underline"
            >
              remove
            </button>
          </div>
        ))}
        {state.items.length === 0 ? (
          <div className="text-xs text-[var(--text-dim)]">No deliveries tracked.</div>
        ) : null}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="mt-2 flex gap-2"
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What"
          className="flex-1 rounded-md border border-[var(--text-dim)]/30 bg-white px-2 py-1 text-sm"
        />
        <input
          value={date}
          onChange={(e) => setDate(e.target.value)}
          type="date"
          className="rounded-md border border-[var(--text-dim)]/30 bg-white px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="rounded-md px-3 py-1 text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          Add
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Write `src/index.ts`**

```ts
import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { PackagesView } from './view'

const ConfigSchema = z.object({
  instanceId: z.string().min(1),
  title: z.string().optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'packages',
  name: 'Packages',
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  configSchema: ConfigSchema,
}

export default { ...definition, Render: PackagesView }
```

- [ ] **Step 4: Install + build + commit**

```bash
pnpm install
pnpm --filter @dashboard/widget-packages build
git add packages/widgets/packages
git commit -m "feat(widget-packages): manually-tracked delivery list"
```

### Task 23: Register packages + add to scene

**Files:**

- Modify: `packages/dashboard/package.json`
- Modify: `packages/dashboard/src/widgets.ts`
- Modify: `packages/server/src/db/seed.ts`
- Modify: `packages/server/src/db/seed.test.ts`

- [ ] **Step 1: Register loader**

`packages/dashboard/package.json`:

```json
"@dashboard/widget-packages": "workspace:*"
```

`packages/dashboard/src/widgets.ts`:

```ts
registerWidgetLoader('packages', () =>
  import('@dashboard/widget-packages').then((m) => m.default),
)
```

- [ ] **Step 2: Append packages cell to seed**

```ts
{
  instanceId: 'packages-1',
  widgetId: 'packages',
  x: 5,
  y: 10,
  w: 3,
  h: 2,
  config: { instanceId: 'packages-1', title: 'Packages' },
},
```

- [ ] **Step 3: Update seed test**

Append:

```ts
expect.objectContaining({ widgetId: 'packages' }),
```

- [ ] **Step 4: Install + build + test**

```bash
pnpm install
pnpm --filter @dashboard/widget-packages build
pnpm --filter @dashboard/dashboard build
pnpm --filter @dashboard/server test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server packages/dashboard
git commit -m "feat(packages): register packages widget + add to scene"
```

---

## Phase 8: Final Integration

### Task 24: Full build + lint + smoke + tag

- [ ] **Step 1: Run everything**

```bash
pnpm install
pnpm -r build
pnpm -r test
pnpm lint
```

Expected: all green. The default scene now has 9 widget cells (clock, weather, agenda, calendar, slideshow, chores, meal-plan, notes, packages).

- [ ] **Step 2: Manual kiosk launch**

```bash
rm -rf packages/server/data
PORT=3030 pnpm --filter @dashboard/server start
```

Then visit `http://localhost:3030`. Expected: clock ticks, weather populates within 60s, agenda + calendar render (empty until OAuth completes), chores/meal-plan/notes/packages are interactive, slideshow shows "No photos yet" until OAuth + album configured.

- [ ] **Step 3: Tag**

```bash
git tag -a v0.2.0-widget-pack -m "Widget pack: weather, agenda, slideshow, chores, meal-plan, notes, packages"
```

- [ ] **Step 4: Done.**

---

## Notes for Plan 3 (Admin UI)

- Stateful widgets (chores, meal-plan, notes, packages) currently take `instanceId` via their config. Plan 3's scene editor needs to ensure that when a widget is dropped onto the grid, a new unique instanceId is generated and stored in both `widget_configs` and the layout JSON.
- The weather widget config needs a "pick location" UI (lat/lon picker via browser geolocation).
- The slideshow config needs an "album picker" UI that hits `/api/google/photos/albums` — that route does not exist yet and is part of Plan 3 (admin needs OAuth + album list).
- The `useWidgetState` hook in `packages/dashboard/src/hooks/` is currently dashboard-local; if the admin needs to read widget state (e.g. for an "export chores" feature), promote it to `@dashboard/ui`.
