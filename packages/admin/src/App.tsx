import { OnScreenKeyboard } from '@dashboard/ui'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { NavLink, Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { api } from './api'
import { ImportEvents } from './routes/ImportEvents'
import { SceneEditor } from './routes/SceneEditor'
import { Settings } from './routes/Settings'
import { Wizard } from './routes/Wizard'

const qc = new QueryClient()

/** The admin is opened from two very different places: a phone, where the
 * device's own keyboard already works and our overlay would sit on top of it
 * covering the buttons, and the kiosk browser on the Pi's touchscreen, which
 * has no keyboard of its own and reaches the admin over localhost. So the
 * shared on-screen keyboard is opt-in here — `?keyboard=1` or localhost —
 * rather than following the `(pointer: coarse)` auto-detection the kiosk uses.
 * `?keyboard=0` forces it off, which is what desktop dev on localhost wants. */
const oskEnabled = (): boolean => {
  if (typeof window === 'undefined') return false
  const param = new URLSearchParams(window.location.search).get('keyboard')
  if (param === '1' || param === 'true') return true
  if (param === '0' || param === 'false') return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

const Shell = () => {
  const { data: system } = useQuery({ queryKey: ['system'], queryFn: api.getSystem })
  // Wait for a fresh read before deciding: the wizard's Finish step seeds this
  // query's cache before navigating, so an unset cache here means we haven't
  // seen the real value yet, not that firstRunComplete is false.
  if (!system) return null
  if (!system.firstRunComplete) return <Navigate to="/wizard" replace />

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-[var(--accent)] text-white' : 'text-[var(--text)] hover:bg-gray-100'}`

  return (
    <div className="flex h-full flex-col lg:flex-row">
      <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-gray-200 bg-white p-2 lg:w-56 lg:flex-col lg:items-stretch lg:overflow-visible lg:border-b-0 lg:border-r lg:p-4">
        <h2 className="mb-3 hidden text-xs font-bold uppercase tracking-wider text-[var(--text-dim)] lg:block">
          Dashboard
        </h2>
        <NavLink to="/editor" className={navLinkClass}>
          Scene editor
        </NavLink>
        <NavLink to="/import" className={navLinkClass}>
          Import events
        </NavLink>
        <NavLink to="/settings" className={navLinkClass}>
          Settings
        </NavLink>
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="ml-auto flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-[var(--text-dim)] hover:bg-gray-100 lg:ml-0 lg:mt-auto"
        >
          Open dashboard
        </a>
      </nav>
      <div className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/editor" replace />} />
          <Route path="/editor" element={<SceneEditor />} />
          <Route path="/import" element={<ImportEvents />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </div>
  )
}

export const App = () => (
  <QueryClientProvider client={qc}>
    <Router basename="/admin">
      <Routes>
        <Route path="/wizard" element={<Wizard />} />
        <Route path="*" element={<Shell />} />
      </Routes>
    </Router>
    <OnScreenKeyboard enabled={oskEnabled()} />
  </QueryClientProvider>
)
