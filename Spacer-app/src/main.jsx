import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Ensure mock mode is disabled (use real Supabase)
localStorage.removeItem("use_mock_supabase")
localStorage.removeItem("mock_session")

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
