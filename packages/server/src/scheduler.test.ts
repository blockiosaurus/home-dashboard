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
