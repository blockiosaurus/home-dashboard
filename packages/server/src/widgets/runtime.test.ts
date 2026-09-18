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
