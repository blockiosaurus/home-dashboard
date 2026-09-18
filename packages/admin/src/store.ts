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
  setIsDefault: (isDefault: boolean) => void
  markClean: () => void
}

export const useEditorStore = create<EditorState>((set) => ({
  draft: null,
  // Switching scenes (or the initial load) replaces the whole draft — there
  // is no per-scene draft cache, so unpublished edits to the previous
  // selection are gone once this is called (SceneEditor guards that with a
  // confirm() when the current draft is dirty).
  setDraft: (s) => set({ draft: { ...s, dirty: false } }),
  setCells: (cells) =>
    set((state) => (state.draft ? { draft: { ...state.draft, cells, dirty: true } } : state)),
  setIsDefault: (isDefault) =>
    set((state) => (state.draft ? { draft: { ...state.draft, isDefault, dirty: true } } : state)),
  markClean: () =>
    set((state) => (state.draft ? { draft: { ...state.draft, dirty: false } } : state)),
}))
