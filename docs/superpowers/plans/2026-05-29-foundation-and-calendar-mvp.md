# Foundation & Calendar MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a pnpm/TypeScript monorepo with a Fastify server, SQLite via Drizzle, Google Calendar two-way sync, a React dashboard SPA, and two working widgets (Clock, Calendar). End state: launch the server on a Mac or Pi, point Chromium at `localhost:3000`, see the family calendar pulling and pushing to Google.

**Architecture:** pnpm monorepo with `core`, `server`, `ui`, `dashboard`, `widgets/*` packages. Server is Fastify + Drizzle + better-sqlite3 + native WebSocket. Dashboard is React 19 + Vite + Tailwind v4, connecting via WS for live updates. Widgets are TypeScript modules with backend + render halves; the server-side registry walks the widgets directory and runs each widget's `backend.run` on a cron interval, publishing results over WS keyed by widget instance.

**Tech Stack:** TypeScript (strict ESM), pnpm 9, Node 22, Fastify 5, Drizzle ORM, better-sqlite3, Zod, React 19, Vite 6, Tailwind v4, Zustand, TanStack Query, googleapis, libsodium-wrappers, Vitest, Playwright, Biome.

---

## Repo / File Plan

This plan creates and modifies these files. Each task touches one focused area.

- Root: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `.gitignore`, `.nvmrc`, `README.md`
- `packages/core/` — types, Zod schemas, widget contract
- `packages/server/` — Fastify app, DB schema, OAuth, sync engines, widget registry, WS broker
- `packages/ui/` — Tailwind preset + theme tokens + shared React primitives
- `packages/dashboard/` — Vite-built kiosk SPA
- `packages/widgets/clock/`
- `packages/widgets/calendar/`

Each package has its own `package.json` and `tsconfig.json`.

---

## Phase 0: Repo Bootstrap

### Task 1: Initialize git and root files

**Files:**

- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `README.md`
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `biome.json`

- [ ] **Step 1: Initialize git repo**

```bash
cd /Users/kelliott/Dev/dashboard
git init
git branch -M main
```

- [ ] **Step 2: Write `.gitignore`**

```gitignore
node_modules/
dist/
build/
.turbo/
*.log
.DS_Store
.env
.env.local
coverage/
.superpowers/
.cspell.json
/data/
/var/
```

- [ ] **Step 3: Write `.nvmrc`**

```text
22
```

- [ ] **Step 4: Write `README.md`**

```markdown
# Dashboard

Self-hosted family dashboard for Raspberry Pi 4 + 18.5" touchscreen.

See `docs/superpowers/specs/2026-05-29-family-dashboard-design.md` for the design.

## Dev

    pnpm install
    pnpm -r build
    pnpm --filter @dashboard/server dev
```

- [ ] **Step 5: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
  - 'packages/widgets/*'
```

- [ ] **Step 6: Write root `package.json`**

```json
{
  "name": "dashboard",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "biome check .",
    "format": "biome format --write ."
  },
  "devDependencies": {
    "@biomejs/biome": "1.9.4",
    "typescript": "5.7.2"
  }
}
```

- [ ] **Step 7: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 8: Write `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignoreUnknown": false, "ignore": ["dist", "build", "coverage"] },
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": { "quoteStyle": "single", "semicolons": "asNeeded", "trailingCommas": "all" }
  }
}
```

- [ ] **Step 9: Install root deps**

Run: `pnpm install`

Expected: lockfile generated, devDependencies installed.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "chore: scaffold pnpm workspace, biome, base tsconfig"
```

---

## Phase 1: Core Package

### Task 2: Create `@dashboard/core` package

**Files:**

- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Create directory and `package.json`**

```bash
mkdir -p packages/core/src
```

`packages/core/package.json`:

```json
{
  "name": "@dashboard/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "dev": "tsc -p tsconfig.json --watch"
  },
  "dependencies": {
    "zod": "3.23.8"
  },
  "devDependencies": {
    "typescript": "5.7.2",
    "vitest": "2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create placeholder `src/index.ts`**

```ts
export {}
```

- [ ] **Step 4: Install**

Run: `pnpm install`

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): scaffold core package"
```

### Task 3: Define widget contract types

**Files:**

- Create: `packages/core/src/widget.ts`
- Create: `packages/core/src/widget.test.ts`

- [ ] **Step 1: Write failing test**

`packages/core/src/widget.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { WidgetSizeSchema } from './widget'

describe('WidgetSize', () => {
  it('accepts integers 1..12 for w/h', () => {
    expect(WidgetSizeSchema.parse({ w: 4, h: 3 })).toEqual({ w: 4, h: 3 })
  })

  it('rejects w out of range', () => {
    expect(() => WidgetSizeSchema.parse({ w: 0, h: 3 })).toThrow()
    expect(() => WidgetSizeSchema.parse({ w: 9, h: 3 })).toThrow()
  })

  it('rejects non-integers', () => {
    expect(() => WidgetSizeSchema.parse({ w: 1.5, h: 2 })).toThrow()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @dashboard/core test -- src/widget.test.ts`
Expected: FAIL — `./widget` does not exist.

- [ ] **Step 3: Implement `widget.ts`**

```ts
import { z } from 'zod'

export const WidgetSizeSchema = z.object({
  w: z.number().int().min(1).max(8),
  h: z.number().int().min(1).max(12),
})

export type WidgetSize = z.infer<typeof WidgetSizeSchema>

export interface WidgetBackendContext {
  instanceId: string
  config: unknown
  publish: (payload: unknown) => void
  now: () => Date
}

export interface WidgetBackend {
  intervalMs: number
  run: (ctx: WidgetBackendContext) => Promise<void>
}

export interface WidgetDefinition<TConfig = unknown, TData = unknown> {
  id: string
  name: string
  defaultSize: WidgetSize
  minSize: WidgetSize
  configSchema: import('zod').ZodType<TConfig>
  backend?: WidgetBackend
}
```

Note: `Render` and `AdminPanel` React components live in browser-only entrypoints, not here, so the server doesn't load React.

- [ ] **Step 4: Re-run test**

Run: `pnpm --filter @dashboard/core test -- src/widget.test.ts`
Expected: PASS.

- [ ] **Step 5: Export from `src/index.ts`**

Replace `src/index.ts` with:

```ts
export * from './widget'
```

- [ ] **Step 6: Build**

Run: `pnpm --filter @dashboard/core build`
Expected: `dist/` populated with `.js` and `.d.ts`.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): widget contract types and size schema"
```

### Task 4: Define Scene and Layout schemas

**Files:**

- Create: `packages/core/src/scene.ts`
- Create: `packages/core/src/scene.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing test**

`packages/core/src/scene.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { LayoutCellSchema, SceneSchema } from './scene'

describe('Scene schemas', () => {
  it('accepts a valid scene', () => {
    const scene = {
      id: 's1',
      name: 'Active',
      isDefault: true,
      cells: [
        {
          instanceId: 'i1',
          widgetId: 'clock',
          x: 0,
          y: 0,
          w: 8,
          h: 1,
          config: {},
        },
      ],
    }
    expect(SceneSchema.parse(scene).name).toBe('Active')
  })

  it('rejects out-of-bounds cells', () => {
    expect(() =>
      LayoutCellSchema.parse({
        instanceId: 'a',
        widgetId: 'clock',
        x: 7,
        y: 0,
        w: 4,
        h: 1,
        config: {},
      }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @dashboard/core test -- src/scene.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `scene.ts`**

```ts
import { z } from 'zod'

export const GRID_COLS = 8
export const GRID_ROWS = 12

export const LayoutCellSchema = z
  .object({
    instanceId: z.string().min(1),
    widgetId: z.string().min(1),
    x: z.number().int().min(0).max(GRID_COLS - 1),
    y: z.number().int().min(0).max(GRID_ROWS - 1),
    w: z.number().int().min(1).max(GRID_COLS),
    h: z.number().int().min(1).max(GRID_ROWS),
    config: z.unknown(),
  })
  .refine((c) => c.x + c.w <= GRID_COLS, { message: 'cell exceeds grid width' })
  .refine((c) => c.y + c.h <= GRID_ROWS, { message: 'cell exceeds grid height' })

export type LayoutCell = z.infer<typeof LayoutCellSchema>

export const SceneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isDefault: z.boolean().default(false),
  cells: z.array(LayoutCellSchema),
})

export type Scene = z.infer<typeof SceneSchema>
```

- [ ] **Step 4: Re-run test**

Run: `pnpm --filter @dashboard/core test`
Expected: all tests PASS.

- [ ] **Step 5: Update `src/index.ts`**

```ts
export * from './widget'
export * from './scene'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): Scene + LayoutCell schemas with bounds validation"
```

### Task 5: Define WebSocket message types

**Files:**

- Create: `packages/core/src/ws.ts`
- Create: `packages/core/src/ws.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing test**

`packages/core/src/ws.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ServerMessageSchema } from './ws'

describe('ServerMessage', () => {
  it('parses widget:data', () => {
    const msg = ServerMessageSchema.parse({
      type: 'widget:data',
      instanceId: 'cal1',
      payload: { events: [] },
    })
    expect(msg.type).toBe('widget:data')
  })

  it('parses scene:updated', () => {
    const msg = ServerMessageSchema.parse({ type: 'scene:updated', sceneId: 's1' })
    expect(msg.type).toBe('scene:updated')
  })

  it('rejects unknown types', () => {
    expect(() => ServerMessageSchema.parse({ type: 'nope' })).toThrow()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @dashboard/core test -- src/ws.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `ws.ts`**

```ts
import { z } from 'zod'

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('widget:data'),
    instanceId: z.string(),
    payload: z.unknown(),
  }),
  z.object({
    type: z.literal('scene:updated'),
    sceneId: z.string(),
  }),
  z.object({
    type: z.literal('scene:active'),
    sceneId: z.string(),
  }),
  z.object({
    type: z.literal('calendar:changed'),
  }),
])

export type ServerMessage = z.infer<typeof ServerMessageSchema>

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe') }),
])

export type ClientMessage = z.infer<typeof ClientMessageSchema>
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm --filter @dashboard/core test`
Expected: PASS.

- [ ] **Step 5: Export from index**

```ts
export * from './widget'
export * from './scene'
export * from './ws'
```

- [ ] **Step 6: Build and commit**

```bash
pnpm --filter @dashboard/core build
git add packages/core
git commit -m "feat(core): WS message schemas"
```

---

## Phase 2: Server Foundation

### Task 6: Scaffold `@dashboard/server` package

**Files:**

- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/index.ts`

- [ ] **Step 1: Create directory and `package.json`**

```bash
mkdir -p packages/server/src
```

`packages/server/package.json`:

```json
{
  "name": "@dashboard/server",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@dashboard/core": "workspace:*",
    "@fastify/static": "8.0.3",
    "@fastify/websocket": "11.0.1",
    "better-sqlite3": "11.7.0",
    "drizzle-orm": "0.38.2",
    "fastify": "5.2.0",
    "googleapis": "144.0.0",
    "libsodium-wrappers": "0.7.15",
    "node-cron": "3.0.3",
    "pino-pretty": "13.0.0",
    "undici": "7.1.1",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "7.6.12",
    "@types/libsodium-wrappers": "0.7.14",
    "@types/node": "22.10.2",
    "@types/node-cron": "3.0.11",
    "drizzle-kit": "0.30.1",
    "tsx": "4.19.2",
    "typescript": "5.7.2",
    "vitest": "2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create placeholder `src/index.ts`**

```ts
console.log('dashboard server')
```

- [ ] **Step 4: Install and verify**

Run: `pnpm install`
Run: `pnpm --filter @dashboard/server build`
Expected: no errors, `dist/index.js` created.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): scaffold server package"
```

### Task 7: Add config loader

**Files:**

- Create: `packages/server/src/config.ts`
- Create: `packages/server/src/config.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

describe('loadConfig', () => {
  it('uses defaults when env empty', () => {
    const c = loadConfig({})
    expect(c.port).toBe(3000)
    expect(c.host).toBe('0.0.0.0')
  })

  it('overrides from env', () => {
    const c = loadConfig({ PORT: '4000', DATA_DIR: '/tmp/d' })
    expect(c.port).toBe(4000)
    expect(c.dataDir).toBe('/tmp/d')
  })

  it('rejects non-numeric PORT', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @dashboard/server test -- src/config.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { z } from 'zod'

const Schema = z.object({
  port: z.coerce.number().int().positive().default(3000),
  host: z.string().default('0.0.0.0'),
  dataDir: z.string().default('./data'),
  googleClientId: z.string().optional(),
  googleClientSecret: z.string().optional(),
})

export type Config = z.infer<typeof Schema>

export const loadConfig = (env: NodeJS.ProcessEnv | Record<string, string | undefined>): Config =>
  Schema.parse({
    port: env.PORT,
    host: env.HOST,
    dataDir: env.DATA_DIR,
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
  })
```

- [ ] **Step 4: Run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): typed config loader"
```

### Task 8: Add Drizzle schema for all tables

**Files:**

- Create: `packages/server/src/db/schema.ts`
- Create: `packages/server/drizzle.config.ts`

- [ ] **Step 1: Create `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: './data/dashboard.db' },
})
```

- [ ] **Step 2: Write `src/db/schema.ts`**

```ts
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
```

- [ ] **Step 3: Generate initial migration**

```bash
mkdir -p packages/server/data
cd packages/server
pnpm exec drizzle-kit generate --name=init
cd ../..
```

Expected: `packages/server/drizzle/0000_init.sql` created.

- [ ] **Step 4: Commit**

```bash
git add packages/server
git commit -m "feat(server): drizzle schema for all tables + initial migration"
```

### Task 9: Add DB connection helper

**Files:**

- Create: `packages/server/src/db/index.ts`
- Create: `packages/server/src/db/index.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './index'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dashboard-test-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('openDatabase', () => {
  it('creates the sqlite file and runs migrations', () => {
    const { db, close, path } = openDatabase(dir)
    expect(path).toBe(join(dir, 'dashboard.db'))
    const tables = db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    )
    const names = tables.map((t) => t.name)
    expect(names).toContain('accounts')
    expect(names).toContain('scenes')
    close()
  })

  it('enables WAL mode', () => {
    const { db, close } = openDatabase(dir)
    const mode = db.get<{ journal_mode: string }>('PRAGMA journal_mode')
    expect(mode?.journal_mode).toBe('wal')
    close()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @dashboard/server test -- src/db/index.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import * as schema from './schema'

export interface DatabaseHandle {
  db: {
    drizzle: ReturnType<typeof drizzle<typeof schema>>
    all: <T = unknown>(sql: string) => T[]
    get: <T = unknown>(sql: string) => T | undefined
    raw: Database.Database
  }
  close: () => void
  path: string
}

export const openDatabase = (dataDir: string): DatabaseHandle => {
  mkdirSync(dataDir, { recursive: true })
  const path = join(dataDir, 'dashboard.db')
  const raw = new Database(path)
  raw.pragma('journal_mode = WAL')
  raw.pragma('busy_timeout = 5000')
  raw.pragma('foreign_keys = ON')

  const d = drizzle(raw, { schema })
  migrate(d, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname })

  return {
    db: {
      drizzle: d,
      all: (sql) => raw.prepare(sql).all() as never,
      get: (sql) => raw.prepare(sql).get() as never,
      raw,
    },
    close: () => raw.close(),
    path,
  }
}
```

- [ ] **Step 4: Run test**

Run: `pnpm --filter @dashboard/server test -- src/db/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): DB open helper with WAL + auto-migrate"
```

### Task 10: Add libsodium encryption helper

**Files:**

- Create: `packages/server/src/auth/encryption.ts`
- Create: `packages/server/src/auth/encryption.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { createEncryptor, deriveKey } from './encryption'

let key: Uint8Array

beforeAll(async () => {
  key = await deriveKey('machine-id-fixture', 'salt-fixture')
})

describe('encryption', () => {
  it('round-trips a string', async () => {
    const enc = await createEncryptor(key)
    const cipher = enc.encrypt('hello world')
    expect(cipher).not.toBe('hello world')
    expect(enc.decrypt(cipher)).toBe('hello world')
  })

  it('produces different ciphertext on repeat (nonce)', async () => {
    const enc = await createEncryptor(key)
    const a = enc.encrypt('x')
    const b = enc.encrypt('x')
    expect(a).not.toBe(b)
  })

  it('fails to decrypt tampered ciphertext', async () => {
    const enc = await createEncryptor(key)
    const cipher = enc.encrypt('x')
    const tampered = `${cipher.slice(0, -2)}AA`
    expect(() => enc.decrypt(tampered)).toThrow()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @dashboard/server test -- src/auth/encryption.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import _sodium from 'libsodium-wrappers'

const ready = _sodium.ready.then(() => _sodium)

export const deriveKey = async (machineId: string, salt: string): Promise<Uint8Array> => {
  const sodium = await ready
  const input = `${machineId}::${salt}`
  return sodium.crypto_generichash(sodium.crypto_secretbox_KEYBYTES, input)
}

export interface Encryptor {
  encrypt: (plaintext: string) => string
  decrypt: (cipherB64: string) => string
}

export const createEncryptor = async (key: Uint8Array): Promise<Encryptor> => {
  const sodium = await ready
  return {
    encrypt: (plaintext) => {
      const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
      const cipher = sodium.crypto_secretbox_easy(plaintext, nonce, key)
      const combined = new Uint8Array(nonce.length + cipher.length)
      combined.set(nonce, 0)
      combined.set(cipher, nonce.length)
      return sodium.to_base64(combined, sodium.base64_variants.ORIGINAL)
    },
    decrypt: (cipherB64) => {
      const combined = sodium.from_base64(cipherB64, sodium.base64_variants.ORIGINAL)
      const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES)
      const cipher = combined.slice(sodium.crypto_secretbox_NONCEBYTES)
      const opened = sodium.crypto_secretbox_open_easy(cipher, nonce, key)
      return sodium.to_string(opened)
    },
  }
}
```

- [ ] **Step 4: Run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): libsodium secretbox encryptor + machine-id key derivation"
```

### Task 11: Fastify app skeleton with health route

**Files:**

- Create: `packages/server/src/app.ts`
- Create: `packages/server/src/app.test.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest'
import { buildApp } from './app'

describe('app', () => {
  it('GET /api/health returns ok', async () => {
    const app = await buildApp({ dataDir: ':memory-test:' })
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    await app.close()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @dashboard/server test -- src/app.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement minimum viable `app.ts`**

```ts
import Fastify from 'fastify'

export interface AppOptions {
  dataDir: string
}

export const buildApp = async (_opts: AppOptions) => {
  const app = Fastify({ logger: { transport: { target: 'pino-pretty' } } })

  app.get('/api/health', async () => ({ status: 'ok' }))

  return app
}
```

- [ ] **Step 4: Run test**

Expected: PASS.

- [ ] **Step 5: Wire `src/index.ts`**

```ts
import { buildApp } from './app'
import { loadConfig } from './config'

const config = loadConfig(process.env)
const app = await buildApp({ dataDir: config.dataDir })

await app.listen({ port: config.port, host: config.host })
```

- [ ] **Step 6: Smoke test**

```bash
pnpm --filter @dashboard/server build
pnpm --filter @dashboard/server start &
sleep 1
curl -s http://localhost:3000/api/health
kill %1
```

Expected: `{"status":"ok"}`.

- [ ] **Step 7: Commit**

```bash
git add packages/server
git commit -m "feat(server): fastify skeleton with health route"
```

### Task 12: Add WebSocket broker

**Files:**

- Create: `packages/server/src/ws/broker.ts`
- Create: `packages/server/src/ws/broker.test.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Write failing test**

```ts
import type { ServerMessage } from '@dashboard/core'
import { describe, expect, it } from 'vitest'
import { createBroker } from './broker'

describe('broker', () => {
  it('delivers messages to all subscribers', () => {
    const broker = createBroker()
    const received: ServerMessage[] = []
    const unsub = broker.subscribe((m) => received.push(m))

    broker.publish({ type: 'calendar:changed' })
    broker.publish({ type: 'scene:active', sceneId: 's1' })

    expect(received).toHaveLength(2)
    expect(received[0]?.type).toBe('calendar:changed')

    unsub()
    broker.publish({ type: 'calendar:changed' })
    expect(received).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @dashboard/server test -- src/ws/broker.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type { ServerMessage } from '@dashboard/core'

type Listener = (m: ServerMessage) => void

export interface Broker {
  publish: (m: ServerMessage) => void
  subscribe: (l: Listener) => () => void
  size: () => number
}

export const createBroker = (): Broker => {
  const listeners = new Set<Listener>()
  return {
    publish: (m) => {
      for (const l of listeners) l(m)
    },
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    size: () => listeners.size,
  }
}
```

- [ ] **Step 4: Run test**

Expected: PASS.

- [ ] **Step 5: Wire `/ws` route in app**

Edit `packages/server/src/app.ts`:

```ts
import { ClientMessageSchema, type ServerMessage } from '@dashboard/core'
import websocket from '@fastify/websocket'
import Fastify from 'fastify'
import { createBroker } from './ws/broker'

export interface AppOptions {
  dataDir: string
}

export const buildApp = async (_opts: AppOptions) => {
  const app = Fastify({ logger: { transport: { target: 'pino-pretty' } } })
  const broker = createBroker()

  await app.register(websocket)

  app.get('/api/health', async () => ({ status: 'ok' }))

  app.get('/ws', { websocket: true }, (socket) => {
    const send = (m: ServerMessage) => socket.send(JSON.stringify(m))
    const unsub = broker.subscribe(send)
    socket.on('message', (raw) => {
      try {
        ClientMessageSchema.parse(JSON.parse(raw.toString()))
      } catch {
        // ignore malformed
      }
    })
    socket.on('close', unsub)
  })

  app.decorate('broker', broker)
  return app
}

declare module 'fastify' {
  interface FastifyInstance {
    broker: ReturnType<typeof createBroker>
  }
}
```

- [ ] **Step 6: Smoke test from a script**

Create `packages/server/scripts/ws-smoke.ts`:

```ts
import { buildApp } from '../src/app'

const app = await buildApp({ dataDir: './data' })
await app.listen({ port: 3001 })

const WS = (await import('undici')).WebSocket
const ws = new WS('ws://localhost:3001/ws')
ws.addEventListener('open', () => {
  app.broker.publish({ type: 'calendar:changed' })
})
ws.addEventListener('message', (e) => {
  console.log('received', e.data)
  ws.close()
  app.close().then(() => process.exit(0))
})
```

Run: `pnpm --filter @dashboard/server exec tsx scripts/ws-smoke.ts`
Expected: `received {"type":"calendar:changed"}`.

- [ ] **Step 7: Commit**

```bash
git add packages/server
git commit -m "feat(server): WS broker + /ws route"
```

### Task 13: Add cron scheduler with Vitest fake timers

**Files:**

- Create: `packages/server/src/scheduler.ts`
- Create: `packages/server/src/scheduler.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScheduler } from './scheduler'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('scheduler', () => {
  it('runs job at interval', async () => {
    const calls: number[] = []
    const s = createScheduler()
    s.every(1000, () => calls.push(Date.now()))
    await vi.advanceTimersByTimeAsync(3500)
    expect(calls.length).toBeGreaterThanOrEqual(3)
  })

  it('stop() cancels all jobs', async () => {
    const calls: number[] = []
    const s = createScheduler()
    s.every(500, () => calls.push(1))
    s.stop()
    await vi.advanceTimersByTimeAsync(2000)
    expect(calls).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
type Job = () => void | Promise<void>

export interface Scheduler {
  every: (intervalMs: number, job: Job) => void
  stop: () => void
}

export const createScheduler = (): Scheduler => {
  const timers: NodeJS.Timeout[] = []
  return {
    every: (intervalMs, job) => {
      const t = setInterval(() => {
        try {
          void job()
        } catch (err) {
          console.error('scheduled job failed', err)
        }
      }, intervalMs)
      timers.push(t)
    },
    stop: () => {
      for (const t of timers) clearInterval(t)
      timers.length = 0
    },
  }
}
```

- [ ] **Step 4: Run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): interval scheduler"
```

---

## Phase 3: Google OAuth + Calendar Sync

### Task 14: Google OAuth device flow

**Files:**

- Create: `packages/server/src/auth/google.ts`
- Create: `packages/server/src/auth/google.test.ts`

- [ ] **Step 1: Write failing test (mocking googleapis)**

```ts
import { describe, expect, it, vi } from 'vitest'
import { startDeviceFlow } from './google'

vi.mock('undici', () => ({
  fetch: vi.fn(async (url: string) => {
    if (url.includes('device/code')) {
      return new Response(
        JSON.stringify({
          device_code: 'DEV',
          user_code: 'USER1',
          verification_url: 'https://google.com/device',
          expires_in: 1800,
          interval: 5,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response('not found', { status: 404 })
  }),
}))

describe('startDeviceFlow', () => {
  it('returns the user code and verification URL', async () => {
    const res = await startDeviceFlow('cid')
    expect(res.userCode).toBe('USER1')
    expect(res.verificationUrl).toBe('https://google.com/device')
    expect(res.deviceCode).toBe('DEV')
  })
})
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { fetch } from 'undici'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/photoslibrary.readonly',
].join(' ')

export interface DeviceFlowStart {
  deviceCode: string
  userCode: string
  verificationUrl: string
  intervalSeconds: number
  expiresAt: number
}

export const startDeviceFlow = async (clientId: string): Promise<DeviceFlowStart> => {
  const res = await fetch('https://oauth2.googleapis.com/device/code', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, scope: SCOPES }),
  })
  if (!res.ok) throw new Error(`device flow start failed: ${res.status}`)
  const j = (await res.json()) as {
    device_code: string
    user_code: string
    verification_url: string
    expires_in: number
    interval: number
  }
  return {
    deviceCode: j.device_code,
    userCode: j.user_code,
    verificationUrl: j.verification_url,
    intervalSeconds: j.interval,
    expiresAt: Date.now() + j.expires_in * 1000,
  }
}

export interface DeviceFlowTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export const pollDeviceFlow = async (
  clientId: string,
  clientSecret: string,
  deviceCode: string,
): Promise<DeviceFlowTokens | 'pending' | 'denied' | 'expired'> => {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  })
  const j = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
  }
  if (j.access_token && j.refresh_token && j.expires_in) {
    return {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: Date.now() + j.expires_in * 1000,
    }
  }
  if (j.error === 'authorization_pending' || j.error === 'slow_down') return 'pending'
  if (j.error === 'access_denied') return 'denied'
  if (j.error === 'expired_token') return 'expired'
  throw new Error(`device flow poll failed: ${JSON.stringify(j)}`)
}

export const refreshAccessToken = async (
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: number }> => {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`refresh failed: ${res.status}`)
  const j = (await res.json()) as { access_token: string; expires_in: number }
  return { accessToken: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 }
}
```

- [ ] **Step 4: Run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): Google OAuth device flow + refresh helpers"
```

### Task 15: Token cache with auto-refresh

**Files:**

- Create: `packages/server/src/auth/token-cache.ts`
- Create: `packages/server/src/auth/token-cache.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createTokenCache } from './token-cache'

describe('TokenCache', () => {
  it('returns cached token while fresh', async () => {
    const refresh = vi.fn(async () => ({ accessToken: 'A1', expiresAt: Date.now() + 60_000 }))
    const cache = createTokenCache(refresh)
    await cache.get('rt')
    await cache.get('rt')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes when expired', async () => {
    let n = 0
    const refresh = vi.fn(async () => ({
      accessToken: `A${++n}`,
      expiresAt: Date.now() - 1000,
    }))
    const cache = createTokenCache(refresh)
    expect(await cache.get('rt')).toBe('A1')
    expect(await cache.get('rt')).toBe('A2')
  })
})
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
type Refresh = (refreshToken: string) => Promise<{ accessToken: string; expiresAt: number }>

export interface TokenCache {
  get: (refreshToken: string) => Promise<string>
}

export const createTokenCache = (refresh: Refresh, skewMs = 30_000): TokenCache => {
  const map = new Map<string, { token: string; expiresAt: number }>()
  return {
    get: async (rt) => {
      const cached = map.get(rt)
      if (cached && cached.expiresAt - skewMs > Date.now()) return cached.token
      const { accessToken, expiresAt } = await refresh(rt)
      map.set(rt, { token: accessToken, expiresAt })
      return accessToken
    },
  }
}
```

- [ ] **Step 4: Run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): access-token cache with skew-aware refresh"
```

### Task 16: Google Calendar list + events fetchers

**Files:**

- Create: `packages/server/src/sync/google-client.ts`
- Create: `packages/server/src/sync/google-client.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listCalendars, listEvents } from './google-client'

const fetchMock = vi.fn()
vi.mock('undici', () => ({ fetch: (...a: unknown[]) => fetchMock(...a) }))

afterEach(() => fetchMock.mockReset())

describe('listCalendars', () => {
  it('returns calendar items', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: 'c1', summary: 'Mom' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const out = await listCalendars('TOKEN')
    expect(out).toEqual([{ id: 'c1', summary: 'Mom' }])
  })
})

describe('listEvents', () => {
  it('uses syncToken when provided', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ items: [], nextSyncToken: 'NEXT' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const out = await listEvents('TOKEN', 'c1', { syncToken: 'OLD' })
    expect(fetchMock.mock.calls[0]?.[0]).toContain('syncToken=OLD')
    expect(out.nextSyncToken).toBe('NEXT')
  })

  it('returns syncTokenInvalid on 410', async () => {
    fetchMock.mockResolvedValue(new Response('gone', { status: 410 }))
    const out = await listEvents('TOKEN', 'c1', { syncToken: 'X' })
    expect(out.syncTokenInvalid).toBe(true)
  })
})
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { fetch } from 'undici'

const API = 'https://www.googleapis.com/calendar/v3'

export interface CalendarSummary {
  id: string
  summary: string
}

export const listCalendars = async (accessToken: string): Promise<CalendarSummary[]> => {
  const res = await fetch(`${API}/users/me/calendarList?fields=items(id,summary)`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`listCalendars failed: ${res.status}`)
  const j = (await res.json()) as { items?: CalendarSummary[] }
  return j.items ?? []
}

export interface GoogleEvent {
  id: string
  etag: string
  status?: string
  summary?: string
  location?: string
  description?: string
  start?: { dateTime?: string; date?: string; timeZone?: string }
  end?: { dateTime?: string; date?: string; timeZone?: string }
  colorId?: string
}

export interface ListEventsResult {
  events: GoogleEvent[]
  nextSyncToken?: string
  nextPageToken?: string
  syncTokenInvalid?: boolean
}

export interface ListEventsArgs {
  syncToken?: string
  timeMin?: string
  timeMax?: string
  pageToken?: string
}

export const listEvents = async (
  accessToken: string,
  calendarId: string,
  args: ListEventsArgs,
): Promise<ListEventsResult> => {
  const params = new URLSearchParams({
    singleEvents: 'true',
    maxResults: '250',
    showDeleted: 'true',
  })
  if (args.syncToken) params.set('syncToken', args.syncToken)
  if (args.pageToken) params.set('pageToken', args.pageToken)
  if (!args.syncToken && args.timeMin) params.set('timeMin', args.timeMin)
  if (!args.syncToken && args.timeMax) params.set('timeMax', args.timeMax)

  const url = `${API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`
  const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } })
  if (res.status === 410) return { events: [], syncTokenInvalid: true }
  if (!res.ok) throw new Error(`listEvents failed: ${res.status}`)
  const j = (await res.json()) as {
    items?: GoogleEvent[]
    nextSyncToken?: string
    nextPageToken?: string
  }
  return {
    events: j.items ?? [],
    nextSyncToken: j.nextSyncToken,
    nextPageToken: j.nextPageToken,
  }
}

export interface EventWrite {
  summary: string
  description?: string
  location?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  colorId?: string
}

export const insertEvent = async (
  accessToken: string,
  calendarId: string,
  body: EventWrite,
): Promise<GoogleEvent> => {
  const res = await fetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`insertEvent failed: ${res.status}`)
  return (await res.json()) as GoogleEvent
}

export const updateEvent = async (
  accessToken: string,
  calendarId: string,
  eventId: string,
  etag: string,
  body: EventWrite,
): Promise<GoogleEvent | 'conflict'> => {
  const res = await fetch(
    `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'if-match': etag,
      },
      body: JSON.stringify(body),
    },
  )
  if (res.status === 412 || res.status === 409) return 'conflict'
  if (!res.ok) throw new Error(`updateEvent failed: ${res.status}`)
  return (await res.json()) as GoogleEvent
}

export const deleteEvent = async (
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> => {
  const res = await fetch(
    `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { authorization: `Bearer ${accessToken}` },
    },
  )
  if (res.status !== 204 && res.status !== 410) {
    throw new Error(`deleteEvent failed: ${res.status}`)
  }
}
```

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): Google Calendar HTTP client (list/insert/update/delete)"
```

### Task 17: Sync engine — apply events diff to cache

**Files:**

- Create: `packages/server/src/sync/calendar-sync.ts`
- Create: `packages/server/src/sync/calendar-sync.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest'
import { applyEventsDiff } from './calendar-sync'
import type { GoogleEvent } from './google-client'

const sample: GoogleEvent = {
  id: 'g1',
  etag: 'e1',
  summary: 'Lunch',
  start: { dateTime: '2026-05-29T12:00:00Z' },
  end: { dateTime: '2026-05-29T13:00:00Z' },
}

describe('applyEventsDiff', () => {
  it('upserts new events', () => {
    const cache = new Map()
    const result = applyEventsDiff(cache, 'c1', [sample], Date.now())
    expect(result.upserts).toBe(1)
    expect(cache.size).toBe(1)
  })

  it('removes events with status=cancelled', () => {
    const cache = new Map()
    applyEventsDiff(cache, 'c1', [sample], Date.now())
    const res = applyEventsDiff(
      cache,
      'c1',
      [{ ...sample, status: 'cancelled' }],
      Date.now(),
    )
    expect(res.deletes).toBe(1)
    expect(cache.size).toBe(0)
  })

  it('ignores events missing start/end', () => {
    const cache = new Map()
    const res = applyEventsDiff(cache, 'c1', [{ id: 'x', etag: 'e' }], Date.now())
    expect(res.upserts).toBe(0)
    expect(res.skipped).toBe(1)
  })
})
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type { GoogleEvent } from './google-client'

export interface CachedEvent {
  id: string
  calendarId: string
  googleEventId: string
  etag: string
  start: Date
  end: Date
  allDay: boolean
  title: string
  location: string | null
  description: string | null
  color: string | null
  lastSyncedAt: Date
}

export type EventsCacheMap = Map<string, CachedEvent>

const toDate = (s: GoogleEvent['start']): { date: Date; allDay: boolean } | null => {
  if (!s) return null
  if (s.dateTime) return { date: new Date(s.dateTime), allDay: false }
  if (s.date) return { date: new Date(`${s.date}T00:00:00Z`), allDay: true }
  return null
}

export interface DiffResult {
  upserts: number
  deletes: number
  skipped: number
}

export const cacheKey = (calendarId: string, eventId: string) => `${calendarId}::${eventId}`

export const applyEventsDiff = (
  cache: EventsCacheMap,
  calendarId: string,
  events: GoogleEvent[],
  syncedAt: number,
): DiffResult => {
  let upserts = 0
  let deletes = 0
  let skipped = 0
  for (const ev of events) {
    const key = cacheKey(calendarId, ev.id)
    if (ev.status === 'cancelled') {
      if (cache.delete(key)) deletes++
      continue
    }
    const start = toDate(ev.start)
    const end = toDate(ev.end)
    if (!start || !end) {
      skipped++
      continue
    }
    cache.set(key, {
      id: key,
      calendarId,
      googleEventId: ev.id,
      etag: ev.etag,
      start: start.date,
      end: end.date,
      allDay: start.allDay,
      title: ev.summary ?? '(no title)',
      location: ev.location ?? null,
      description: ev.description ?? null,
      color: ev.colorId ?? null,
      lastSyncedAt: new Date(syncedAt),
    })
    upserts++
  }
  return { upserts, deletes, skipped }
}
```

- [ ] **Step 4: Run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): event diff applier (pure, in-memory)"
```

### Task 18: Persist event diffs to SQLite

**Files:**

- Create: `packages/server/src/sync/calendar-repo.ts`
- Create: `packages/server/src/sync/calendar-repo.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import { upsertEvents, deleteEvent } from './calendar-repo'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cal-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('calendar-repo', () => {
  it('upserts and deletes events', () => {
    const { db, close } = openDatabase(dir)
    upsertEvents(db.raw, [
      {
        id: 'c1::g1',
        calendarId: 'c1',
        googleEventId: 'g1',
        etag: 'e1',
        start: new Date('2026-05-29T12:00:00Z'),
        end: new Date('2026-05-29T13:00:00Z'),
        allDay: false,
        title: 'lunch',
        location: null,
        description: null,
        color: null,
        lastSyncedAt: new Date(),
      },
    ])
    const rows = db.all<{ id: string }>('SELECT id FROM events_cache')
    expect(rows.map((r) => r.id)).toEqual(['c1::g1'])
    deleteEvent(db.raw, 'c1::g1')
    expect(db.all('SELECT id FROM events_cache')).toEqual([])
    close()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type Database from 'better-sqlite3'
import type { CachedEvent } from './calendar-sync'

export const upsertEvents = (db: Database.Database, events: CachedEvent[]) => {
  const stmt = db.prepare(`
    INSERT INTO events_cache
      (id, calendar_id, google_event_id, etag, start, end, all_day,
       title, location, description, color, last_synced_at)
    VALUES (@id, @calendarId, @googleEventId, @etag, @start, @end, @allDay,
            @title, @location, @description, @color, @lastSyncedAt)
    ON CONFLICT(id) DO UPDATE SET
      etag = excluded.etag,
      start = excluded.start,
      end = excluded.end,
      all_day = excluded.all_day,
      title = excluded.title,
      location = excluded.location,
      description = excluded.description,
      color = excluded.color,
      last_synced_at = excluded.last_synced_at,
      deleted_at = NULL
  `)
  const tx = db.transaction((rows: CachedEvent[]) => {
    for (const r of rows) {
      stmt.run({
        id: r.id,
        calendarId: r.calendarId,
        googleEventId: r.googleEventId,
        etag: r.etag,
        start: r.start.getTime(),
        end: r.end.getTime(),
        allDay: r.allDay ? 1 : 0,
        title: r.title,
        location: r.location,
        description: r.description,
        color: r.color,
        lastSyncedAt: r.lastSyncedAt.getTime(),
      })
    }
  })
  tx(events)
}

export const deleteEvent = (db: Database.Database, id: string) => {
  db.prepare('DELETE FROM events_cache WHERE id = ?').run(id)
}

export const setSyncToken = (db: Database.Database, calendarId: string, token: string | null) => {
  db.prepare('UPDATE calendars SET sync_token = ? WHERE id = ?').run(token, calendarId)
}

export const getSyncToken = (db: Database.Database, calendarId: string): string | null => {
  const row = db
    .prepare('SELECT sync_token FROM calendars WHERE id = ?')
    .get(calendarId) as { sync_token: string | null } | undefined
  return row?.sync_token ?? null
}
```

- [ ] **Step 4: Run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): SQLite event upsert/delete + sync token helpers"
```

### Task 19: Calendar sync runner

**Files:**

- Create: `packages/server/src/sync/runner.ts`
- Create: `packages/server/src/sync/runner.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it, vi } from 'vitest'
import { syncCalendarOnce } from './runner'

describe('syncCalendarOnce', () => {
  it('uses sync token if present, persists nextSyncToken', async () => {
    const list = vi.fn(async () => ({
      events: [
        {
          id: 'g1',
          etag: 'e1',
          summary: 'Lunch',
          start: { dateTime: '2026-05-29T12:00:00Z' },
          end: { dateTime: '2026-05-29T13:00:00Z' },
        },
      ],
      nextSyncToken: 'NEW',
    }))
    const persist = vi.fn()
    const setToken = vi.fn()
    const result = await syncCalendarOnce({
      calendarId: 'c1',
      accessToken: 'A',
      currentSyncToken: 'OLD',
      timeWindowDays: 90,
      list,
      persist,
      setToken,
      now: () => 1000,
    })
    expect(list).toHaveBeenCalledWith('A', 'c1', { syncToken: 'OLD' })
    expect(persist).toHaveBeenCalledWith('c1', expect.any(Array), 1000)
    expect(setToken).toHaveBeenCalledWith('c1', 'NEW')
    expect(result.kind).toBe('ok')
  })

  it('falls back to full sync when token invalid', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ events: [], syncTokenInvalid: true })
      .mockResolvedValueOnce({ events: [], nextSyncToken: 'NEW' })
    const result = await syncCalendarOnce({
      calendarId: 'c1',
      accessToken: 'A',
      currentSyncToken: 'OLD',
      timeWindowDays: 90,
      list,
      persist: vi.fn(),
      setToken: vi.fn(),
      now: () => 1000,
    })
    expect(list).toHaveBeenCalledTimes(2)
    expect(result.kind).toBe('full-resync')
  })
})
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { applyEventsDiff, type CachedEvent } from './calendar-sync'
import type { GoogleEvent, ListEventsArgs, ListEventsResult } from './google-client'

type ListFn = (token: string, calendarId: string, args: ListEventsArgs) => Promise<ListEventsResult>

export interface SyncArgs {
  calendarId: string
  accessToken: string
  currentSyncToken: string | null
  timeWindowDays: number
  list: ListFn
  persist: (calendarId: string, events: CachedEvent[], syncedAt: number) => void
  setToken: (calendarId: string, token: string | null) => void
  now: () => number
}

export interface SyncOk {
  kind: 'ok' | 'full-resync'
  upserts: number
  deletes: number
}

const collect = async (
  list: ListFn,
  token: string,
  calendarId: string,
  initialArgs: ListEventsArgs,
): Promise<{ events: GoogleEvent[]; nextSyncToken?: string; invalid?: boolean }> => {
  const collected: GoogleEvent[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | undefined
  for (;;) {
    const res = await list(token, calendarId, { ...initialArgs, pageToken })
    if (res.syncTokenInvalid) return { events: [], invalid: true }
    collected.push(...res.events)
    if (res.nextSyncToken) nextSyncToken = res.nextSyncToken
    if (!res.nextPageToken) break
    pageToken = res.nextPageToken
  }
  return { events: collected, nextSyncToken }
}

export const syncCalendarOnce = async (args: SyncArgs): Promise<SyncOk> => {
  let kind: SyncOk['kind'] = 'ok'
  let result = await collect(
    args.list,
    args.accessToken,
    args.calendarId,
    args.currentSyncToken ? { syncToken: args.currentSyncToken } : timeWindowArgs(args),
  )

  if (result.invalid) {
    kind = 'full-resync'
    result = await collect(args.list, args.accessToken, args.calendarId, timeWindowArgs(args))
  }

  const cache = new Map<string, CachedEvent>()
  const diff = applyEventsDiff(cache, args.calendarId, result.events, args.now())
  args.persist(args.calendarId, [...cache.values()], args.now())
  if (result.nextSyncToken) args.setToken(args.calendarId, result.nextSyncToken)
  return { kind, upserts: diff.upserts, deletes: diff.deletes }
}

const timeWindowArgs = (args: SyncArgs): ListEventsArgs => {
  const day = 86_400_000
  return {
    timeMin: new Date(args.now() - args.timeWindowDays * day).toISOString(),
    timeMax: new Date(args.now() + args.timeWindowDays * day).toISOString(),
  }
}
```

- [ ] **Step 4: Run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): calendar sync runner with incremental + fallback"
```

### Task 20: Outbox processor

**Files:**

- Create: `packages/server/src/sync/outbox.ts`
- Create: `packages/server/src/sync/outbox.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../db'
import { createOutbox } from './outbox'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outbox-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('outbox', () => {
  it('runs writes in FIFO order and marks completed', async () => {
    const { db, close } = openDatabase(dir)
    const send = vi.fn(async () => 'ok' as const)
    const outbox = createOutbox(db.raw, { send, now: () => 1000 })
    outbox.enqueue({ op: 'create', payload: { calendarId: 'c1', body: { summary: 'a' } } })
    outbox.enqueue({ op: 'create', payload: { calendarId: 'c1', body: { summary: 'b' } } })
    await outbox.processOnce()
    expect(send).toHaveBeenCalledTimes(2)
    const remaining = db.all('SELECT * FROM events_outbox WHERE completed_at IS NULL')
    expect(remaining).toHaveLength(0)
    close()
  })

  it('retries with backoff on transient failure', async () => {
    const { db, close } = openDatabase(dir)
    const send = vi.fn(async () => 'retry' as const)
    const outbox = createOutbox(db.raw, { send, now: () => 1000 })
    outbox.enqueue({ op: 'create', payload: { calendarId: 'c1', body: { summary: 'a' } } })
    await outbox.processOnce()
    const row = db.get<{ attempts: number; next_attempt_at: number }>(
      'SELECT attempts, next_attempt_at FROM events_outbox',
    )
    expect(row?.attempts).toBe(1)
    expect(row?.next_attempt_at).toBeGreaterThan(1000)
    close()
  })

  it('on conflict marks the row failed and continues', async () => {
    const { db, close } = openDatabase(dir)
    const send = vi.fn(async () => 'conflict' as const)
    const outbox = createOutbox(db.raw, { send, now: () => 1000 })
    outbox.enqueue({ op: 'create', payload: { calendarId: 'c1', body: { summary: 'a' } } })
    await outbox.processOnce()
    const row = db.get<{ last_error: string; completed_at: number }>(
      'SELECT last_error, completed_at FROM events_outbox',
    )
    expect(row?.last_error).toContain('conflict')
    expect(row?.completed_at).toBe(1000)
    close()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

export type OutboxOp = 'create' | 'update' | 'delete'

export interface OutboxPayload {
  calendarId: string
  eventId?: string
  etag?: string
  body?: Record<string, unknown>
}

export type SendResult = 'ok' | 'conflict' | 'retry'

export interface OutboxOptions {
  send: (op: OutboxOp, payload: OutboxPayload) => Promise<SendResult>
  now: () => number
  maxBackoffMs?: number
}

export interface OutboxRow {
  id: string
  op: OutboxOp
  payload_json: string
  attempts: number
  next_attempt_at: number
}

export interface Outbox {
  enqueue: (e: { op: OutboxOp; payload: OutboxPayload }) => string
  processOnce: () => Promise<void>
  pendingCount: () => number
}

const backoff = (attempts: number, maxMs: number) => Math.min(2 ** attempts * 1000, maxMs)

export const createOutbox = (db: Database.Database, opts: OutboxOptions): Outbox => {
  const maxBackoff = opts.maxBackoffMs ?? 5 * 60_000

  const insert = db.prepare(`
    INSERT INTO events_outbox (id, op, payload_json, attempts, next_attempt_at, created_at)
    VALUES (@id, @op, @payloadJson, 0, @now, @now)
  `)
  const pickReady = db.prepare(`
    SELECT id, op, payload_json, attempts, next_attempt_at FROM events_outbox
    WHERE completed_at IS NULL AND next_attempt_at <= ? ORDER BY created_at ASC
  `)
  const updateRetry = db.prepare(`
    UPDATE events_outbox SET attempts = attempts + 1, next_attempt_at = ?, last_error = ? WHERE id = ?
  `)
  const markDone = db.prepare(`
    UPDATE events_outbox SET completed_at = ?, last_error = NULL WHERE id = ?
  `)
  const markFailed = db.prepare(`
    UPDATE events_outbox SET completed_at = ?, last_error = ? WHERE id = ?
  `)
  const countPending = db.prepare(
    'SELECT COUNT(*) AS n FROM events_outbox WHERE completed_at IS NULL',
  )

  return {
    enqueue: ({ op, payload }) => {
      const id = randomUUID()
      insert.run({
        id,
        op,
        payloadJson: JSON.stringify(payload),
        now: opts.now(),
      })
      return id
    },
    processOnce: async () => {
      const rows = pickReady.all(opts.now()) as OutboxRow[]
      for (const row of rows) {
        const payload = JSON.parse(row.payload_json) as OutboxPayload
        let result: SendResult
        try {
          result = await opts.send(row.op, payload)
        } catch (err) {
          result = 'retry'
          updateRetry.run(opts.now() + backoff(row.attempts + 1, maxBackoff), String(err), row.id)
          continue
        }
        if (result === 'ok') {
          markDone.run(opts.now(), row.id)
        } else if (result === 'conflict') {
          markFailed.run(opts.now(), 'conflict', row.id)
        } else {
          updateRetry.run(opts.now() + backoff(row.attempts + 1, maxBackoff), 'retry', row.id)
        }
      }
    },
    pendingCount: () => (countPending.get() as { n: number }).n,
  }
}
```

- [ ] **Step 4: Run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): outbox processor with backoff + conflict handling"
```

---

## Phase 4: Widget Registry + REST API

### Task 21: Widget registry (server side)

**Files:**

- Create: `packages/server/src/widgets/registry.ts`
- Create: `packages/server/src/widgets/registry.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest'
import { createRegistry } from './registry'
import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'

const clock: WidgetDefinition = {
  id: 'clock',
  name: 'Clock',
  defaultSize: { w: 8, h: 1 },
  minSize: { w: 2, h: 1 },
  configSchema: z.object({ tz: z.string().optional() }),
}

describe('registry', () => {
  it('registers and looks up widgets', () => {
    const r = createRegistry()
    r.register(clock)
    expect(r.get('clock')).toBe(clock)
    expect(r.list().map((w) => w.id)).toEqual(['clock'])
  })

  it('rejects duplicate ids', () => {
    const r = createRegistry()
    r.register(clock)
    expect(() => r.register(clock)).toThrow()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type { WidgetDefinition } from '@dashboard/core'

export interface Registry {
  register: (w: WidgetDefinition) => void
  get: (id: string) => WidgetDefinition | undefined
  list: () => WidgetDefinition[]
}

export const createRegistry = (): Registry => {
  const map = new Map<string, WidgetDefinition>()
  return {
    register: (w) => {
      if (map.has(w.id)) throw new Error(`widget ${w.id} already registered`)
      map.set(w.id, w)
    },
    get: (id) => map.get(id),
    list: () => [...map.values()],
  }
}
```

- [ ] **Step 4: Run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): widget registry"
```

### Task 22: Widget cron runner

**Files:**

- Create: `packages/server/src/widgets/cron-runner.ts`
- Create: `packages/server/src/widgets/cron-runner.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { WidgetDefinition } from '@dashboard/core'
import { runWidgetBackends } from './cron-runner'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('runWidgetBackends', () => {
  it('schedules a backend at its intervalMs and publishes data', async () => {
    const published: unknown[] = []
    const widget: WidgetDefinition = {
      id: 'demo',
      name: 'Demo',
      defaultSize: { w: 2, h: 1 },
      minSize: { w: 1, h: 1 },
      configSchema: z.object({}),
      backend: {
        intervalMs: 1000,
        run: async (ctx) => {
          ctx.publish({ tick: ctx.now().valueOf() })
        },
      },
    }
    const stop = runWidgetBackends({
      widgets: [widget],
      instances: [{ widgetId: 'demo', instanceId: 'i1', config: {} }],
      publish: (instanceId, payload) => published.push({ instanceId, payload }),
      now: () => new Date(0),
    })
    await vi.advanceTimersByTimeAsync(2500)
    stop()
    expect(published.length).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type { WidgetDefinition } from '@dashboard/core'

export interface WidgetInstance {
  widgetId: string
  instanceId: string
  config: unknown
}

export interface RunArgs {
  widgets: WidgetDefinition[]
  instances: WidgetInstance[]
  publish: (instanceId: string, payload: unknown) => void
  now: () => Date
}

export const runWidgetBackends = ({ widgets, instances, publish, now }: RunArgs) => {
  const byId = new Map(widgets.map((w) => [w.id, w]))
  const timers: NodeJS.Timeout[] = []
  for (const inst of instances) {
    const w = byId.get(inst.widgetId)
    if (!w?.backend) continue
    const ctx = {
      instanceId: inst.instanceId,
      config: inst.config,
      publish: (p: unknown) => publish(inst.instanceId, p),
      now,
    }
    // Fire once immediately
    void w.backend.run(ctx).catch((e) => console.error('widget backend error', e))
    const t = setInterval(() => {
      void w.backend?.run(ctx).catch((e) => console.error('widget backend error', e))
    }, w.backend.intervalMs)
    timers.push(t)
  }
  return () => {
    for (const t of timers) clearInterval(t)
  }
}
```

- [ ] **Step 4: Run test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): widget backend cron runner"
```

### Task 23: REST API — scenes + accounts + events read

**Files:**

- Create: `packages/server/src/routes/scenes.ts`
- Create: `packages/server/src/routes/scenes.test.ts`
- Create: `packages/server/src/routes/events.ts`
- Create: `packages/server/src/routes/events.test.ts`
- Create: `packages/server/src/routes/accounts.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Write failing test for scenes route**

```ts
import { describe, expect, it } from 'vitest'
import { buildApp } from '../app'

describe('scenes routes', () => {
  it('GET /api/scenes returns empty array on fresh db', async () => {
    const app = await buildApp({ dataDir: `/tmp/scenes-${Date.now()}` })
    const res = await app.inject({ method: 'GET', url: '/api/scenes' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ scenes: [] })
    await app.close()
  })

  it('POST /api/scenes creates and GET returns it', async () => {
    const app = await buildApp({ dataDir: `/tmp/scenes-${Date.now()}` })
    const scene = {
      id: 's1',
      name: 'Active',
      isDefault: true,
      cells: [],
    }
    const create = await app.inject({ method: 'POST', url: '/api/scenes', payload: scene })
    expect(create.statusCode).toBe(201)
    const list = await app.inject({ method: 'GET', url: '/api/scenes' })
    expect((list.json() as { scenes: Array<{ name: string }> }).scenes[0]?.name).toBe('Active')
    await app.close()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Implement `routes/scenes.ts`**

```ts
import { SceneSchema } from '@dashboard/core'
import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'

export const registerScenesRoutes = (app: FastifyInstance, db: Database.Database) => {
  app.get('/api/scenes', async () => {
    const rows = db
      .prepare('SELECT id, name, layout_json, is_default FROM scenes ORDER BY created_at ASC')
      .all() as Array<{ id: string; name: string; layout_json: string; is_default: number }>
    return {
      scenes: rows.map((r) => ({
        id: r.id,
        name: r.name,
        isDefault: r.is_default === 1,
        cells: JSON.parse(r.layout_json),
      })),
    }
  })

  app.post('/api/scenes', async (req, reply) => {
    const scene = SceneSchema.parse(req.body)
    const now = Date.now()
    db.prepare(
      `INSERT INTO scenes (id, name, layout_json, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         layout_json = excluded.layout_json,
         is_default = excluded.is_default,
         updated_at = excluded.updated_at`,
    ).run(scene.id, scene.name, JSON.stringify(scene.cells), scene.isDefault ? 1 : 0, now, now)
    reply.code(201)
    app.broker.publish({ type: 'scene:updated', sceneId: scene.id })
    return scene
  })
}
```

- [ ] **Step 4: Write failing test for events route**

```ts
import { describe, expect, it } from 'vitest'
import { buildApp } from '../app'

describe('events routes', () => {
  it('GET /api/events returns events within window', async () => {
    const app = await buildApp({ dataDir: `/tmp/events-${Date.now()}` })
    // No events yet — just verify shape.
    const res = await app.inject({
      method: 'GET',
      url: `/api/events?from=${Date.now()}&to=${Date.now() + 86400000}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ events: [] })
    await app.close()
  })
})
```

- [ ] **Step 5: Implement `routes/events.ts`**

```ts
import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

const Query = z.object({
  from: z.coerce.number().int(),
  to: z.coerce.number().int(),
})

export const registerEventsRoutes = (app: FastifyInstance, db: Database.Database) => {
  app.get('/api/events', async (req) => {
    const { from, to } = Query.parse(req.query)
    const rows = db
      .prepare(
        `SELECT e.id, e.calendar_id, e.google_event_id, e.start, e.end, e.all_day,
                e.title, e.location, e.description, e.color, e.etag
         FROM events_cache e
         JOIN calendars c ON c.id = e.calendar_id
         WHERE c.visible = 1
           AND e.deleted_at IS NULL
           AND e.start < ? AND e.end > ?
         ORDER BY e.start ASC`,
      )
      .all(to, from) as Array<{
      id: string
      calendar_id: string
      google_event_id: string
      start: number
      end: number
      all_day: number
      title: string
      location: string | null
      description: string | null
      color: string | null
      etag: string
    }>
    return {
      events: rows.map((r) => ({
        id: r.id,
        calendarId: r.calendar_id,
        googleEventId: r.google_event_id,
        start: r.start,
        end: r.end,
        allDay: r.all_day === 1,
        title: r.title,
        location: r.location,
        description: r.description,
        color: r.color,
        etag: r.etag,
      })),
    }
  })
}
```

- [ ] **Step 6: Implement `routes/accounts.ts`**

```ts
import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'

export const registerAccountsRoutes = (app: FastifyInstance, db: Database.Database) => {
  app.get('/api/accounts', async () => {
    const rows = db
      .prepare('SELECT id, provider, email, created_at FROM accounts ORDER BY created_at ASC')
      .all() as Array<{ id: string; provider: string; email: string; created_at: number }>
    return { accounts: rows }
  })
}
```

- [ ] **Step 7: Wire DB + routes into `app.ts`**

Replace `packages/server/src/app.ts`:

```ts
import { ClientMessageSchema, type ServerMessage } from '@dashboard/core'
import websocket from '@fastify/websocket'
import Fastify from 'fastify'
import { openDatabase } from './db'
import { registerAccountsRoutes } from './routes/accounts'
import { registerEventsRoutes } from './routes/events'
import { registerScenesRoutes } from './routes/scenes'
import { createBroker } from './ws/broker'

export interface AppOptions {
  dataDir: string
}

export const buildApp = async (opts: AppOptions) => {
  const app = Fastify({ logger: { transport: { target: 'pino-pretty' } } })
  const broker = createBroker()
  const { db, close: closeDb } = openDatabase(opts.dataDir)

  await app.register(websocket)

  app.get('/api/health', async () => ({ status: 'ok' }))
  app.get('/ws', { websocket: true }, (socket) => {
    const send = (m: ServerMessage) => socket.send(JSON.stringify(m))
    const unsub = broker.subscribe(send)
    socket.on('message', (raw) => {
      try {
        ClientMessageSchema.parse(JSON.parse(raw.toString()))
      } catch {
        // ignore malformed
      }
    })
    socket.on('close', unsub)
  })

  app.decorate('broker', broker)
  registerScenesRoutes(app, db.raw)
  registerEventsRoutes(app, db.raw)
  registerAccountsRoutes(app, db.raw)

  app.addHook('onClose', async () => closeDb())
  return app
}

declare module 'fastify' {
  interface FastifyInstance {
    broker: ReturnType<typeof createBroker>
  }
}
```

- [ ] **Step 8: Run all server tests**

Run: `pnpm --filter @dashboard/server test`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/server
git commit -m "feat(server): REST routes for scenes, events, accounts"
```

### Task 24: Event write route (touchscreen-driven)

**Files:**

- Create: `packages/server/src/routes/event-writes.ts`
- Create: `packages/server/src/routes/event-writes.test.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest'
import { buildApp } from '../app'

describe('event writes', () => {
  it('POST /api/events queues an outbox entry and updates cache optimistically', async () => {
    const dir = `/tmp/ew-${Date.now()}`
    const app = await buildApp({ dataDir: dir })
    // Seed a calendar so the FK reference works
    app.db.prepare(
      'INSERT INTO calendars (id, account_id, google_calendar_id, summary, visible) VALUES (?, ?, ?, ?, 1)',
    ).run('cal1', 'acc1', 'gcal1', 'Mom')

    const body = {
      calendarId: 'cal1',
      title: 'Lunch',
      start: Date.now() + 3600_000,
      end: Date.now() + 7200_000,
      allDay: false,
    }
    const res = await app.inject({ method: 'POST', url: '/api/events', payload: body })
    expect(res.statusCode).toBe(201)
    const outbox = app.db.prepare('SELECT COUNT(*) AS n FROM events_outbox').get() as {
      n: number
    }
    expect(outbox.n).toBe(1)
    const cache = app.db.prepare('SELECT COUNT(*) AS n FROM events_cache').get() as {
      n: number
    }
    expect(cache.n).toBe(1)
    await app.close()
  })
})
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Decorate app with `db` (for test access)**

Edit `packages/server/src/app.ts` — add `app.decorate('db', db.raw)` and module augmentation:

```ts
import type Database from 'better-sqlite3'

declare module 'fastify' {
  interface FastifyInstance {
    broker: ReturnType<typeof createBroker>
    db: Database.Database
  }
}
```

Add `app.decorate('db', db.raw)` after `app.decorate('broker', broker)`.

- [ ] **Step 4: Implement `routes/event-writes.ts`**

```ts
import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

const NewEvent = z.object({
  calendarId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  start: z.number().int(),
  end: z.number().int(),
  allDay: z.boolean().default(false),
})

export const registerEventWritesRoutes = (app: FastifyInstance, db: Database.Database) => {
  app.post('/api/events', async (req, reply) => {
    const body = NewEvent.parse(req.body)
    const id = `${body.calendarId}::pending-${randomUUID()}`
    const now = Date.now()
    db.transaction(() => {
      db.prepare(
        `INSERT INTO events_cache
          (id, calendar_id, google_event_id, etag, start, end, all_day,
           title, location, description, color, last_synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      ).run(
        id,
        body.calendarId,
        '',
        'pending',
        body.start,
        body.end,
        body.allDay ? 1 : 0,
        body.title,
        body.location ?? null,
        body.description ?? null,
        now,
      )
      db.prepare(
        `INSERT INTO events_outbox
          (id, op, payload_json, attempts, next_attempt_at, created_at)
         VALUES (?, 'create', ?, 0, ?, ?)`,
      ).run(randomUUID(), JSON.stringify({ cacheId: id, body }), now, now)
    })()
    app.broker.publish({ type: 'calendar:changed' })
    reply.code(201)
    return { id }
  })
}
```

- [ ] **Step 5: Wire into `app.ts`**

Add `registerEventWritesRoutes(app, db.raw)` next to the other route registrations.

- [ ] **Step 6: Run tests**

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server
git commit -m "feat(server): POST /api/events with optimistic cache + outbox enqueue"
```

---

## Phase 5: UI Package + Dashboard SPA Skeleton

### Task 25: Scaffold `@dashboard/ui`

**Files:**

- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/tokens.css`
- Create: `packages/ui/src/index.ts`

- [ ] **Step 1: Create directory and files**

```bash
mkdir -p packages/ui/src
```

`packages/ui/package.json`:

```json
{
  "name": "@dashboard/ui",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".": "./dist/index.js",
    "./tokens.css": "./src/tokens.css"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "19.0.2",
    "@types/react-dom": "19.0.2",
    "typescript": "5.7.2"
  }
}
```

`packages/ui/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*"]
}
```

`packages/ui/src/tokens.css`:

```css
:root {
  --bg-gradient: linear-gradient(135deg, #ffe4ec 0%, #dbeaff 100%);
  --bg-card: #ffffff;
  --shadow-card: 0 4px 18px rgba(91, 108, 255, 0.12);
  --text: #1f2545;
  --text-dim: #7c84a8;
  --accent: #5b6cff;

  --color-person-1: #ff7eb6;
  --color-person-2: #5b6cff;
  --color-person-3: #ffb13b;
  --color-person-4: #36c47a;

  --radius-lg: 18px;
  --radius-md: 12px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;

  --font-family-sans:
    'Inter', -apple-system, system-ui, 'Segoe UI', sans-serif;
}
```

`packages/ui/src/index.ts`:

```ts
export {}
```

- [ ] **Step 2: Install and build**

```bash
pnpm install
pnpm --filter @dashboard/ui build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/ui
git commit -m "feat(ui): scaffold ui package + theme tokens"
```

### Task 26: Scaffold dashboard SPA with Vite

**Files:**

- Create: `packages/dashboard/package.json`
- Create: `packages/dashboard/tsconfig.json`
- Create: `packages/dashboard/tsconfig.node.json`
- Create: `packages/dashboard/vite.config.ts`
- Create: `packages/dashboard/index.html`
- Create: `packages/dashboard/src/main.tsx`
- Create: `packages/dashboard/src/App.tsx`

- [ ] **Step 1: Create files**

```bash
mkdir -p packages/dashboard/src
```

`packages/dashboard/package.json`:

```json
{
  "name": "@dashboard/dashboard",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "build": "vite build",
    "dev": "vite",
    "preview": "vite preview"
  },
  "dependencies": {
    "@dashboard/core": "workspace:*",
    "@dashboard/ui": "workspace:*",
    "@tanstack/react-query": "5.62.7",
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "zustand": "5.0.2"
  },
  "devDependencies": {
    "@tailwindcss/vite": "4.0.0-beta.7",
    "@types/react": "19.0.2",
    "@types/react-dom": "19.0.2",
    "@vitejs/plugin-react": "4.3.4",
    "tailwindcss": "4.0.0-beta.7",
    "typescript": "5.7.2",
    "vite": "6.0.5"
  }
}
```

`packages/dashboard/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src/**/*"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`packages/dashboard/tsconfig.node.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "module": "ESNext", "types": ["node"] },
  "include": ["vite.config.ts"]
}
```

`packages/dashboard/vite.config.ts`:

```ts
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000', '/ws': { target: 'ws://localhost:3000', ws: true } } },
  build: { outDir: 'dist', emptyOutDir: true },
})
```

`packages/dashboard/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
    <title>Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`packages/dashboard/src/main.tsx`:

```tsx
import '@dashboard/ui/tokens.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`packages/dashboard/src/index.css`:

```css
@import 'tailwindcss';
html, body, #root { height: 100%; }
body { margin: 0; font-family: var(--font-family-sans); color: var(--text); background: var(--bg-gradient); }
```

`packages/dashboard/src/App.tsx`:

```tsx
export const App = () => (
  <main className="h-full p-4">
    <h1 className="text-2xl font-bold">Dashboard</h1>
    <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
      Loading…
    </p>
  </main>
)
```

- [ ] **Step 2: Install and build**

```bash
pnpm install
pnpm --filter @dashboard/dashboard build
```

Expected: `packages/dashboard/dist/index.html` and assets exist.

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard
git commit -m "feat(dashboard): vite + react 19 + tailwind v4 skeleton"
```

### Task 27: Serve dashboard SPA from Fastify

**Files:**

- Modify: `packages/server/src/app.ts`
- Create: `packages/server/src/static.ts`

- [ ] **Step 1: Write `static.ts`**

```ts
import staticPlugin from '@fastify/static'
import type { FastifyInstance } from 'fastify'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

const resolveDistRoot = (pkg: 'dashboard' | 'admin'): string | null => {
  // Server runs from packages/server/dist; the sibling SPA dist sits at packages/<pkg>/dist.
  const candidate = join(here, '..', '..', pkg, 'dist')
  return existsSync(candidate) ? candidate : null
}

export const registerStatic = async (app: FastifyInstance) => {
  const dashboard = resolveDistRoot('dashboard')
  if (dashboard) {
    await app.register(staticPlugin, { root: dashboard, prefix: '/', decorateReply: false })
  }
}
```

- [ ] **Step 2: Call in `app.ts`**

Add `await registerStatic(app)` after the API routes are registered.

- [ ] **Step 3: Smoke test**

```bash
pnpm --filter @dashboard/dashboard build
pnpm --filter @dashboard/server build
pnpm --filter @dashboard/server start &
sleep 2
curl -s http://localhost:3000/ | grep -q '<div id="root">' && echo OK
kill %1
```

Expected: prints OK.

- [ ] **Step 4: Commit**

```bash
git add packages/server
git commit -m "feat(server): serve dashboard SPA bundle from root"
```

### Task 28: Dashboard WebSocket client + store

**Files:**

- Create: `packages/dashboard/src/ws.ts`
- Create: `packages/dashboard/src/store.ts`

- [ ] **Step 1: Implement `ws.ts`**

```ts
import { ServerMessageSchema, type ServerMessage } from '@dashboard/core'

export const connectWs = (onMessage: (m: ServerMessage) => void): (() => void) => {
  let ws: WebSocket | null = null
  let stopped = false
  const open = () => {
    if (stopped) return
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${window.location.host}/ws`)
    ws.onmessage = (e) => {
      try {
        const m = ServerMessageSchema.parse(JSON.parse(String(e.data)))
        onMessage(m)
      } catch {
        // ignore malformed
      }
    }
    ws.onclose = () => {
      if (!stopped) setTimeout(open, 1000)
    }
  }
  open()
  return () => {
    stopped = true
    ws?.close()
  }
}
```

- [ ] **Step 2: Implement `store.ts`**

```ts
import { create } from 'zustand'

interface DashboardState {
  widgetData: Record<string, unknown>
  setWidgetData: (instanceId: string, payload: unknown) => void
  calendarBump: number
  bumpCalendar: () => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  widgetData: {},
  setWidgetData: (instanceId, payload) =>
    set((s) => ({ widgetData: { ...s.widgetData, [instanceId]: payload } })),
  calendarBump: 0,
  bumpCalendar: () => set((s) => ({ calendarBump: s.calendarBump + 1 })),
}))
```

- [ ] **Step 3: Wire in `App.tsx`**

```tsx
import { useEffect } from 'react'
import { useDashboardStore } from './store'
import { connectWs } from './ws'

export const App = () => {
  const setWidgetData = useDashboardStore((s) => s.setWidgetData)
  const bumpCalendar = useDashboardStore((s) => s.bumpCalendar)

  useEffect(
    () =>
      connectWs((m) => {
        if (m.type === 'widget:data') setWidgetData(m.instanceId, m.payload)
        if (m.type === 'calendar:changed') bumpCalendar()
      }),
    [setWidgetData, bumpCalendar],
  )

  return (
    <main className="h-full p-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
        Connected
      </p>
    </main>
  )
}
```

- [ ] **Step 4: Build + smoke test**

```bash
pnpm --filter @dashboard/dashboard build
pnpm --filter @dashboard/server build
pnpm --filter @dashboard/server start &
sleep 2
# Open browser to http://localhost:3000 — DevTools should show WS open.
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard
git commit -m "feat(dashboard): WS client + zustand store"
```

---

## Phase 6: Scene Renderer

### Task 29: Implement scene renderer

**Files:**

- Create: `packages/dashboard/src/SceneRenderer.tsx`
- Create: `packages/dashboard/src/widget-loader.ts`
- Modify: `packages/dashboard/src/App.tsx`

- [ ] **Step 1: Implement `widget-loader.ts`**

The loader is registry-based and starts empty — widget packages register themselves into it when they're added to the dashboard in later tasks.

```ts
import type { ComponentType } from 'react'

export interface WidgetView<TConfig = unknown, TData = unknown> {
  Render: ComponentType<{ config: TConfig; data: TData | undefined }>
}

type Loader = () => Promise<WidgetView>

const loaders = new Map<string, Loader>()
const cache = new Map<string, WidgetView>()

export const registerWidgetLoader = (id: string, loader: Loader) => {
  loaders.set(id, loader)
}

export const loadWidget = async (id: string): Promise<WidgetView | null> => {
  if (cache.has(id)) return cache.get(id)!
  const loader = loaders.get(id)
  if (!loader) return null
  const view = await loader()
  cache.set(id, view)
  return view
}
```

Also create `packages/dashboard/src/widgets.ts` (empty for now — populated in Tasks 30 and 32):

```ts
// Widget loader registrations are added here as widget packages are introduced.
export {}
```

And import it eagerly from `main.tsx` so registrations execute. Edit `packages/dashboard/src/main.tsx`:

```tsx
import '@dashboard/ui/tokens.css'
import './index.css'
import './widgets'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 2: Implement `SceneRenderer.tsx`**

```tsx
import type { LayoutCell, Scene } from '@dashboard/core'
import { GRID_COLS, GRID_ROWS } from '@dashboard/core'
import { useEffect, useState } from 'react'
import { useDashboardStore } from './store'
import { loadWidget, type WidgetView } from './widget-loader'

const Cell = ({ cell }: { cell: LayoutCell }) => {
  const [view, setView] = useState<WidgetView | null>(null)
  const data = useDashboardStore((s) => s.widgetData[cell.instanceId])

  useEffect(() => {
    void loadWidget(cell.widgetId).then(setView)
  }, [cell.widgetId])

  const style = {
    gridColumnStart: cell.x + 1,
    gridColumnEnd: cell.x + 1 + cell.w,
    gridRowStart: cell.y + 1,
    gridRowEnd: cell.y + 1 + cell.h,
  }

  return (
    <div
      style={style}
      className="bg-white shadow-[var(--shadow-card)]"
      data-instance={cell.instanceId}
    >
      {view ? <view.Render config={cell.config} data={data} /> : null}
    </div>
  )
}

export const SceneRenderer = ({ scene }: { scene: Scene }) => (
  <div
    className="h-full p-4"
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
      gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
      gap: '12px',
    }}
  >
    {scene.cells.map((cell) => (
      <Cell key={cell.instanceId} cell={cell} />
    ))}
  </div>
)
```

- [ ] **Step 3: Update `App.tsx` to fetch active scene**

```tsx
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import type { Scene } from '@dashboard/core'
import { useEffect } from 'react'
import { SceneRenderer } from './SceneRenderer'
import { useDashboardStore } from './store'
import { connectWs } from './ws'

const qc = new QueryClient()

const Inner = () => {
  const setWidgetData = useDashboardStore((s) => s.setWidgetData)
  const bumpCalendar = useDashboardStore((s) => s.bumpCalendar)
  const { data } = useQuery({
    queryKey: ['scenes'],
    queryFn: async () => {
      const res = await fetch('/api/scenes')
      const json = (await res.json()) as { scenes: Scene[] }
      return json.scenes.find((s) => s.isDefault) ?? json.scenes[0] ?? null
    },
  })

  useEffect(
    () =>
      connectWs((m) => {
        if (m.type === 'widget:data') setWidgetData(m.instanceId, m.payload)
        if (m.type === 'calendar:changed') bumpCalendar()
        if (m.type === 'scene:updated') qc.invalidateQueries({ queryKey: ['scenes'] })
      }),
    [setWidgetData, bumpCalendar],
  )

  if (!data) return <p className="p-4">No scene configured yet.</p>
  return <SceneRenderer scene={data} />
}

export const App = () => (
  <QueryClientProvider client={qc}>
    <Inner />
  </QueryClientProvider>
)
```

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard
git commit -m "feat(dashboard): scene renderer with dynamic widget loading"
```

---

## Phase 7: Clock Widget (vertical-slice proof)

### Task 30: Implement Clock widget

**Files:**

- Create: `packages/widgets/clock/package.json`
- Create: `packages/widgets/clock/tsconfig.json`
- Create: `packages/widgets/clock/src/index.ts`
- Create: `packages/widgets/clock/src/view.tsx`

- [ ] **Step 1: Create directory and files**

```bash
mkdir -p packages/widgets/clock/src
```

`packages/widgets/clock/package.json`:

```json
{
  "name": "@dashboard/widget-clock",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@dashboard/core": "workspace:*",
    "zod": "3.23.8"
  },
  "peerDependencies": {
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "19.0.2",
    "typescript": "5.7.2"
  }
}
```

`packages/widgets/clock/tsconfig.json`:

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

- [ ] **Step 2: Implement `src/view.tsx`**

```tsx
import { useEffect, useState } from 'react'

export interface ClockConfig {
  format?: '12h' | '24h'
}

export const ClockView = ({ config }: { config: ClockConfig; data: undefined }) => {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const hour = now.getHours()
  const minute = now.getMinutes().toString().padStart(2, '0')
  const display =
    config.format === '24h'
      ? `${hour.toString().padStart(2, '0')}:${minute}`
      : `${((hour + 11) % 12) + 1}:${minute}${hour < 12 ? ' AM' : ' PM'}`
  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="flex h-full items-center justify-between px-6">
      <span className="text-3xl font-bold tracking-tight">{dateLabel}</span>
      <span className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>
        {display}
      </span>
    </div>
  )
}
```

- [ ] **Step 3: Implement `src/index.ts`**

```ts
import type { WidgetDefinition } from '@dashboard/core'
import { z } from 'zod'
import { ClockView } from './view'

const ClockConfigSchema = z.object({
  format: z.enum(['12h', '24h']).optional(),
})

const definition: WidgetDefinition<z.infer<typeof ClockConfigSchema>> = {
  id: 'clock',
  name: 'Clock',
  defaultSize: { w: 8, h: 1 },
  minSize: { w: 4, h: 1 },
  configSchema: ClockConfigSchema,
}

export default {
  ...definition,
  Render: ClockView,
}
```

- [ ] **Step 4: Add to dashboard deps and register loader**

Edit `packages/dashboard/package.json` `dependencies` and add:

```json
"@dashboard/widget-clock": "workspace:*"
```

Edit `packages/dashboard/src/widgets.ts`:

```ts
import { registerWidgetLoader } from './widget-loader'

registerWidgetLoader('clock', () =>
  import('@dashboard/widget-clock').then((m) => m.default),
)
```

- [ ] **Step 5: Install, build, commit**

```bash
pnpm install
pnpm --filter @dashboard/widget-clock build
pnpm --filter @dashboard/dashboard build
git add packages/widgets/clock packages/dashboard
git commit -m "feat(widget-clock): basic ticking clock"
```

### Task 31: Seed a default scene with Clock for end-to-end test

**Files:**

- Modify: `packages/server/src/app.ts`
- Create: `packages/server/src/db/seed.ts`
- Create: `packages/server/src/db/seed.test.ts`

- [ ] **Step 1: Write failing test**

```ts
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
    expect(JSON.parse(rows[0]!.layout_json)).toEqual([
      expect.objectContaining({ widgetId: 'clock' }),
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
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Implement `seed.ts`**

```ts
import type Database from 'better-sqlite3'

export const seedDefaultScene = (db: Database.Database) => {
  const existing = db.prepare('SELECT id FROM scenes WHERE is_default = 1').get()
  if (existing) return
  const now = Date.now()
  const cells = [
    { instanceId: 'clock-1', widgetId: 'clock', x: 0, y: 0, w: 8, h: 1, config: {} },
  ]
  db.prepare(
    `INSERT INTO scenes (id, name, layout_json, is_default, created_at, updated_at)
     VALUES ('default', 'Active', ?, 1, ?, ?)`,
  ).run(JSON.stringify(cells), now, now)
}
```

- [ ] **Step 4: Wire into `app.ts`**

After `openDatabase`, call `seedDefaultScene(db.raw)`.

- [ ] **Step 5: Run tests**

Expected: PASS.

- [ ] **Step 6: End-to-end smoke**

```bash
rm -rf packages/server/data
pnpm --filter @dashboard/widget-clock build
pnpm --filter @dashboard/dashboard build
pnpm --filter @dashboard/server build
pnpm --filter @dashboard/server start &
sleep 2
# Open http://localhost:3000 in a browser — should see the live clock
kill %1
```

- [ ] **Step 7: Commit**

```bash
git add packages/server
git commit -m "feat(server): seed default scene with clock cell"
```

---

## Phase 8: Calendar Widget End-to-End

### Task 32: Calendar widget data model + view

**Files:**

- Create: `packages/widgets/calendar/package.json`
- Create: `packages/widgets/calendar/tsconfig.json`
- Create: `packages/widgets/calendar/src/index.ts`
- Create: `packages/widgets/calendar/src/view.tsx`
- Create: `packages/widgets/calendar/src/types.ts`

- [ ] **Step 1: Create directory and files**

```bash
mkdir -p packages/widgets/calendar/src
```

`packages/widgets/calendar/package.json`:

```json
{
  "name": "@dashboard/widget-calendar",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": { ".": "./dist/index.js" },
  "scripts": { "build": "tsc -p tsconfig.json", "test": "vitest run" },
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

`packages/widgets/calendar/tsconfig.json`:

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

- [ ] **Step 2: Write `src/types.ts`**

```ts
export interface CachedEvent {
  id: string
  calendarId: string
  start: number
  end: number
  allDay: boolean
  title: string
  color: string | null
  location: string | null
}

export interface CalendarData {
  events: CachedEvent[]
}
```

- [ ] **Step 3: Write `src/view.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query'
import {
  addDays,
  endOfWeek,
  format,
  isSameDay,
  startOfWeek,
} from 'date-fns'
import type { CachedEvent } from './types'

export interface CalendarConfig {
  view?: 'week' | 'month' | 'day'
}

const fetchEvents = async (from: number, to: number): Promise<CachedEvent[]> => {
  const res = await fetch(`/api/events?from=${from}&to=${to}`)
  if (!res.ok) throw new Error('events fetch failed')
  return ((await res.json()) as { events: CachedEvent[] }).events
}

export const CalendarView = ({ config }: { config: CalendarConfig; data: undefined }) => {
  const today = new Date()
  const start = startOfWeek(today, { weekStartsOn: 0 })
  const end = endOfWeek(today, { weekStartsOn: 0 })

  const { data: events = [] } = useQuery({
    queryKey: ['calendar', config.view ?? 'week', start.getTime(), end.getTime()],
    queryFn: () => fetchEvents(start.getTime(), end.getTime()),
    refetchInterval: 60_000,
  })

  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))

  return (
    <div className="flex h-full flex-col p-4">
      <div className="grid grid-cols-7 gap-2 pb-2 text-xs font-semibold text-[var(--text-dim)]">
        {days.map((d) => (
          <div key={d.toISOString()} className="text-center">
            {format(d, 'EEE')}<br />
            <span
              className={isSameDay(d, today) ? 'text-white bg-[var(--accent)] rounded-md px-2' : ''}
            >
              {format(d, 'd')}
            </span>
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 gap-2 overflow-y-auto">
        {days.map((d) => (
          <div key={d.toISOString()} className="flex flex-col gap-1">
            {events
              .filter((e) => isSameDay(new Date(e.start), d))
              .map((e) => (
                <div
                  key={e.id}
                  className="rounded-md px-2 py-1 text-xs text-white"
                  style={{ background: e.color ?? 'var(--accent)' }}
                >
                  {format(new Date(e.start), 'h:mma')} {e.title}
                </div>
              ))}
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
import { CalendarView } from './view'

const ConfigSchema = z.object({
  view: z.enum(['week', 'month', 'day']).optional(),
})

const definition: WidgetDefinition<z.infer<typeof ConfigSchema>> = {
  id: 'calendar',
  name: 'Calendar',
  defaultSize: { w: 8, h: 6 },
  minSize: { w: 4, h: 4 },
  configSchema: ConfigSchema,
}

export default { ...definition, Render: CalendarView }
```

- [ ] **Step 5: Add `date-fns` peer if needed and build**

```bash
pnpm install
pnpm --filter @dashboard/widget-calendar build
```

- [ ] **Step 6: Register calendar loader in dashboard + add to default scene**

Edit `packages/dashboard/package.json` `dependencies`:

```json
"@dashboard/widget-calendar": "workspace:*"
```

Edit `packages/dashboard/src/widgets.ts` — append:

```ts
registerWidgetLoader('calendar', () =>
  import('@dashboard/widget-calendar').then((m) => m.default),
)
```

Modify `packages/server/src/db/seed.ts` to include calendar cell:

```ts
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
```

- [ ] **Step 7: Update seed test to expect both widgets**

In `packages/server/src/db/seed.test.ts`, update the first `expect` to:

```ts
expect(JSON.parse(rows[0]!.layout_json)).toEqual([
  expect.objectContaining({ widgetId: 'clock' }),
  expect.objectContaining({ widgetId: 'calendar' }),
])
```

- [ ] **Step 8: Run tests**

```bash
pnpm --filter @dashboard/server test
pnpm --filter @dashboard/widget-calendar test
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/widgets/calendar packages/server packages/dashboard
git commit -m "feat(widget-calendar): week view + add to default scene"
```

### Task 33: Wire periodic Google Calendar sync into server runtime

**Files:**

- Create: `packages/server/src/sync/service.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Implement `service.ts`**

```ts
import type Database from 'better-sqlite3'
import { createScheduler } from '../scheduler'
import { createTokenCache } from '../auth/token-cache'
import { refreshAccessToken } from '../auth/google'
import { createEncryptor, deriveKey } from '../auth/encryption'
import { listEvents } from './google-client'
import { applyEventsDiff, type CachedEvent } from './calendar-sync'
import { upsertEvents, setSyncToken, getSyncToken } from './calendar-repo'
import { syncCalendarOnce } from './runner'
import type { Broker } from '../ws/broker'

export interface SyncServiceOptions {
  db: Database.Database
  broker: Broker
  config: {
    googleClientId?: string
    googleClientSecret?: string
  }
  machineId: string
}

export const startSyncService = async (opts: SyncServiceOptions) => {
  if (!opts.config.googleClientId || !opts.config.googleClientSecret) {
    return { stop: () => {} }
  }
  const clientId = opts.config.googleClientId
  const clientSecret = opts.config.googleClientSecret

  const saltRow = opts.db.prepare("SELECT value FROM kv WHERE key='salt'").get() as
    | { value: string }
    | undefined
  let salt = saltRow?.value
  if (!salt) {
    salt = crypto.randomUUID()
    opts.db.prepare("INSERT INTO kv (key, value) VALUES ('salt', ?)").run(salt)
  }
  const key = await deriveKey(opts.machineId, salt)
  const enc = await createEncryptor(key)

  const tokenCache = createTokenCache((rt) =>
    refreshAccessToken(clientId, clientSecret, rt),
  )

  const sched = createScheduler()
  sched.every(60_000, async () => {
    const accounts = opts.db
      .prepare('SELECT id, refresh_token_encrypted FROM accounts')
      .all() as Array<{ id: string; refresh_token_encrypted: string }>
    for (const acc of accounts) {
      const refreshToken = enc.decrypt(acc.refresh_token_encrypted)
      const accessToken = await tokenCache.get(refreshToken)
      const cals = opts.db
        .prepare('SELECT id, google_calendar_id FROM calendars WHERE account_id = ? AND visible = 1')
        .all(acc.id) as Array<{ id: string; google_calendar_id: string }>
      for (const c of cals) {
        const result = await syncCalendarOnce({
          calendarId: c.id,
          accessToken,
          currentSyncToken: getSyncToken(opts.db, c.id),
          timeWindowDays: 90,
          list: (token, _, args) => listEvents(token, c.google_calendar_id, args),
          persist: (calId, events: CachedEvent[]) => upsertEvents(opts.db, events),
          setToken: (calId, token) => setSyncToken(opts.db, calId, token),
          now: Date.now,
        })
        if (result.upserts + result.deletes > 0) {
          opts.broker.publish({ type: 'calendar:changed' })
        }
      }
    }
  })

  return { stop: () => sched.stop() }
}
```

- [ ] **Step 2: Wire into `app.ts`**

After app + db build:

```ts
import { readFileSync } from 'node:fs'
import { startSyncService } from './sync/service'

const machineId = (() => {
  try {
    return readFileSync('/etc/machine-id', 'utf8').trim()
  } catch {
    return 'dev-machine'
  }
})()

const sync = await startSyncService({
  db: db.raw,
  broker,
  config: { googleClientId: opts.googleClientId, googleClientSecret: opts.googleClientSecret },
  machineId,
})
app.addHook('onClose', async () => sync.stop())
```

Add `googleClientId` and `googleClientSecret` to `AppOptions` and forward them from `index.ts` via `loadConfig`.

- [ ] **Step 3: Commit**

```bash
git add packages/server
git commit -m "feat(server): periodic calendar sync service wired into app lifecycle"
```

### Task 34: First-run OAuth route (touchscreen device flow)

**Files:**

- Create: `packages/server/src/routes/oauth.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Implement `routes/oauth.ts`**

```ts
import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import {
  pollDeviceFlow,
  startDeviceFlow,
  type DeviceFlowStart,
} from '../auth/google'
import { createEncryptor, deriveKey } from '../auth/encryption'

interface PendingFlow extends DeviceFlowStart {
  startedAt: number
}

export const registerOauthRoutes = (
  app: FastifyInstance,
  db: Database.Database,
  config: { clientId?: string; clientSecret?: string; machineId: string },
) => {
  const pending = new Map<string, PendingFlow>()

  app.post('/api/oauth/start', async (_, reply) => {
    if (!config.clientId) {
      reply.code(400)
      return { error: 'google client id not configured' }
    }
    const flow = await startDeviceFlow(config.clientId)
    pending.set(flow.deviceCode, { ...flow, startedAt: Date.now() })
    return {
      userCode: flow.userCode,
      verificationUrl: flow.verificationUrl,
      expiresAt: flow.expiresAt,
      deviceCode: flow.deviceCode,
    }
  })

  app.post<{ Body: { deviceCode: string } }>('/api/oauth/poll', async (req) => {
    if (!config.clientId || !config.clientSecret) return { status: 'error' }
    const { deviceCode } = req.body
    if (!pending.has(deviceCode)) return { status: 'unknown' }
    const result = await pollDeviceFlow(config.clientId, config.clientSecret, deviceCode)
    if (result === 'pending') return { status: 'pending' }
    if (result === 'denied' || result === 'expired') {
      pending.delete(deviceCode)
      return { status: result }
    }
    pending.delete(deviceCode)
    // Persist account
    const saltRow = db.prepare("SELECT value FROM kv WHERE key='salt'").get() as
      | { value: string }
      | undefined
    let salt = saltRow?.value
    if (!salt) {
      salt = randomUUID()
      db.prepare("INSERT INTO kv (key, value) VALUES ('salt', ?)").run(salt)
    }
    const key = await deriveKey(config.machineId, salt)
    const enc = await createEncryptor(key)
    const encryptedRefresh = enc.encrypt(result.refreshToken)
    const id = randomUUID()
    db.prepare(
      `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
       VALUES (?, 'google', '', ?, ?, ?)`,
    ).run(id, encryptedRefresh, 'calendar', Date.now())
    return { status: 'ok', accountId: id }
  })
}
```

- [ ] **Step 2: Wire into `app.ts`**

```ts
import { registerOauthRoutes } from './routes/oauth'

registerOauthRoutes(app, db.raw, {
  clientId: opts.googleClientId,
  clientSecret: opts.googleClientSecret,
  machineId,
})
```

- [ ] **Step 3: Commit**

```bash
git add packages/server
git commit -m "feat(server): /api/oauth/{start,poll} device flow endpoints"
```

### Task 35: Manual end-to-end OAuth + sync smoke test

**Files:**

- Create: `docs/dev/oauth-smoke.md`

- [ ] **Step 1: Document the manual procedure**

```markdown
# OAuth + Sync Smoke Test (manual)

Requires a real Google Cloud OAuth client (TV-and-limited-input device type).

1. Create Google Cloud project, enable Calendar + Photos APIs.
2. Create OAuth client of type "TVs and Limited Input devices". Note client id + secret.
3. Export env:

       export GOOGLE_CLIENT_ID=...
       export GOOGLE_CLIENT_SECRET=...

4. Run server:

       rm -rf packages/server/data
       pnpm --filter @dashboard/widget-clock build
       pnpm --filter @dashboard/widget-calendar build
       pnpm --filter @dashboard/dashboard build
       pnpm --filter @dashboard/server build
       pnpm --filter @dashboard/server start

5. Trigger OAuth from a separate shell:

       curl -s -X POST http://localhost:3000/api/oauth/start
       # Visit verification_url and enter user_code in a browser logged in as the test account
       curl -s -X POST -H 'content-type: application/json' \
         -d '{"deviceCode":"<from start response>"}' http://localhost:3000/api/oauth/poll

   Poll until status=ok.

6. Use the touchscreen event editor (Task 24 endpoint) to create an event in the calendar.
7. Verify the event appears in Google Calendar within 5 seconds.
8. Edit an event directly in Google Calendar — dashboard should reflect it within 60 seconds.

Pass criteria: round-trip both directions, dashboard never reloaded.
```

- [ ] **Step 2: Commit**

```bash
git add docs
git commit -m "docs: OAuth + sync smoke test procedure"
```

---

## Phase 9: Verification

### Task 36: Final integration check

- [ ] **Step 1: Run all unit and integration tests**

Run: `pnpm -r test`
Expected: all packages PASS.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Full build**

Run: `pnpm -r build`
Expected: no errors, all `dist/` directories populated.

- [ ] **Step 4: Manual kiosk launch**

```bash
rm -rf packages/server/data
pnpm --filter @dashboard/server start
# Open http://localhost:3000 in Chrome on a Mac; see clock + (empty) calendar
```

Expected: clock ticks live, calendar shows empty week view.

- [ ] **Step 5: Manual sync smoke test**

Follow `docs/dev/oauth-smoke.md`.

- [ ] **Step 6: Tag MVP**

```bash
git tag -a v0.1.0-mvp -m "Foundation + calendar MVP"
```

---

## Notes for the next plans

- **Plan 2 (Widget Pack):** weather (Open-Meteo), agenda, slideshow (Google Photos), chores, meal-plan, notes, packages. Each is a self-contained widget package following the Clock/Calendar pattern.
- **Plan 3 (Admin UI):** `packages/admin/` Vite app with `react-grid-layout`, first-run wizard, settings.
- **Plan 4 (Pi Install):** `scripts/install.sh`, `deploy/dashboard.service`, `deploy/cage.service`, Avahi config, `scripts/update.sh`, `scripts/backup.sh`.

Each plan can ship independently and produce a usable build.
