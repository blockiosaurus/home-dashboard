import { Card } from '@dashboard/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { PERSON_COLORS, PersonRow, type PersonRowValue } from './PersonRow'

const FIXED_PERSON_IDS = ['p1', 'p2', 'p3', 'p4'] as const

const defaultRow = (id: string, idx: number): PersonRowValue => ({
  id,
  name: '',
  color: PERSON_COLORS[idx % PERSON_COLORS.length] ?? '#ff7eb6',
  primaryCalendarId: null,
})

/** Settings-page counterpart to the wizard's People step, so family members
 * (and their calendar) can be edited later without re-running the wizard.
 * Always shows the four fixed slots (p1..p4), pre-filled from `getPeople()`
 * where a person already exists for that slot. Saves each row as soon as a
 * field is ready to persist (see `PersonRow`'s `onCommit`) — clearing a
 * name deletes that person, same rule the wizard uses on Finish. */
export const PeoplePanel = () => {
  const qc = useQueryClient()
  const peopleQuery = useQuery({ queryKey: ['people'], queryFn: api.getPeople })
  const calendarsQuery = useQuery({ queryKey: ['calendars'], queryFn: api.getCalendars })
  const calendars = calendarsQuery.data?.calendars ?? []

  const [rows, setRows] = useState<PersonRowValue[]>(() =>
    FIXED_PERSON_IDS.map((id, idx) => defaultRow(id, idx)),
  )

  // Re-seed local editable state whenever the server data changes (initial
  // load, or after a save round-trips through the `people` query).
  useEffect(() => {
    if (!peopleQuery.data) return
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
    mutationFn: async (row: PersonRowValue) => {
      const name = row.name.trim()
      if (name.length === 0) {
        await api.deletePerson(row.id)
        return
      }
      await api.putPerson(row.id, {
        name,
        color: row.color,
        primaryCalendarId: row.primaryCalendarId,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['people'] }),
  })

  return (
    <Card>
      <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-dim)]">People</h3>
      <div className="mt-3 space-y-3">
        {rows.map((row, idx) => (
          <PersonRow
            key={row.id}
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
        ))}
      </div>
    </Card>
  )
}
