import { Card } from '@dashboard/ui'
import { QRCodeSVG } from 'qrcode.react'

export interface SetupScreenProps {
  adminUrls: string[]
}

/**
 * Shown instead of a scene until `system.firstRunComplete` is true. Points
 * whoever is setting up the dashboard at the admin page on their phone —
 * the touchscreen itself has no keyboard for entering Google credentials,
 * a location, etc.
 */
export const SetupScreen = ({ adminUrls }: SetupScreenProps) => {
  const [firstUrl, ...restUrls] = adminUrls

  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <Card className="flex w-full max-w-xl flex-col items-center gap-5 p-8">
        <h1 className="text-3xl font-bold">Let's set up your dashboard</h1>

        {firstUrl ? (
          <>
            <p className="text-lg text-[var(--text-dim)]">On your phone, open</p>
            <p className="break-all text-2xl font-semibold text-[var(--accent)]">{firstUrl}</p>
            <QRCodeSVG value={firstUrl} size={220} />
            {restUrls.length > 0 ? (
              <div className="text-sm text-[var(--text-dim)]">
                <p>or use</p>
                {restUrls.map((url) => (
                  <p key={url} className="break-all">
                    {url}
                  </p>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-lg text-[var(--text-dim)]">
            Open the dashboard admin page from a phone on the same Wi-Fi.
          </p>
        )}

        <p className="mt-2 text-sm text-[var(--text-dim)]">
          This screen goes away as soon as setup finishes.
        </p>
      </Card>
    </div>
  )
}
