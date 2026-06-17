import '@dashboard/ui/tokens.css'
import './index.css'
import './widgets'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { RotatedRoot } from './RotatedRoot'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('root element missing')

createRoot(rootEl).render(
  <StrictMode>
    <RotatedRoot>
      <App />
    </RotatedRoot>
  </StrictMode>,
)
