import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { LocationValue } from '../components/LocationPicker'

/**
 * Ordered wizard steps. `'calendars'` is skipped at render time (not shown,
 * not counted in "Step N of M") when no Google account is connected — see
 * `Wizard.tsx`, which filters this list against the `['accounts']` query.
 */
export const WIZARD_STEPS = ['connect', 'calendars', 'people', 'weather', 'photos'] as const

export type WizardStepId = (typeof WIZARD_STEPS)[number]

export interface PersonDraft {
  id: string
  name: string
  color: string
  primaryCalendarId: string | null
}

export interface WeatherDraft {
  /** `null` until the user picks a location — dropping the old NYC default
   * means Continue on the weather step must stay disabled until this is
   * set. */
  location: LocationValue | null
  unit: 'celsius' | 'fahrenheit'
}

/** The part of the wizard's working state that survives a refresh. */
export interface WizardDraft {
  people: PersonDraft[]
  weather: WeatherDraft
}

export interface WizardState {
  stepIndex: number
  draft: WizardDraft
}

const STORAGE_KEY = 'dashboard.wizard'

const DEFAULT_PEOPLE: PersonDraft[] = [
  { id: 'p1', name: '', color: '#ff7eb6', primaryCalendarId: null },
  { id: 'p2', name: '', color: '#5b6cff', primaryCalendarId: null },
  { id: 'p3', name: '', color: '#ffb13b', primaryCalendarId: null },
  { id: 'p4', name: '', color: '#36c47a', primaryCalendarId: null },
]

const DEFAULT_WEATHER: WeatherDraft = {
  location: null,
  unit: 'fahrenheit',
}

export const createInitialWizardState = (): WizardState => ({
  stepIndex: 0,
  draft: {
    people: DEFAULT_PEOPLE.map((p) => ({ ...p })),
    weather: { ...DEFAULT_WEATHER },
  },
})

const isPersonDraft = (value: unknown): value is PersonDraft => {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.color === 'string' &&
    (v.primaryCalendarId === null || typeof v.primaryCalendarId === 'string')
  )
}

const isLocationValue = (value: unknown): value is LocationValue => {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.lat === 'number' && typeof v.lon === 'number' && typeof v.label === 'string'
}

const isWeatherDraft = (value: unknown): value is WeatherDraft => {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    (v.unit === 'celsius' || v.unit === 'fahrenheit') &&
    (v.location === null || isLocationValue(v.location))
  )
}

const isWizardState = (value: unknown): value is WizardState => {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.stepIndex !== 'number') return false
  if (!Number.isInteger(v.stepIndex) || v.stepIndex < 0 || v.stepIndex >= WIZARD_STEPS.length) {
    return false
  }
  if (typeof v.draft !== 'object' || v.draft === null) return false
  const draft = v.draft as Record<string, unknown>
  if (!Array.isArray(draft.people) || !draft.people.every(isPersonDraft)) return false
  if (!isWeatherDraft(draft.weather)) return false
  return true
}

/** Restores wizard progress from sessionStorage. Never throws — malformed or
 * missing data falls back to the defaults. Device codes are never stored here
 * (`ConnectStep` keeps that in local component state), so there is nothing
 * OAuth-related to worry about restoring.
 *
 * `restored` says whether this came back from storage, which is what tells
 * `Wizard` apart a resumed session (leave the answers alone) from a fresh
 * entry (safe to pre-fill from what's already saved on the server). */
export const loadWizardState = (): { state: WizardState; restored: boolean } => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { state: createInitialWizardState(), restored: false }
    const parsed: unknown = JSON.parse(raw)
    return isWizardState(parsed)
      ? { state: parsed, restored: true }
      : { state: createInitialWizardState(), restored: false }
  } catch {
    return { state: createInitialWizardState(), restored: false }
  }
}

/** True while the draft still holds exactly the blank defaults — i.e. the
 * user has not typed anything yet, so replacing it can't lose their work. */
export const isPristineDraft = (draft: WizardDraft): boolean =>
  draft.weather.location === null &&
  draft.weather.unit === DEFAULT_WEATHER.unit &&
  draft.people.length === DEFAULT_PEOPLE.length &&
  draft.people.every((p, i) => {
    const d = DEFAULT_PEOPLE[i]
    return (
      d !== undefined &&
      p.id === d.id &&
      p.name === '' &&
      p.color === d.color &&
      p.primaryCalendarId === null
    )
  })

/** Builds a draft from what's already saved, so re-running setup starts from
 * the current family members and weather location instead of four blank name
 * fields — which `finishWizard` would otherwise read as "delete these people".
 * People saved outside the four fixed slots have no field to show them and
 * are left untouched on the server. */
export const draftFromSaved = (
  people: Array<{ id: string; name: string; color: string; primaryCalendarId: string | null }>,
  weatherDefault: {
    lat: number
    lon: number
    unit: 'celsius' | 'fahrenheit'
    label?: string
  } | null,
): WizardDraft => ({
  people: DEFAULT_PEOPLE.map((slot) => {
    const saved = people.find((p) => p.id === slot.id)
    if (!saved) return { ...slot }
    return {
      id: slot.id,
      name: saved.name,
      color: saved.color,
      primaryCalendarId: saved.primaryCalendarId,
    }
  }),
  weather: weatherDefault
    ? {
        location: {
          lat: weatherDefault.lat,
          lon: weatherDefault.lon,
          // A saved location without a label predates the city search; show
          // its coordinates rather than an empty chip.
          label:
            weatherDefault.label && weatherDefault.label.length > 0
              ? weatherDefault.label
              : `${weatherDefault.lat.toFixed(2)}, ${weatherDefault.lon.toFixed(2)}`,
        },
        unit: weatherDefault.unit,
      }
    : { ...DEFAULT_WEATHER },
})

export const saveWizardState = (state: WizardState) => {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Private browsing / storage disabled / quota exceeded — losing step
    // persistence isn't worth surfacing an error over.
  }
}

export const clearWizardState = () => {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

const FIXED_PERSON_IDS = new Set(['p1', 'p2', 'p3', 'p4'])

/** Saves people and system settings collected across the wizard. Exported
 * standalone (in addition to the `useFinishWizard` hook below) so a later
 * task can call it outside of a component. */
export const finishWizard = async (draft: WizardDraft) => {
  for (const person of draft.people) {
    const name = person.name.trim()
    if (name.length > 0) {
      await api.putPerson(person.id, {
        name,
        color: person.color,
        primaryCalendarId: person.primaryCalendarId,
      })
    } else if (FIXED_PERSON_IDS.has(person.id)) {
      // A cleared name on one of the four fixed slots removes that person on
      // re-run instead of leaving a stale record with an empty name.
      await api.deletePerson(person.id)
    }
  }
  return api.putSystem({
    firstRunComplete: true,
    // `draft.weather.location` is only ever null while the weather step's
    // Continue button is disabled, so by the time finishWizard runs (the
    // last step) it's always set — but stay defensive rather than assume.
    weatherDefault: draft.weather.location
      ? {
          lat: draft.weather.location.lat,
          lon: draft.weather.location.lon,
          unit: draft.weather.unit,
          label: draft.weather.location.label,
        }
      : null,
  })
}

/** Runs `finishWizard` as a mutation, then calls `onFinished` (navigation,
 * clearing session storage, etc). Kept small so a later task can reuse the
 * save logic. */
export const useFinishWizard = (onFinished: () => void) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: finishWizard,
    onSuccess: (result) => {
      // Seed the cache with fresh data before navigating so Shell's redirect
      // check (`system.firstRunComplete`) doesn't fire on the stale
      // pre-wizard value and bounce us straight back to /wizard.
      queryClient.setQueryData(['system'], result)
      queryClient.invalidateQueries({ queryKey: ['system'] })
      onFinished()
    },
  })
}
