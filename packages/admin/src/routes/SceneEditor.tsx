import type { LayoutCell, Scene } from '@dashboard/core'
import { GRID_COLS, GRID_ROWS } from '@dashboard/core'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '../api'
import { useEditorStore } from '../store'

export const SceneEditor = () => {
  const { data } = useQuery({ queryKey: ['scenes'], queryFn: api.getScenes })
  const { draft, setDraft } = useEditorStore()

  useEffect(() => {
    if (!draft && data) {
      const active = (data.scenes.find((s) => s.isDefault) ?? data.scenes[0]) as Scene | undefined
      if (active) setDraft({ ...active, dirty: false })
    }
  }, [data, draft, setDraft])

  if (!draft) {
    return <div className="p-6 text-sm text-[var(--text-dim)]">Loading scene…</div>
  }

  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{draft.name}</h1>
        {draft.dirty ? (
          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
            Unpublished
          </span>
        ) : (
          <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
            Live
          </span>
        )}
      </div>
      <div
        className="grid gap-2 rounded-2xl bg-white p-4 shadow-[var(--shadow-card)]"
        style={{
          gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${GRID_ROWS}, 40px)`,
        }}
      >
        {draft.cells.map((c: LayoutCell) => (
          <div
            key={c.instanceId}
            className="flex items-center justify-center rounded-lg border-2 border-dashed border-[var(--accent)]/40 bg-[var(--accent)]/5 text-xs font-semibold text-[var(--accent)]"
            style={{
              gridColumn: `${c.x + 1} / span ${c.w}`,
              gridRow: `${c.y + 1} / span ${c.h}`,
            }}
          >
            {c.widgetId}
          </div>
        ))}
      </div>
    </div>
  )
}
