import { useQuery } from '@tanstack/react-query'
import { useRef } from 'react'
import { api } from '../api'
import { CalendarList } from '../components/CalendarList'
import { WizardCard, WizardFooter } from './WizardCard'

const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 60_000

/** Shown only when an account is connected (the orchestrator skips this step
 * otherwise). Calendars are discovered right after connecting (`runNow` on
 * the server), but that discovery call still has to round-trip to Google, so
 * the list can be empty for the first few seconds — poll for it rather than
 * showing a permanent blank state. */
export const CalendarsStep = ({
  onBack,
  onContinue,
}: {
  onBack: () => void
  onContinue: () => void
}) => {
  const startedAt = useRef(Date.now())
  const calendars = useQuery({
    queryKey: ['calendars'],
    queryFn: api.getCalendars,
    refetchInterval: (query) => {
      const data = query.state.data
      if (data && data.calendars.length > 0) return false
      if (Date.now() - startedAt.current >= POLL_TIMEOUT_MS) return false
      return POLL_INTERVAL_MS
    },
  })

  const list = calendars.data?.calendars ?? []
  const timedOut = list.length === 0 && Date.now() - startedAt.current >= POLL_TIMEOUT_MS

  return (
    <WizardCard
      title="Which calendars should show on the dashboard?"
      footer={<WizardFooter onBack={onBack} onContinue={onContinue} />}
    >
      <div className="mt-4">
        {list.length > 0 ? (
          <CalendarList calendars={list} />
        ) : timedOut ? (
          <p className="text-sm text-[var(--text-dim)]">
            No calendars found yet. They'll appear after the first sync; you can pick them in
            Settings later.
          </p>
        ) : (
          <p className="text-sm text-[var(--text-dim)]">Looking for your calendars…</p>
        )}
      </div>
    </WizardCard>
  )
}
