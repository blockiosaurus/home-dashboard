import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'
import { PersonRow } from '../components/PersonRow'
import { WizardCard, WizardFooter } from './WizardCard'
import type { PersonDraft } from './state'

export const PeopleStep = ({
  people,
  onBack,
  onContinue,
}: {
  people: PersonDraft[]
  onBack: () => void
  onContinue: (next: PersonDraft[]) => void
}) => {
  const [draft, setDraft] = useState(people)
  const { data } = useQuery({ queryKey: ['calendars'], queryFn: api.getCalendars })
  const calendars = data?.calendars ?? []

  return (
    <WizardCard
      title="Family members"
      subtitle="Up to four — leave blank to skip."
      footer={<WizardFooter onBack={onBack} onContinue={() => onContinue(draft)} />}
    >
      <div className="mt-4 space-y-3">
        {draft.map((p, idx) => (
          <PersonRow
            key={p.id}
            value={p}
            index={idx}
            calendars={calendars}
            onChange={(next) => {
              const updated = [...draft]
              updated[idx] = next
              setDraft(updated)
            }}
          />
        ))}
      </div>
    </WizardCard>
  )
}
