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

    const handle = startWidgetRuntime({
      broker,
      widgets: [widget],
      instances: [{ widgetId: 'ticker', instanceId: 'i1', config: {} }],
    })
    await vi.advanceTimersByTimeAsync(2500)
    handle.stop()
    expect(seen.length).toBeGreaterThanOrEqual(2)
    expect(seen[0]?.instanceId).toBe('i1')
    expect(handle.cache.get('i1')).toEqual(expect.objectContaining({ at: expect.any(Number) }))
  })

  it('replays cache entries to new subscribers via cache.entries()', async () => {
    const broker = createBroker()
    const widget: WidgetDefinition = {
      id: 'ticker',
      name: 'Ticker',
      defaultSize: { w: 1, h: 1 },
      minSize: { w: 1, h: 1 },
      configSchema: z.object({}),
      backend: {
        intervalMs: 1000,
        run: async (ctx) => ctx.publish({ tick: 1 }),
      },
    }
    const handle = startWidgetRuntime({
      broker,
      widgets: [widget],
      instances: [{ widgetId: 'ticker', instanceId: 'i1', config: {} }],
    })
    await vi.advanceTimersByTimeAsync(50)
    const entries = [...handle.cache.entries()]
    handle.stop()
    expect(entries).toEqual([['i1', { tick: 1 }]])
  })
})

describe('startWidgetRuntime reload', () => {
  const spyWidget = (runs: string[]): WidgetDefinition => ({
    id: 'ticker',
    name: 'Ticker',
    defaultSize: { w: 1, h: 1 },
    minSize: { w: 1, h: 1 },
    configSchema: z.object({}),
    backend: {
      intervalMs: 1000,
      run: async (ctx) => {
        runs.push(ctx.instanceId)
        ctx.publish({ at: ctx.now().getTime() })
      },
    },
  })

  it('starts a backend for a newly added instance and stops removed ones', async () => {
    const broker = createBroker()
    const runs: string[] = []
    const handle = startWidgetRuntime({
      broker,
      widgets: [spyWidget(runs)],
      instances: [{ widgetId: 'ticker', instanceId: 'old', config: {} }],
    })
    await vi.advanceTimersByTimeAsync(2500)
    expect(runs.every((r) => r === 'old')).toBe(true)
    expect(runs.length).toBeGreaterThanOrEqual(2)

    handle.reload([{ widgetId: 'ticker', instanceId: 'new', config: {} }])
    runs.length = 0
    await vi.advanceTimersByTimeAsync(2500)
    handle.stop()

    // The added instance now ticks and the removed one has gone quiet.
    expect(runs).toContain('new')
    expect(runs).not.toContain('old')
  })

  it('keeps the cache across a reload so reconnecting kiosks still get data', async () => {
    const broker = createBroker()
    const runs: string[] = []
    const handle = startWidgetRuntime({
      broker,
      widgets: [spyWidget(runs)],
      instances: [{ widgetId: 'ticker', instanceId: 'keep', config: {} }],
    })
    await vi.advanceTimersByTimeAsync(50)
    handle.reload([{ widgetId: 'ticker', instanceId: 'other', config: {} }])
    await vi.advanceTimersByTimeAsync(50)
    handle.stop()
    expect(handle.cache.get('keep')).toBeDefined()
  })

  it('stops every timer after repeated reloads', async () => {
    const broker = createBroker()
    const runs: string[] = []
    const handle = startWidgetRuntime({
      broker,
      widgets: [spyWidget(runs)],
      instances: [{ widgetId: 'ticker', instanceId: 'a', config: {} }],
    })
    handle.reload([{ widgetId: 'ticker', instanceId: 'b', config: {} }])
    handle.reload([{ widgetId: 'ticker', instanceId: 'c', config: {} }])
    handle.stop()
    runs.length = 0
    await vi.advanceTimersByTimeAsync(5000)
    expect(runs).toEqual([])
  })
})

describe('startWidgetRuntime generation guard', () => {
  // A backend whose run takes `delayMs` to resolve before publishing its label,
  // so a slow run from before a reload can be made to land after a fast one.
  const slowWidget = (): WidgetDefinition => ({
    id: 'slow',
    name: 'Slow',
    defaultSize: { w: 1, h: 1 },
    minSize: { w: 1, h: 1 },
    configSchema: z.object({}),
    backend: {
      // Long enough that nothing re-ticks during the test.
      intervalMs: 100_000,
      run: async (ctx) => {
        const cfg = ctx.config as { label: string; delayMs: number }
        await new Promise((resolve) => setTimeout(resolve, cfg.delayMs))
        ctx.publish({ label: cfg.label })
      },
    },
  })

  it('drops a publish from a run that was still in flight when reload replaced it', async () => {
    const broker = createBroker()
    const seen: unknown[] = []
    broker.subscribe((m) => {
      if (m.type === 'widget:data') seen.push(m.payload)
    })

    const handle = startWidgetRuntime({
      broker,
      widgets: [slowWidget()],
      instances: [{ widgetId: 'slow', instanceId: 'w1', config: { label: 'old', delayMs: 5000 } }],
    })
    // The old run has started but has not resolved yet.
    await vi.advanceTimersByTimeAsync(10)
    expect(handle.cache.get('w1')).toBeUndefined()

    // Reconfigure the same instance; the new run resolves immediately.
    handle.reload([{ widgetId: 'slow', instanceId: 'w1', config: { label: 'new', delayMs: 0 } }])
    await vi.advanceTimersByTimeAsync(10)
    expect(handle.cache.get('w1')).toEqual({ label: 'new' })

    // Now let the superseded run resolve: it must not clobber the new payload.
    await vi.advanceTimersByTimeAsync(10_000)
    handle.stop()

    expect(handle.cache.get('w1')).toEqual({ label: 'new' })
    expect(seen).toEqual([{ label: 'new' }])
  })

  it('drops a publish from a run still in flight when the runtime is stopped', async () => {
    const broker = createBroker()
    const handle = startWidgetRuntime({
      broker,
      widgets: [slowWidget()],
      instances: [{ widgetId: 'slow', instanceId: 'w1', config: { label: 'old', delayMs: 5000 } }],
    })
    await vi.advanceTimersByTimeAsync(10)
    handle.stop()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(handle.cache.get('w1')).toBeUndefined()
  })
})
