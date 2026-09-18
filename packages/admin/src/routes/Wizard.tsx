import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { CalendarsStep } from '../wizard/CalendarsStep'
import { ConnectStep } from '../wizard/ConnectStep'
import { PeopleStep } from '../wizard/PeopleStep'
import { PhotosStep } from '../wizard/PhotosStep'
import { WeatherStep } from '../wizard/WeatherStep'
import { WizardProgress } from '../wizard/WizardCard'
import {
  WIZARD_STEPS,
  clearWizardState,
  loadWizardState,
  saveWizardState,
  useFinishWizard,
} from '../wizard/state'

export const Wizard = () => {
  const navigate = useNavigate()
  const [state, setState] = useState(() => loadWizardState())
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: api.getAccounts })

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
  // it entirely (not shown, not counted in "Step N of M") otherwise. Since
  // that can change while the wizard is open (the user just connected), the
  // persisted stepIndex is re-interpreted as an index into whichever list is
  // currently visible, clamped to stay in range.
  const connected = (accounts.data?.accounts.length ?? 0) > 0
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
