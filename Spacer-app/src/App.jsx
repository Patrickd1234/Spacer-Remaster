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
import Settings from './Settings'
import Tasks from './Tasks'
import AcceptInvite from './AcceptInvite'
import ForgotPassword from './ForgotPassword'
import ResetPassword from './ResetPassword'
import { supabase } from './supabase'
import { PreferencesProvider } from './PreferencesContext'
import { RoleProvider } from './RoleContext'

const syncUserProfile = async (user) => {
  if (!user?.id || !user?.email) return

  const fallbackName = user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0] || 'User'

  try {
    const { error } = await supabase.from('users').insert({
      id: user.id,
      email: user.email,
      name: fallbackName
    })

    if (error) {
      const message = error.message?.toLowerCase() || ''
      const isDuplicate = message.includes('duplicate') || message.includes('already exists')
      if (!isDuplicate) {
        console.error('Error inserting user profile:', error)
      }
    }
  } catch (error) {
    console.error('Error syncing user profile:', error)
  }
}

const logLoginActivity = async (user) => {
  try {
    await supabase.from('activity_log').insert({
      entity_type: 'user',
      entity_id: user.id,
      actor_id: user.id,
      action: 'login',
      new_state: { email: user.email }
    })
  } catch (error) {
    console.error('Error logging login activity:', error)
  }
}

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const handleSession = async (activeSession) => {
      setSession(activeSession)

      if (activeSession?.user) {
        localStorage.setItem('userId', activeSession.user.id)
        localStorage.setItem('userEmail', activeSession.user.email)
        await syncUserProfile(activeSession.user)
      } else {
        localStorage.removeItem('userId')
        localStorage.removeItem('userEmail')
      }
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await handleSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session)
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
      <RoleProvider>
        <Router>
          <Routes>
            <Route path="/" element={session ? <Home /> : <Navigate to="/login" replace />} />
            <Route path="/login" element={!session ? <Login /> : <Navigate to="/" replace />} />
            <Route path="/signup" element={!session ? <Signup /> : <Navigate to="/" replace />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* Always reachable: the invite magic-link itself establishes a session
                before a password is set, so this can't be gated behind `session`
                the way other routes are. */}
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/launch" element={session ? <LaunchOrganization /> : <Navigate to="/login" replace />} />
            <Route path="/onboarding" element={session ? <Onboarding /> : <Navigate to="/login" replace />} />
            <Route path="/reports" element={session ? <Reports /> : <Navigate to="/login" replace />} />
            <Route path="/department" element={session ? <Department /> : <Navigate to="/login" replace />} />
            <Route path="/calendar" element={session ? <CalendarView /> : <Navigate to="/login" replace />} />
            <Route path="/profile" element={session ? <Profile /> : <Navigate to="/login" replace />} />
            <Route path="/settings" element={session ? <Settings /> : <Navigate to="/login" replace />} />
            <Route path="/tasks" element={session ? <Tasks /> : <Navigate to="/login" replace />} />
            <Route path="/project_page/:project_id" element={session ? <ProjectPage /> : <Navigate to="/login" replace />} />
          </Routes>
        </Router>
      </RoleProvider>
    </PreferencesProvider>
  )
}

export default App
