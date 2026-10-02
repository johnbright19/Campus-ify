import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AppProviders } from './app/AppProviders'
import './index.css'

// ---------------------------------------------------------------------------
// Campus-ify · client entry
//
// No backend is required: every engine (conflict detection, priority scoring,
// alternatives, waitlist promotion, automation workers, and the deterministic
// AI fallbacks) runs in this bundle against the seeded in-browser store.
// ---------------------------------------------------------------------------

const container = document.getElementById('root')

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders>
        <App />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>
)
