import type { LayoutCell } from '@dashboard/core'
import { GRID_COLS, GRID_ROWS } from '@dashboard/core'
import RGL from 'react-grid-layout'
import type ReactGridLayout from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { clampCell } from '../grid-utils'

type Layout = ReactGridLayout.Layout

export interface GridCanvasProps {
  cells: LayoutCell[]
  onChange: (cells: LayoutCell[]) => void
  onSelect: (instanceId: string | null) => void
  selectedInstanceId: string | null
  width: number
}

const toLayout = (cells: LayoutCell[]): Layout[] =>
  cells.map((c) => ({
    i: c.instanceId,
    x: c.x,
    y: c.y,
    w: c.w,
    h: c.h,
  }))

export const GridCanvas = ({
  cells,
  onChange,
  onSelect,
  selectedInstanceId,
  width,
}: GridCanvasProps) => (
  <RGL
    className="rounded-2xl bg-white shadow-[var(--shadow-card)]"
    cols={GRID_COLS}
    maxRows={GRID_ROWS}
    rowHeight={40}
    width={width}
    layout={toLayout(cells)}
    onLayoutChange={(layout) =>
      onChange(
        cells.map((c) => {
          const l = layout.find((x) => x.i === c.instanceId)
          if (!l) return c
          return clampCell({ ...c, x: l.x, y: l.y, w: l.w, h: l.h })
        }),
      )
    }
    // Free-form layout: no auto-compaction, allow temporary overlap during
    // drag so widgets aren't snapped back/up when colliding. User is
    // responsible for resolving overlaps before Publish.
    compactType={null}
    verticalCompact={false}
    preventCollision={false}
    allowOverlap
    isBounded
    isDraggable
    isResizable
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
  </RGL>
)
