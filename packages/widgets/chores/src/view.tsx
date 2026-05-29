import { useEffect, useState } from 'react'

export interface ChoresConfig {
  instanceId: string
  title?: string
  initial?: string[]
}

interface ChoreItem {
  id: string
  text: string
  done: boolean
}

interface ChoresState {
  items: ChoreItem[]
}

const stateUrl = (instanceId: string) => `/api/widgets/${instanceId}/state`

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const ChoresView = ({ config }: { config: ChoresConfig; data: undefined }) => {
  const [state, setState] = useState<ChoresState>({
    items: (config.initial ?? []).map((text) => ({ id: newId(), text, done: false })),
  })
  const [version, setVersion] = useState(0)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(stateUrl(config.instanceId))
      if (res.status === 404) return
      if (!res.ok) return
      const j = (await res.json()) as { version: number; data: ChoresState }
      if (!cancelled) {
        setState(j.data)
        setVersion(j.version)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [config.instanceId])

  const persist = async (next: ChoresState) => {
    setState(next)
    const body: { widgetId: string; data: ChoresState; expectedVersion?: number } = {
      widgetId: 'chores',
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

  const toggle = (id: string) => {
    void persist({
      items: state.items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)),
    })
  }

  const add = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    void persist({ items: [...state.items, { id: newId(), text, done: false }] })
  }

  return (
    <div className="flex h-full flex-col p-3">
      <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
        {config.title ?? 'Chores'}
      </div>
      <div className="mt-2 flex flex-1 flex-col gap-1 overflow-y-auto">
        {state.items.map((item) => (
          <label key={item.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={item.done}
              onChange={() => toggle(item.id)}
              className="h-4 w-4"
            />
            <span className={item.done ? 'line-through text-[var(--text-dim)]' : ''}>
              {item.text}
            </span>
          </label>
        ))}
        {state.items.length === 0 ? (
          <div className="text-xs text-[var(--text-dim)]">No chores yet — add one below.</div>
        ) : null}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="mt-2 flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a chore"
          className="flex-1 rounded-md border border-[var(--text-dim)]/30 bg-white px-2 py-1 text-sm"
        />
        <button
          type="submit"
          className="rounded-md px-3 py-1 text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          Add
        </button>
      </form>
    </div>
  )
}
