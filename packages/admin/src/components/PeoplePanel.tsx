import { Card } from '@dashboard/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { type Person, api } from '../api'
import { PERSON_COLORS, PersonRow, type PersonRowValue } from './PersonRow'

const FIXED_PERSON_IDS = ['p1', 'p2', 'p3', 'p4'] as const

const defaultRow = (id: string, idx: number): PersonRowValue => ({
  id,
  name: '',
  color: PERSON_COLORS[idx % PERSON_COLORS.length] ?? '#ff7eb6',
  primaryCalendarId: null,
})

type SaveResult =
  | { id: string; deleted: true }
  | { id: string; deleted: false; name: string; color: string; primaryCalendarId: string | null }

/** Settings-page counterpart to the wizard's People step, so family members
 * (and their calendar) can be edited later without re-running the wizard.
 * Always shows the four fixed slots (p1..p4), pre-filled from `getPeople()`
 * where a person already exists for that slot. Saves each row as soon as a
 * field is ready to persist (see `PersonRow`'s `onCommit`) — clearing a
 * name deletes that person, same rule the wizard uses on Finish.
 *
 * Local `rows` state is seeded from the server exactly once (on first
 * load), not re-synced on every `people` query update: with four
 * independently-editable rows, a commit from one row must not clobber an
 * uncommitted edit the user is mid-typing in another. After that initial
 * seed, each save updates the `['people']` cache directly with the value
 * just saved (or removes it, on delete) instead of invalidating and
 * refetching the whole list. */
export const PeoplePanel = () => {
  const qc = useQueryClient()
  const peopleQuery = useQuery({ queryKey: ['people'], queryFn: api.getPeople })
  const calendarsQuery = useQuery({ queryKey: ['calendars'], queryFn: api.getCalendars })
  const calendars = calendarsQuery.data?.calendars ?? []

  const [rows, setRows] = useState<PersonRowValue[]>(() =>
    FIXED_PERSON_IDS.map((id, idx) => defaultRow(id, idx)),
  )
  const [saveErrors, setSaveErrors] = useState<Record<string, boolean>>({})
  const seededRef = useRef(false)

  useEffect(() => {
    if (seededRef.current || !peopleQuery.data) return
    seededRef.current = true
    const byId = new Map(peopleQuery.data.people.map((p) => [p.id, p]))
    setRows(
      FIXED_PERSON_IDS.map((id, idx) => {
        const existing = byId.get(id)
        return existing
          ? {
              id,
              name: existing.name,
              color: existing.color,
              primaryCalendarId: existing.primaryCalendarId,
            }
          : defaultRow(id, idx)
      }),
    )
  }, [peopleQuery.data])

  const save = useMutation({
    mutationFn: async (row: PersonRowValue): Promise<SaveResult> => {
      const name = row.name.trim()
      if (name.length === 0) {
        await api.deletePerson(row.id)
        return { id: row.id, deleted: true }
      }
      await api.putPerson(row.id, {
        name,
        color: row.color,
        primaryCalendarId: row.primaryCalendarId,
      })
      return {
        id: row.id,
        deleted: false,
        name,
        color: row.color,
        primaryCalendarId: row.primaryCalendarId,
      }
    },
    onMutate: (row) => {
      setSaveErrors((prev) => {
        if (!(row.id in prev)) return prev
        const next = { ...prev }
        delete next[row.id]
        return next
      })
    },
    onSuccess: (result) => {
      qc.setQueryData<{ people: Person[] }>(['people'], (old) => {
        const people = old?.people ?? []
        if (result.deleted) {
          return { people: people.filter((p) => p.id !== result.id) }
        }
        const updated: Person = {
          id: result.id,
          name: result.name,
          color: result.color,
          primaryCalendarId: result.primaryCalendarId,
        }
        const idx = people.findIndex((p) => p.id === result.id)
        if (idx === -1) return { people: [...people, updated] }
        const next = [...people]
        next[idx] = updated
        return { people: next }
      })
    },
    onError: (_err, row) => {
      setSaveErrors((prev) => ({ ...prev, [row.id]: true }))
    },
  })

  return (
    <Card>
      <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-dim)]">People</h3>
      <div className="mt-3 space-y-3">
        {rows.map((row, idx) => (
          <div key={row.id}>
            <PersonRow
              value={row}
              index={idx}
              calendars={calendars}
              onChange={(next) => {
                const updated = [...rows]
                updated[idx] = next
                setRows(updated)
              }}
              onCommit={(next) => save.mutate(next)}
            />
            {saveErrors[row.id] ? (
              <p className="mt-1 text-xs text-red-600">Couldn't save. Try again.</p>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  )
}
