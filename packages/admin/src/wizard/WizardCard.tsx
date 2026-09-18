import { Button, Card } from '@dashboard/ui'
import type { ReactNode } from 'react'

export const WizardProgress = ({ current, total }: { current: number; total: number }) => (
  <div className="flex flex-col items-center gap-2 pt-6">
    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)]">
      Step {current + 1} of {total}
    </p>
    <div className="flex gap-2">
      {Array.from({ length: total }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: dots are positional and never reordered
          key={i}
          className={`h-2 w-2 rounded-full ${i === current ? 'bg-[var(--accent)]' : 'bg-[var(--text-dim)]/30'}`}
        />
      ))}
    </div>
  </div>
)

export interface WizardCardProps {
  title: string
  subtitle?: ReactNode
  children?: ReactNode
  /** Nothing is rendered when omitted — this is not a default Back/Continue
   * row. Pass `WizardFooter` for that, `SkipForNow` alone, or a combination
   * (e.g. `ConnectStep`'s phase-specific buttons) as needed. */
  footer?: ReactNode
}

/** Shared card shell for a wizard step: title, subtitle, body, footer. */
export const WizardCard = ({ title, subtitle, children, footer }: WizardCardProps) => (
  <div className="flex flex-1 items-center justify-center p-6">
    <Card className="w-full max-w-md">
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-[var(--text-dim)]">{subtitle}</p> : null}
      {children}
      {footer}
    </Card>
  </div>
)

export interface WizardFooterProps {
  /** Omit on the first step — no Back button is rendered. */
  onBack?: () => void
  onContinue: () => void
  continueLabel?: string
  continueDisabled?: boolean
}

/** The Back (ghost, hidden on the first step) + primary Continue/Finish row
 * shared by wizard step cards. */
export const WizardFooter = ({
  onBack,
  onContinue,
  continueLabel = 'Continue',
  continueDisabled = false,
}: WizardFooterProps) => (
  <div className="mt-6 flex gap-3">
    {onBack ? (
      <Button variant="ghost" className="flex-1" onClick={onBack}>
        Back
      </Button>
    ) : null}
    <Button className="flex-1" onClick={onContinue} disabled={continueDisabled}>
      {continueLabel}
    </Button>
  </div>
)

/** A dismissive "skip this" text link, shared by any wizard state that lets
 * the user move on without finishing it (every connect-flow state, including
 * while the wizard is still waiting to find out whether an account is
 * already connected). */
export const SkipForNow = ({ onSkip }: { onSkip: () => void }) => (
  <button
    type="button"
    onClick={onSkip}
    className="mt-3 w-full py-2 text-center text-sm text-[var(--text-dim)] underline decoration-dotted"
  >
    Skip for now — you can connect a calendar later from Settings
  </button>
)
