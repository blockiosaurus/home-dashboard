import { Input } from '@dashboard/ui'
import { useState } from 'react'
import { WizardCard, WizardFooter } from './WizardCard'
import type { PersonDraft } from './state'

const COLORS = ['#ff7eb6', '#5b6cff', '#ffb13b', '#36c47a']

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
  return (
    <WizardCard
      title="Family members"
      subtitle="Up to four — leave blank to skip."
      footer={<WizardFooter onBack={onBack} onContinue={() => onContinue(draft)} />}
    >
      <div className="mt-4 space-y-3">
        {draft.map((p, idx) => (
          <div key={p.id} className="flex items-center gap-3">
            <span className="inline-block h-8 w-8 rounded-full" style={{ background: p.color }} />
            <Input
              value={p.name}
              placeholder={`Person ${idx + 1}`}
              onChange={(e) => {
                const next = [...draft]
                next[idx] = { ...p, name: e.target.value }
                setDraft(next)
              }}
            />
            <select
              value={p.color}
              onChange={(e) => {
                const next = [...draft]
                next[idx] = { ...p, color: e.target.value }
                setDraft(next)
              }}
              className="rounded-lg border border-[var(--text-dim)]/30 bg-white px-2 py-2 text-sm"
            >
              {COLORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </WizardCard>
  )
}
