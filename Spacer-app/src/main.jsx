import './monitoring/start' // first, so errors while the app loads are reported
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './tailwind.css' // after index.css: same cascade order as the old Tailwind CDN
import App from './App.jsx'
import { rootErrorHandlers } from './monitoring/sentry'

// Ensure mock mode is disabled (use real Supabase)
localStorage.removeItem("use_mock_supabase")
localStorage.removeItem("mock_session")

// TRIAL: the Orbit space design across the whole app (see body.orbit-app in index.css).
// To revert, remove this line and that CSS block.
document.body.classList.add("orbit-app")

createRoot(document.getElementById('root'), rootErrorHandlers).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
