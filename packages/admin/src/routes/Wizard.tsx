import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { CalendarsStep } from '../wizard/CalendarsStep'
import { ConnectStep } from '../wizard/ConnectStep'
import { PeopleStep } from '../wizard/PeopleStep'
import { PhotosStep } from '../wizard/PhotosStep'
import { WeatherStep } from '../wizard/WeatherStep'
import { SkipForNow, WizardCard, WizardProgress } from '../wizard/WizardCard'
import {
  WIZARD_STEPS,
  clearWizardState,
  draftFromSaved,
  isPristineDraft,
  loadWizardState,
  saveWizardState,
  useFinishWizard,
} from '../wizard/state'

export const Wizard = () => {
  const navigate = useNavigate()
  const [restored] = useState(() => loadWizardState())
  const [state, setState] = useState(restored.state)
  const [proceedWithoutAccounts, setProceedWithoutAccounts] = useState(false)
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: api.getAccounts })
  const people = useQuery({ queryKey: ['people'], queryFn: api.getPeople })
  const system = useQuery({ queryKey: ['system'], queryFn: api.getSystem })

  // Re-running setup should start from what's already configured, not from
  // four blank name fields — `finishWizard` deletes the fixed person slots
  // whose name is blank, so clicking through a re-run used to wipe the family
  // members. Seed once, and only into an untouched draft from a fresh entry:
  // a session restored mid-wizard keeps its own answers (including names the
  // user deliberately cleared to remove someone).
  const seeded = useRef(restored.restored)
  useEffect(() => {
    if (seeded.current) return
    if (!people.isSuccess || !system.isSuccess) return
    seeded.current = true
    setState((s) =>
      isPristineDraft(s.draft)
        ? { ...s, draft: draftFromSaved(people.data.people, system.data.weatherDefault) }
        : s,
    )
  }, [people.isSuccess, people.data, system.isSuccess, system.data])

  // Persist step index + draft on every change so a refresh mid-wizard lands
  // back on the same step with the same answers. OAuth device codes never
  // pass through this state (ConnectStep keeps that locally), so there's
  // nothing sensitive to worry about here.
  useEffect(() => {
    saveWizardState(state)
  }, [state])

  const finish = useFinishWizard(() => {
    clearWizardState()
    navigate('/editor')
  })

  // The calendars step only makes sense once an account is connected — skip
  // it entirely (not shown, not counted in "Step N of M") otherwise. While
  // the accounts query is still in flight, "no accounts yet" is ambiguous
  // with "genuinely none connected" — computing visibleSteps against that
  // in-between state would land on the wrong step (e.g. a persisted
  // stepIndex of 2 briefly resolving to 'weather' in a 4-step list, then
  // snapping to 'people' once the real 5-step list arrives). So render a
  // neutral placeholder until the query settles (success or error) — with
  // its own Skip for now, since Task 1 requires every connect-flow state to
  // offer one and an unreachable server (default TanStack retries) would
  // otherwise strand the user here with no control at all.
  const settled = accounts.isSuccess || accounts.isError
  if (!settled && !proceedWithoutAccounts) {
    return (
      <div className="flex h-full flex-col">
        <WizardCard
          title="Setting things up"
          footer={
            <SkipForNow
              onSkip={() => {
                setProceedWithoutAccounts(true)
                // Same destination as the connect step's own Skip: the step
                // right after 'connect' in the not-connected (4-step) list.
                setState((s) => ({ ...s, stepIndex: 1 }))
              }}
            />
          }
        >
          <p className="mt-2 text-sm text-[var(--text-dim)]">Loading…</p>
        </WizardCard>
      </div>
    )
  }

  // Since connected/not-connected can also change while the wizard stays
  // open (the user just connected, or skipped above before the query had
  // resolved), the persisted stepIndex is re-interpreted as an index into
  // whichever list is currently visible, clamped to stay in range. An
  // unsettled query (only possible here via the skip above) reads as "not
  // connected" for now — once it does resolve, this recomputes from the real
  // data and the calendars step simply appears if warranted.
  const connected = settled && (accounts.data?.accounts.length ?? 0) > 0
  const visibleSteps = WIZARD_STEPS.filter((step) => step !== 'calendars' || connected)
  const stepIndex = Math.min(Math.max(state.stepIndex, 0), visibleSteps.length - 1)
  const stepId = visibleSteps[stepIndex]

  const goBack = () => setState((s) => ({ ...s, stepIndex: Math.max(0, stepIndex - 1) }))
  const goNext = () =>
    setState((s) => ({ ...s, stepIndex: Math.min(visibleSteps.length - 1, stepIndex + 1) }))

  return (
    <div className="flex h-full flex-col">
      <WizardProgress current={stepIndex} total={visibleSteps.length} />

      {stepId === 'connect' && <ConnectStep onContinue={goNext} />}

      {stepId === 'calendars' && <CalendarsStep onBack={goBack} onContinue={goNext} />}

      {stepId === 'people' && (
        <PeopleStep
          people={state.draft.people}
          onBack={goBack}
          onContinue={(people) => {
            setState((s) => ({
              ...s,
              draft: { ...s.draft, people },
              stepIndex: Math.min(visibleSteps.length - 1, stepIndex + 1),
            }))
          }}
        />
      )}

      {stepId === 'weather' && (
        <WeatherStep
          weather={state.draft.weather}
          onBack={goBack}
          onContinue={(weather) => {
            setState((s) => ({
              ...s,
              draft: { ...s.draft, weather },
              stepIndex: Math.min(visibleSteps.length - 1, stepIndex + 1),
            }))
          }}
        />
      )}

      {stepId === 'photos' && (
        <PhotosStep
          onBack={goBack}
          onFinish={() => finish.mutate(state.draft)}
          isFinishing={finish.isPending}
          finishError={finish.isError ? finish.error : null}
        />
      )}
    </div>
  )
}
