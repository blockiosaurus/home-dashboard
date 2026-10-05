import { Button } from '@dashboard/ui'
import { useQuery } from '@tanstack/react-query'
import { useState, useSyncExternalStore } from 'react'
import { api } from '../api'
import {
  consumeInstallPrompt,
  getInstallPrompt,
  isIos,
  isRawIp,
  isStandalone,
  subscribeInstallPrompt,
} from '../install-prompt'

const DISMISS_KEY = 'admin.installBanner.dismissed'

const readDismissed = (): boolean => {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/** Nudges phone users to put the admin on their home screen, and — more
 * importantly — to do it from the stable `<host>.local` address rather than
 * the IP the setup screen's QR code may have sent them to. Hidden on the
 * kiosk itself (localhost) and once dismissed. */
export const InstallBanner = () => {
  const { data: system } = useQuery({ queryKey: ['system'], queryFn: api.getSystem })
  const installPrompt = useSyncExternalStore(subscribeInstallPrompt, getInstallPrompt, () => null)
  const [dismissed, setDismissed] = useState(readDismissed)

  const host = window.location.hostname
  if (dismissed || host === 'localhost' || host === '127.0.0.1') return null

  const onIp = isRawIp(host)
  const standalone = isStandalone()
  // adminUrls[0] is the mDNS name. Optional: the wizard seeds this query
  // from the PUT response, which doesn't carry it.
  const localUrl = system?.adminUrls?.[0]
  if (standalone && !onIp) return null

  const dismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // private mode: the banner just comes back next visit
    }
  }

  let message: string
  if (onIp && localUrl) {
    message = standalone
      ? "This app was installed from the Pi's IP address, which can change. Open the address below and add it to your home screen again so it keeps working."
      : "You're using the Pi's IP address, which can change. Open the address below instead, then add it to your home screen."
  } else if (installPrompt) {
    message = 'Install the admin as an app for one-tap access from your home screen.'
  } else if (isIos()) {
    message = 'Add the admin to your home screen: tap Share, then "Add to Home Screen".'
  } else {
    message = 'Add the admin to your home screen from your browser menu ("Add to Home screen").'
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--accent)]/20 bg-[var(--accent)]/10 px-4 py-3 text-sm">
      <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="h-8 w-8 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p>{message}</p>
        {onIp && localUrl ? (
          <a href={localUrl} className="font-semibold text-[var(--accent)] underline">
            {localUrl}
          </a>
        ) : null}
      </div>
      {!onIp && installPrompt ? (
        <Button
          onClick={async () => {
            if (await consumeInstallPrompt()) dismiss()
          }}
        >
          Install
        </Button>
      ) : null}
      <Button variant="ghost" onClick={dismiss}>
        Not now
      </Button>
    </div>
  )
}
