import { create } from 'zustand'

interface DashboardState {
  widgetData: Record<string, unknown>
  setWidgetData: (instanceId: string, payload: unknown) => void
  calendarBump: number
  bumpCalendar: () => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  widgetData: {},
  setWidgetData: (instanceId, payload) =>
    set((s) => ({ widgetData: { ...s.widgetData, [instanceId]: payload } })),
  calendarBump: 0,
  bumpCalendar: () => set((s) => ({ calendarBump: s.calendarBump + 1 })),
}))
