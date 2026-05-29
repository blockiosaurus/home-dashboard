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
