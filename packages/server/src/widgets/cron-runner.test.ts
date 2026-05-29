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
