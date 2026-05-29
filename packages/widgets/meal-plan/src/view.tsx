import { format, startOfWeek, addDays } from 'date-fns'
import { useEffect, useState } from 'react'

export interface MealPlanConfig {
  instanceId: string
  title?: string
}

type WeekKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

interface MealPlanState {
  meals: Record<WeekKey, string>
}

const KEYS: WeekKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const emptyState = (): MealPlanState => ({
  meals: { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '' },
})

const stateUrl = (id: string) => `/api/widgets/${id}/state`

export const MealPlanView = ({ config }: { config: MealPlanConfig; data: undefined }) => {
  const [state, setState] = useState<MealPlanState>(emptyState)
  const [version, setVersion] = useState(0)
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(stateUrl(config.instanceId))
      if (res.status === 404) return
      if (!res.ok) return
      const j = (await res.json()) as { version: number; data: MealPlanState }
      if (!cancelled) {
        setState(j.data)
        setVersion(j.version)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [config.instanceId])

  const update = async (key: WeekKey, value: string) => {
    const next: MealPlanState = { meals: { ...state.meals, [key]: value } }
    setState(next)
    const body: { widgetId: string; data: MealPlanState; expectedVersion?: number } = {
      widgetId: 'meal-plan',
      data: next,
    }
    if (version > 0) body.expectedVersion = version
    const res = await fetch(stateUrl(config.instanceId), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const j = (await res.json()) as { version: number }
      setVersion(j.version)
    }
  }

  return (
    <div className="flex h-full flex-col p-3">
      <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
        {config.title ?? 'This week'}
      </div>
      <div className="mt-2 flex flex-1 flex-col gap-1 overflow-y-auto">
        {KEYS.map((k, i) => (
          <div key={k} className="flex items-center gap-2 text-sm">
            <span className="w-10 text-xs font-semibold uppercase text-[var(--text-dim)]">
              {format(addDays(monday, i), 'EEE')}
            </span>
            <input
              value={state.meals[k]}
              onChange={(e) => void update(k, e.target.value)}
              placeholder="—"
              className="flex-1 rounded-md border border-[var(--text-dim)]/30 bg-white px-2 py-1"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
