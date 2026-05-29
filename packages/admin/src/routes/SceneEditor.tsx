import type { LayoutCell, Scene } from '@dashboard/core'
import { Button } from '@dashboard/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { GridCanvas } from '../components/GridCanvas'
import { WidgetConfigPanel } from '../components/WidgetConfigPanel'
import { WidgetPalette } from '../components/WidgetPalette'
import { useEditorStore } from '../store'

export const SceneEditor = () => {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['scenes'], queryFn: api.getScenes })
  const { draft, setDraft, setCells, markClean } = useEditorStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)

  useEffect(() => {
    if (!draft && data) {
      const active = (data.scenes.find((s) => s.isDefault) ?? data.scenes[0]) as Scene | undefined
      if (active) setDraft({ ...active, dirty: false })
    }
  }, [data, draft, setDraft])

  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  const publish = useMutation({
    mutationFn: async () => {
      if (!draft) return
      await api.putScene({
        id: draft.id,
        name: draft.name,
        isDefault: draft.isDefault,
        cells: draft.cells,
      })
    },
    onSuccess: () => {
      markClean()
      qc.invalidateQueries({ queryKey: ['scenes'] })
    },
  })

  if (!draft) {
    return <div className="p-6 text-sm text-[var(--text-dim)]">Loading scene…</div>
  }

  const selectedCell: LayoutCell | null =
    draft.cells.find((c) => c.instanceId === selectedId) ?? null

  const onCanvasChange = (cells: LayoutCell[]) => setCells(cells)

  const onAddWidget = (cell: LayoutCell) => setCells([...draft.cells, cell])

  const onConfigChange = (next: LayoutCell) =>
    setCells(draft.cells.map((c) => (c.instanceId === next.instanceId ? next : c)))

  const onDelete = (instanceId: string) => {
    setCells(draft.cells.filter((c) => c.instanceId !== instanceId))
    setSelectedId(null)
  }

  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{draft.name}</h1>
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
        <div className="flex-1" ref={ref}>
          <GridCanvas
            cells={draft.cells}
            onChange={onCanvasChange}
            onSelect={setSelectedId}
            selectedInstanceId={selectedId}
            width={width}
          />
        </div>
        <WidgetConfigPanel cell={selectedCell} onChange={onConfigChange} onDelete={onDelete} />
      </div>
    </div>
  )
}
