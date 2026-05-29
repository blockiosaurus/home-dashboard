import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { Navigate, NavLink, Route, BrowserRouter as Router, Routes } from 'react-router-dom'
import { api } from './api'
import { SceneEditor } from './routes/SceneEditor'
import { Settings } from './routes/Settings'
import { Wizard } from './routes/Wizard'

const qc = new QueryClient()

const Shell = () => {
  const { data: system } = useQuery({ queryKey: ['system'], queryFn: api.getSystem })
  if (system && !system.firstRunComplete) return <Navigate to="/wizard" replace />

  return (
    <div className="flex h-full">
      <nav className="flex w-56 flex-col gap-1 border-r border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">
          Dashboard
        </h2>
        <NavLink
          to="/editor"
          className={({ isActive }) =>
            `rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-[var(--accent)] text-white' : 'text-[var(--text)] hover:bg-gray-100'}`
          }
        >
          Scene editor
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-[var(--accent)] text-white' : 'text-[var(--text)] hover:bg-gray-100'}`
          }
        >
          Settings
        </NavLink>
      </nav>
      <div className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/editor" replace />} />
          <Route path="/editor" element={<SceneEditor />} />
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
  </QueryClientProvider>
)
