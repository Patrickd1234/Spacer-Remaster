import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Home from './home'
import Login from './Login'
import Signup from './signup'
import LaunchOrganization from './Launch_Organization'
import ProjectPage from './project_page'
import Onboarding from './onboarding'
import { supabase } from './supabase'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check active session on mount
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

    // Listen to changes in auth state
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
    <Router>
      <Routes>
        <Route path="/" element={session ? <Home /> : <Navigate to="/login" />} />
        <Route path="/login" element={session ? <Navigate to="/" /> : <Login />} />
        <Route path="/signup" element={session ? <Navigate to="/" /> : <Signup />} />
        <Route path="/launch" element={session ? <LaunchOrganization /> : <Navigate to="/login" />} />
        <Route path="/project_page/:project_id" element={session ? <ProjectPage /> : <Navigate to="/login" />} />
        <Route path="/onboarding" element={session ? <Onboarding /> : <Navigate to="/login" />} />

      </Routes>
    </Router>
  )
}

export default App
