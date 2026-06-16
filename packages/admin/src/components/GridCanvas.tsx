import type { LayoutCell } from '@dashboard/core'
import { GRID_COLS, GRID_ROWS } from '@dashboard/core'
import { useEffect, useState } from 'react'
import RGL, { WidthProvider } from 'react-grid-layout'
import type ReactGridLayout from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { clampCell } from '../grid-utils'

// WidthProvider measures the container itself, avoiding race conditions
// between our ResizeObserver and RGL's pixel→grid math (which was almost
// certainly causing widgets to land at column 0).
const ResponsiveRGL = WidthProvider(RGL)

type Layout = ReactGridLayout.Layout

export interface GridCanvasProps {
  cells: LayoutCell[]
  onChange: (cells: LayoutCell[]) => void
  onSelect: (instanceId: string | null) => void
  selectedInstanceId: string | null
}

const toLayout = (cells: LayoutCell[]): Layout[] =>
  cells.map((c) => ({ i: c.instanceId, x: c.x, y: c.y, w: c.w, h: c.h }))

const sameLayout = (a: Layout[], b: Layout[]): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]
    const bi = b[i]
    if (!ai || !bi) return false
    if (ai.i !== bi.i || ai.x !== bi.x || ai.y !== bi.y || ai.w !== bi.w || ai.h !== bi.h)
      return false
  }
  return true
}

export const GridCanvas = ({ cells, onChange, onSelect, selectedInstanceId }: GridCanvasProps) => {
  // Hold the layout locally so RGL can manage positions during drag/resize
  // without us echoing every interim frame back through props and triggering
  // a re-sync. We push to the parent only on drag/resize stop.
  const [layout, setLayout] = useState<Layout[]>(() => toLayout(cells))

  // Re-seed when the cells set changes from outside (add/remove widget, scene
  // load). Skip when the new layout is identical to avoid clobbering an
  // in-flight drag.
  useEffect(() => {
    const next = toLayout(cells)
    setLayout((prev) => (sameLayout(prev, next) ? prev : next))
  }, [cells])

  const persist = (next: Layout[]) => {
    onChange(
      cells.map((c) => {
        const l = next.find((x) => x.i === c.instanceId)
        if (!l) return c
        return clampCell({ ...c, x: l.x, y: l.y, w: l.w, h: l.h })
      }),
    )
  }

  return (
    <ResponsiveRGL
      className="rounded-2xl bg-white shadow-[var(--shadow-card)]"
      cols={GRID_COLS}
      maxRows={GRID_ROWS}
      rowHeight={40}
      layout={layout}
      // Track live moves in local state so RGL has stable reference between
      // frames. Don't notify the parent until interaction ends.
      onLayoutChange={(next) => setLayout(next)}
      onDragStop={(next) => persist(next)}
      onResizeStop={(next) => persist(next)}
      compactType={null}
      verticalCompact={false}
      preventCollision={false}
      allowOverlap
      isBounded
      isDraggable
      isResizable
      useCSSTransforms
    >
      {cells.map((c) => (
        <div
          key={c.instanceId}
          className={`flex items-center justify-center rounded-lg border-2 ${
            selectedInstanceId === c.instanceId
              ? 'border-[var(--accent)] bg-[var(--accent)]/10'
              : 'border-dashed border-[var(--accent)]/40 bg-[var(--accent)]/5'
          } text-xs font-semibold text-[var(--accent)]`}
          onMouseDown={() => onSelect(c.instanceId)}
          onTouchStart={() => onSelect(c.instanceId)}
        >
          {c.widgetId}
        </div>
      ))}
    </ResponsiveRGL>
  )
}
