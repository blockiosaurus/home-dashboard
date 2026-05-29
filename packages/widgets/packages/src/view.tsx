import { useEffect, useState } from 'react'

export interface PackagesConfig {
  instanceId: string
  title?: string
}

interface Pkg {
  id: string
  label: string
  expectedDate: string
  arrived: boolean
}

interface PackagesState {
  items: Pkg[]
}

const stateUrl = (id: string) => `/api/widgets/${id}/state`

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const PackagesView = ({ config }: { config: PackagesConfig; data: undefined }) => {
  const [state, setState] = useState<PackagesState>({ items: [] })
  const [version, setVersion] = useState(0)
  const [label, setLabel] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(stateUrl(config.instanceId))
      if (res.status === 404) return
      if (!res.ok) return
      const j = (await res.json()) as { version: number; data: PackagesState }
      if (!cancelled) {
        setState(j.data)
        setVersion(j.version)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [config.instanceId])

  const persist = async (next: PackagesState) => {
    setState(next)
    const body: { widgetId: string; data: PackagesState; expectedVersion?: number } = {
      widgetId: 'packages',
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

  const add = () => {
    if (!label.trim() || !date) return
    void persist({
      items: [
        ...state.items,
        { id: newId(), label: label.trim(), expectedDate: date, arrived: false },
      ],
    })
    setLabel('')
    setDate('')
  }

  const toggle = (id: string) => {
    void persist({
      items: state.items.map((p) => (p.id === id ? { ...p, arrived: !p.arrived } : p)),
    })
  }

  const remove = (id: string) => {
    void persist({ items: state.items.filter((p) => p.id !== id) })
  }

  return (
    <div className="flex h-full flex-col p-3">
      <div
        className="text-xs font-bold uppercase tracking-wider"
        style={{ color: 'var(--accent)' }}
      >
        {config.title ?? 'Packages'}
      </div>
      <div className="mt-2 flex flex-1 flex-col gap-1 overflow-y-auto">
        {state.items.map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={p.arrived}
              onChange={() => toggle(p.id)}
              className="h-4 w-4"
            />
            <span className={p.arrived ? 'flex-1 text-[var(--text-dim)] line-through' : 'flex-1'}>
              {p.label}
            </span>
            <span className="text-xs text-[var(--text-dim)]">{p.expectedDate}</span>
            <button
              type="button"
              onClick={() => remove(p.id)}
              className="text-[10px] text-[var(--text-dim)] underline"
            >
              remove
            </button>
          </div>
        ))}
        {state.items.length === 0 ? (
          <div className="text-xs text-[var(--text-dim)]">No deliveries tracked.</div>
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
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="What"
          className="flex-1 rounded-md border border-[var(--text-dim)]/30 bg-white px-2 py-1 text-sm"
        />
        <input
          value={date}
          onChange={(e) => setDate(e.target.value)}
          type="date"
          className="rounded-md border border-[var(--text-dim)]/30 bg-white px-2 py-1 text-sm"
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
