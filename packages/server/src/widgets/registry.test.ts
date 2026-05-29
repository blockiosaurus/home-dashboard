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
