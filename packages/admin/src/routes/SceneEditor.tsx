import type { LayoutCell, Scene } from '@dashboard/core'
import { Button } from '@dashboard/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { GridCanvas } from '../components/GridCanvas'
import { WidgetConfigPanel } from '../components/WidgetConfigPanel'
import { WidgetPalette } from '../components/WidgetPalette'
import { useEditorStore } from '../store'

export const SceneEditor = () => {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['scenes'], queryFn: api.getScenes })
  const { data: widgetData } = useQuery({ queryKey: ['widgets'], queryFn: api.getWidgets })
  const { draft, setDraft, setCells, setIsDefault, markClean } = useEditorStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!draft && data) {
      const active = (data.scenes.find((s) => s.isDefault) ?? data.scenes[0]) as Scene | undefined
      if (active) setDraft({ ...active, dirty: false })
    }
  }, [data, draft, setDraft])

  const publish = useMutation({
    mutationFn: async () => {
      if (!draft) return null
      return api.putScene({
        id: draft.id,
        name: draft.name,
        isDefault: draft.isDefault,
        cells: draft.cells,
      })
    },
    onSuccess: (saved) => {
      // The server has the last word on `isDefault` (it refuses to leave the
      // scene set with no default at all), so pull the draft back in line
      // with whatever it actually persisted rather than trusting the value
      // we sent.
      if (saved) setDraft({ ...saved, cells: saved.cells as LayoutCell[], dirty: false })
      else markClean()
      qc.invalidateQueries({ queryKey: ['scenes'] })
    },
  })

  const scenes = data?.scenes ?? []

  const onSelectScene = (id: string) => {
    if (id === draft?.id) return
    if (draft?.dirty && !window.confirm('Discard unpublished changes?')) return
    const next = scenes.find((s) => s.id === id) as Scene | undefined
    if (next) {
      setDraft({ ...next, dirty: false })
      setSelectedId(null)
    }
  }

  if (!draft) {
    return <div className="p-6 text-sm text-[var(--text-dim)]">Loading scene…</div>
  }

  const selectedCell: LayoutCell | null =
    draft.cells.find((c) => c.instanceId === selectedId) ?? null

  const onCanvasChange = (cells: LayoutCell[]) => setCells(cells)

  const onAddWidget = (cell: LayoutCell) => setCells([...draft.cells, cell])

  const widgetNames = Object.fromEntries(
    (widgetData?.widgets ?? []).map((w) => [w.id, w.name]),
  ) as Record<string, string>

  const onConfigChange = (next: LayoutCell) =>
    setCells(draft.cells.map((c) => (c.instanceId === next.instanceId ? next : c)))

  const onDelete = (instanceId: string) => {
    setCells(draft.cells.filter((c) => c.instanceId !== instanceId))
    setSelectedId(null)
  }

  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{draft.name}</h1>
          <label className="flex flex-col gap-1 text-sm">
            <span className="sr-only">Scene</span>
            <select
              value={draft.id}
              onChange={(e) => onSelectScene(e.target.value)}
              className="min-h-10 rounded-lg border border-[var(--text-dim)]/30 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-[var(--accent)]"
              checked={draft.isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Set as default
          </label>
        </div>
        <div className="flex items-center gap-2">
          {draft.dirty ? (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
              Unpublished
            </span>
          ) : (
            <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
              Live
            </span>
          )}
          <Button onClick={() => publish.mutate()} disabled={!draft.dirty || publish.isPending}>
            {publish.isPending ? 'Publishing…' : 'Publish'}
          </Button>
        </div>
      </div>
      {publish.isError ? (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {publish.error instanceof Error ? publish.error.message : 'Publish failed.'}
        </div>
      ) : null}
      <div className="flex flex-1 gap-3">
        <WidgetPalette existing={draft.cells} onAdd={onAddWidget} />
        <div className="flex-1 min-w-0">
          <GridCanvas
            cells={draft.cells}
            names={widgetNames}
            onChange={onCanvasChange}
            onSelect={setSelectedId}
            selectedInstanceId={selectedId}
          />
        </div>
        <WidgetConfigPanel
          cell={selectedCell}
          names={widgetNames}
          onChange={onConfigChange}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}
