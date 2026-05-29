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
