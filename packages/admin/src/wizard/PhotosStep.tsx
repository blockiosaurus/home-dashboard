import { WizardCard, WizardFooter } from './WizardCard'

/** The wizard's last step. Its Continue button reads "Finish" and runs the
 * save (people + system settings) that used to live in a separate `DoneStep`
 * screen. */
export const PhotosStep = ({
  onBack,
  onFinish,
  isFinishing,
  finishError,
}: {
  onBack: () => void
  onFinish: () => void
  isFinishing: boolean
  finishError: unknown
}) => {
  return (
    <WizardCard
      title="Photo slideshow"
      footer={
        <>
          {finishError ? (
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {finishError instanceof Error ? finishError.message : 'Something went wrong.'}
            </p>
          ) : null}
          <WizardFooter
            onBack={onBack}
            onContinue={onFinish}
            continueLabel={isFinishing ? 'Saving…' : 'Finish'}
            continueDisabled={isFinishing}
          />
        </>
      }
    >
      <p className="mt-2 text-sm text-[var(--text-dim)]">
        The dashboard plays photos from a folder on the device. Drop your family photos into:
      </p>
      <code className="mt-3 block rounded-lg bg-gray-100 p-3 text-xs">
        /var/lib/dashboard/photos/
      </code>
      <p className="mt-3 text-xs text-[var(--text-dim)]">
        Or, in development, <code>packages/server/data/photos/</code>. JPG, PNG, WebP, AVIF, GIF all
        work — subfolders too. The dashboard rescans every hour.
      </p>
    </WizardCard>
  )
}
