import { Button, Card } from '@dashboard/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api'

const CRON_RE = /^(\d+) (\d+) \* \* \*$/

/** `M H * * *` → `HH:MM` for the `<input type="time">`, or null when the
 * rule's cron doesn't fit that simple shape (a hand-edited or otherwise
 * "custom" rule, which this panel leaves alone — it only shows up in the
 * Advanced list). */
const parseTimeFromCron = (cronExpr: string): string | null => {
  const m = CRON_RE.exec(cronExpr)
  if (!m) return null
  const [, minute, hour] = m
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
}

const cronFromTime = (time: string): string => {
  const [hour, minute] = time.split(':')
  return `${Number(minute)} ${Number(hour)} * * *`
}

const START_ID = 'sleep-start'
const END_ID = 'sleep-end'
const LEGACY_START_ID = 'sleep-22'
const LEGACY_END_ID = 'wake-07'

/** "Sleep mode": a friendlier front end over the two schedule rules that
 * switch to a sleep scene at night and back at a wake time. Replaces the old
 * ScheduleEditor's raw cron/scene-id form for the common case; that form
 * still exists, collapsed, as "Advanced: all rules" for anything unusual. */
export const SleepSchedulePanel = () => {
  const qc = useQueryClient()
  const schedule = useQuery({ queryKey: ['schedule'], queryFn: api.getSchedule })
  const scenes = useQuery({ queryKey: ['scenes'], queryFn: api.getScenes })

  const rules = schedule.data?.rules ?? []
  const startRule =
    rules.find((r) => r.id === START_ID) ?? rules.find((r) => r.id === LEGACY_START_ID)
  const endRule = rules.find((r) => r.id === END_ID) ?? rules.find((r) => r.id === LEGACY_END_ID)
  const usingLegacyIds =
    (!rules.some((r) => r.id === START_ID) && rules.some((r) => r.id === LEGACY_START_ID)) ||
    (!rules.some((r) => r.id === END_ID) && rules.some((r) => r.id === LEGACY_END_ID))

  const sceneList = scenes.data?.scenes ?? []
  const defaultScene = sceneList.find((s) => s.isDefault)
  const fallbackSleepScene =
    sceneList.find((s) => s.id === 'sleep') ?? sceneList.find((s) => !s.isDefault)

  const [enabled, setEnabled] = useState(false)
  const [sleepSceneId, setSleepSceneId] = useState('')
  const [startTime, setStartTime] = useState('22:00')
  const [endTime, setEndTime] = useState('07:00')
  const [initialized, setInitialized] = useState(false)

  // Seed the form from the loaded rules exactly once — after that, the form
  // is the source of truth (subsequent refetches from our own saves
  // shouldn't stomp on it, same reasoning as PeoplePanel's seededRef).
  useEffect(() => {
    if (initialized || !schedule.data || !scenes.data) return
    setInitialized(true)
    setEnabled(Boolean(startRule && endRule))
    if (startRule) {
      setSleepSceneId(startRule.sceneId)
      const t = parseTimeFromCron(startRule.cronExpr)
      if (t) setStartTime(t)
    } else if (fallbackSleepScene) {
      setSleepSceneId(fallbackSleepScene.id)
    }
    if (endRule) {
      const t = parseTimeFromCron(endRule.cronExpr)
      if (t) setEndTime(t)
    }
  }, [initialized, schedule.data, scenes.data, startRule, endRule, fallbackSleepScene])

  const del = useMutation({
    mutationFn: api.deleteScheduleRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule'] }),
  })

  const save = useMutation({
    mutationFn: async (next: {
      enabled: boolean
      sleepSceneId: string
      startTime: string
      endTime: string
    }) => {
      if (usingLegacyIds) {
        await Promise.all([
          api.deleteScheduleRule(LEGACY_START_ID),
          api.deleteScheduleRule(LEGACY_END_ID),
        ])
      }
      if (!next.enabled) {
        await Promise.all([api.deleteScheduleRule(START_ID), api.deleteScheduleRule(END_ID)])
        return
      }
      const wakeSceneId = defaultScene?.id ?? 'default'
      await Promise.all([
        api.putScheduleRule(START_ID, {
          sceneId: next.sleepSceneId,
          cronExpr: cronFromTime(next.startTime),
          priority: 10,
        }),
        api.putScheduleRule(END_ID, {
          sceneId: wakeSceneId,
          cronExpr: cronFromTime(next.endTime),
          priority: 10,
        }),
      ])
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule'] }),
  })

  const toggle = (next: boolean) => {
    const effectiveSleepSceneId = sleepSceneId || fallbackSleepScene?.id || ''
    setEnabled(next)
    if (next) setSleepSceneId(effectiveSleepSceneId)
    save.mutate({ enabled: next, sleepSceneId: effectiveSleepSceneId, startTime, endTime })
  }

  const updateAndSave = (
    patch: Partial<{ sleepSceneId: string; startTime: string; endTime: string }>,
  ) => {
    const next = { sleepSceneId, startTime, endTime, ...patch }
    setSleepSceneId(next.sleepSceneId)
    setStartTime(next.startTime)
    setEndTime(next.endTime)
    save.mutate({ enabled: true, ...next })
  }

  return (
    <Card>
      <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-dim)]">
        Sleep schedule
      </h3>
      <div className="mt-3 space-y-3">
        <label className="flex min-h-10 items-center justify-between gap-3 py-2 text-sm font-semibold">
          <span>Sleep mode</span>
          <input
            type="checkbox"
            className="h-6 w-11 cursor-pointer"
            checked={enabled}
            onChange={(e) => toggle(e.target.checked)}
          />
        </label>
        {enabled ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-[var(--text-dim)]">Sleep scene</span>
              <select
                className="rounded-lg border border-[var(--text-dim)]/30 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                value={sleepSceneId}
                onChange={(e) => updateAndSave({ sleepSceneId: e.target.value })}
              >
                {sceneList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span className="font-semibold text-[var(--text-dim)]">Starts at</span>
                <input
                  type="time"
                  className="rounded-lg border border-[var(--text-dim)]/30 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  value={startTime}
                  onChange={(e) => updateAndSave({ startTime: e.target.value })}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span className="font-semibold text-[var(--text-dim)]">Ends at</span>
                <input
                  type="time"
                  className="rounded-lg border border-[var(--text-dim)]/30 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  value={endTime}
                  onChange={(e) => updateAndSave({ endTime: e.target.value })}
                />
              </label>
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--text-dim)]">
            Off — the dashboard shows the same scene all day and night.
          </p>
        )}
      </div>
      <details className="mt-4 border-t border-[var(--text-dim)]/20 pt-3">
        <summary className="cursor-pointer py-2 text-xs font-semibold text-[var(--text-dim)]">
          Advanced: all rules
        </summary>
        <div className="mt-3 space-y-2">
          {rules.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-[var(--text-dim)]/20 p-2 text-sm"
            >
              <span>
                <strong>{r.sceneId}</strong> @ <code>{r.cronExpr}</code> (p={r.priority})
              </span>
              <Button variant="ghost" onClick={() => del.mutate(r.id)}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      </details>
    </Card>
  )
}
