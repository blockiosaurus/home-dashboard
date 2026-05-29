import type { LayoutCell } from '@dashboard/core'
import { GRID_COLS, GRID_ROWS } from '@dashboard/core'

/**
 * Force a single cell inside the 8×12 grid: clamp width/height, then clamp
 * position so the cell never spills past the right or bottom edge.
 */
export const clampCell = (cell: LayoutCell): LayoutCell => {
  const w = Math.max(1, Math.min(cell.w, GRID_COLS))
  const h = Math.max(1, Math.min(cell.h, GRID_ROWS))
  const x = Math.max(0, Math.min(cell.x, GRID_COLS - w))
  const y = Math.max(0, Math.min(cell.y, GRID_ROWS - h))
  return { ...cell, x, y, w, h }
}

export const clampCells = (cells: LayoutCell[]): LayoutCell[] => cells.map(clampCell)

/** Returns true if `a` and `b` overlap. */
const overlaps = (a: LayoutCell, b: LayoutCell) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/**
 * Find the first (row-major) spot where a `w×h` rectangle fits without
 * colliding with any existing cell. Returns null when the grid is full.
 */
export const findEmptySpot = (
  existing: LayoutCell[],
  w: number,
  h: number,
): { x: number; y: number } | null => {
  const cw = Math.max(1, Math.min(w, GRID_COLS))
  const ch = Math.max(1, Math.min(h, GRID_ROWS))
  for (let y = 0; y <= GRID_ROWS - ch; y++) {
    for (let x = 0; x <= GRID_COLS - cw; x++) {
      const candidate = { x, y, w: cw, h: ch } as LayoutCell
      if (!existing.some((c) => overlaps(c, candidate))) return { x, y }
    }
  }
  return null
}
