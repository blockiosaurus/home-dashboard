/** Chrome/Edge fire `beforeinstallprompt` once, often before React has
 * mounted, so it's captured here at module load (imported from main.tsx)
 * and handed to whichever component asks later. Safari and Firefox never
 * fire it; InstallBanner falls back to written instructions there. */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => {
  for (const l of listeners) l()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep Chrome's own mini-infobar from popping up; we show our banner.
    e.preventDefault()
    deferred = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export const getInstallPrompt = () => deferred

export const subscribeInstallPrompt = (fn: () => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const consumeInstallPrompt = async (): Promise<boolean> => {
  const e = deferred
  if (!e) return false
  deferred = null
  notify()
  await e.prompt()
  return (await e.userChoice).outcome === 'accepted'
}

export const isStandalone = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export const isIos = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac; touch support gives it away.
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** A home-screen app is pinned to the origin it was installed from, so one
 * installed from a DHCP-assigned IP breaks when the Pi's lease changes. */
export const isRawIp = (hostname: string): boolean => /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
