import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Home from './home'
import Login from './Login'
import Signup from './signup'
import LaunchOrganization from './Launch_Organization'
import ProjectPage from './project_page'
import Onboarding from './onboarding'
import Reports from './Reports'
import Profile from './Profile'
import Department from './Department'
import CalendarView from './CalendarView'
import Profile from './Profile'
import Settings from './Settings'
import { supabase } from './supabase'
import { PreferencesProvider } from './PreferencesContext'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session && session.user) {
        localStorage.setItem("userId", session.user.id)
        localStorage.setItem("userEmail", session.user.email)
      } else {
        localStorage.removeItem("userId")
        localStorage.removeItem("userEmail")
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session && session.user) {
        localStorage.setItem("userId", session.user.id)
        localStorage.setItem("userEmail", session.user.email)
      } else {
        localStorage.removeItem("userId")
        localStorage.removeItem("userEmail")
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="bg-background text-on-background min-h-screen flex items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary-fixed">progress_activity</span>
      </div>
    )
  }

  return (
    <PreferencesProvider>
      <Router>
        <Routes>
          <Route path="/" element={session ? <Home /> : <Navigate to="/login" replace />} />
          <Route path="/login" element={!session ? <Login /> : <Navigate to="/" replace />} />
          <Route path="/signup" element={!session ? <Signup /> : <Navigate to="/" replace />} />
          <Route path="/launch" element={session ? <LaunchOrganization /> : <Navigate to="/login" replace />} />
          <Route path="/onboarding" element={session ? <Onboarding /> : <Navigate to="/login" replace />} />
          <Route path="/reports" element={session ? <Reports /> : <Navigate to="/login" replace />} />
          <Route path="/department" element={session ? <Department /> : <Navigate to="/login" replace />} />
          <Route path="/calendar" element={session ? <CalendarView /> : <Navigate to="/login" replace />} />
          <Route path="/profile" element={session ? <Profile /> : <Navigate to="/login" replace />} />
          <Route path="/settings" element={session ? <Settings /> : <Navigate to="/login" replace />} />
          <Route path="/project_page/:project_id" element={session ? <ProjectPage /> : <Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </PreferencesProvider>
  )
}

export default App
