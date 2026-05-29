import type { LayoutCell } from '@dashboard/core'
import { create } from 'zustand'

export interface SceneDraft {
  id: string
  name: string
  isDefault: boolean
  cells: LayoutCell[]
  dirty: boolean
}

interface EditorState {
  draft: SceneDraft | null
  setDraft: (s: SceneDraft) => void
  setCells: (cells: LayoutCell[]) => void
  markClean: () => void
}

export const useEditorStore = create<EditorState>((set) => ({
  draft: null,
  setDraft: (s) => set({ draft: { ...s, dirty: false } }),
  setCells: (cells) =>
    set((state) => (state.draft ? { draft: { ...state.draft, cells, dirty: true } } : state)),
  markClean: () => set((state) => (state.draft ? { draft: { ...state.draft, dirty: false } } : state)),
}))
