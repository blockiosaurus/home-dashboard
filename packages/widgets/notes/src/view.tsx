import { useEffect, useRef, useState } from 'react'

export interface NotesConfig {
  instanceId: string
  title?: string
}

interface NotesState {
  text: string
}

const stateUrl = (id: string) => `/api/widgets/${id}/state`

export const NotesView = ({ config }: { config: NotesConfig; data: undefined }) => {
  const [text, setText] = useState('')
  const [version, setVersion] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch(stateUrl(config.instanceId))
      if (res.status === 404) return
      if (!res.ok) return
      const j = (await res.json()) as { version: number; data: NotesState }
      if (!cancelled) {
        setText(j.data.text)
        setVersion(j.version)
      }
    })()
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [config.instanceId])

  const schedule = (next: string) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void persist(next), 500)
  }

  const persist = async (next: string) => {
    const body: { widgetId: string; data: NotesState; expectedVersion?: number } = {
      widgetId: 'notes',
      data: { text: next },
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
      <div
        className="text-xs font-bold uppercase tracking-wider"
        style={{ color: 'var(--accent)' }}
      >
        {config.title ?? 'Notes'}
      </div>
      <textarea
        className="mt-2 flex-1 resize-none rounded-md border border-[var(--text-dim)]/30 bg-white p-2 text-sm leading-relaxed"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          schedule(e.target.value)
        }}
        placeholder="Write something for the family…"
      />
    </div>
  )
}
