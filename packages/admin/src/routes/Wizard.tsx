import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

  const stepId = WIZARD_STEPS[state.stepIndex]
  const goBack = () => setState((s) => ({ ...s, stepIndex: Math.max(0, s.stepIndex - 1) }))
  const goNext = () =>
    setState((s) => ({ ...s, stepIndex: Math.min(WIZARD_STEPS.length - 1, s.stepIndex + 1) }))

  return (
    <div className="flex h-full flex-col">
      <WizardProgress current={state.stepIndex} total={WIZARD_STEPS.length} />

      {stepId === 'connect' && <ConnectStep onContinue={goNext} />}

      {stepId === 'people' && (
        <PeopleStep
          people={state.draft.people}
          onBack={goBack}
          onContinue={(people) => {
            setState((s) => ({ ...s, draft: { ...s.draft, people }, stepIndex: s.stepIndex + 1 }))
          }}
        />
      )}

      {stepId === 'weather' && (
        <WeatherStep
          weather={state.draft.weather}
          onBack={goBack}
          onContinue={(weather) => {
            setState((s) => ({ ...s, draft: { ...s.draft, weather }, stepIndex: s.stepIndex + 1 }))
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
