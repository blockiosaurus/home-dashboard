import { type ReactNode, useEffect, useState } from 'react'

type Rotation = 0 | 90 | 180 | 270

const parseRotation = (raw: string | null): Rotation => {
  const n = Number(raw)
  return n === 90 || n === 180 || n === 270 ? n : 0
}

const readRotation = (): Rotation => {
  if (typeof window === 'undefined') return 0
  const params = new URLSearchParams(window.location.search)
  return parseRotation(params.get('rotate'))
}

/**
 * Wraps the dashboard in a rotated container so the kiosk can render
 * portrait while the physical display reports landscape. CSS-only — the
 * browser handles touch coordinate translation for free.
 *
 * Toggle via `?rotate=90|180|270` on the kiosk URL.
 */
export const RotatedRoot = ({ children }: { children: ReactNode }) => {
  const [rotation, setRotation] = useState<Rotation>(() => readRotation())

  // Respond to live URL changes (e.g. cage restart with a new URL).
  useEffect(() => {
    const onPop = () => setRotation(readRotation())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  if (rotation === 0) return <>{children}</>

  // For 90 / 270 rotations the page's *logical* width and height swap:
  // the content is sized like portrait but the viewport is landscape.
  const swap = rotation === 90 || rotation === 270
  const containerStyle: React.CSSProperties = swap
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vh',
        height: '100vw',
        transform:
          rotation === 90
            ? 'rotate(90deg) translateY(-100vh)'
            : 'rotate(-90deg) translateX(-100vw)',
        transformOrigin: 'top left',
      }
    : {
        position: 'fixed',
        inset: 0,
        transform: 'rotate(180deg)',
        transformOrigin: 'center',
      }

  return <div style={containerStyle}>{children}</div>
}
