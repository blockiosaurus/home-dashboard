import { describe, expect, it } from 'vitest'
import { pickActiveScene } from './scene-scheduler'

describe('pickActiveScene', () => {
  it('returns default scene when no rules', () => {
    const result = pickActiveScene({
      now: new Date('2026-05-29T15:00:00'),
      defaultSceneId: 'default',
      manualSceneId: null,
      rules: [],
    })
    expect(result).toBe('default')
  })

  it('respects manual override', () => {
    const result = pickActiveScene({
      now: new Date('2026-05-29T15:00:00'),
      defaultSceneId: 'default',
      manualSceneId: 'sleep',
      rules: [{ id: 'r', sceneId: 'active', cronExpr: '* * * * *', priority: 100 }],
    })
    expect(result).toBe('sleep')
  })

  it('picks highest-priority rule whose previous cron tick is within window', () => {
    // 22:00 daily rule should be active at 22:30
    const result = pickActiveScene({
      now: new Date('2026-05-29T22:30:00'),
      defaultSceneId: 'default',
      manualSceneId: null,
      rules: [{ id: 'r', sceneId: 'sleep', cronExpr: '0 22 * * *', priority: 10 }],
    })
    expect(result).toBe('sleep')
  })
})
