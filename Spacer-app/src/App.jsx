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
import { supabase } from './supabase'
import { PreferencesProvider } from './PreferencesContext'
import { RoleProvider } from './RoleContext'
import MfaChallenge from './components/MfaChallenge'

// True when the account has two-factor on but this session has only passed the
// password step. Read from the session itself (no API call), because calling
// Supabase inside onAuthStateChange can deadlock.
function needsSecondFactor(session) {
  const hasVerifiedFactor = session?.user?.factors?.some(f => f.status === 'verified')
  if (!hasVerifiedFactor) return false
  try {
    const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload)).aal !== 'aal2'
  } catch {
    return true
  }
}

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const mfaPending = needsSecondFactor(session)

  useEffect(() => {
    // The users profile row is created by the on_auth_user_created database trigger
    const handleSession = async (activeSession) => {
      setSession(activeSession)

      if (activeSession?.user) {
        localStorage.setItem('userId', activeSession.user.id)
        localStorage.setItem('userEmail', activeSession.user.email)
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

  // Signed in with the password (or Google) but the account requires its
  // authenticator code: nothing else is shown until it's entered.
  // Verifying fires onAuthStateChange with an upgraded session, which clears this.
  if (session && mfaPending) {
    return <MfaChallenge onVerified={() => supabase.auth.getSession().then(({ data }) => setSession(data.session))} />
  }

  return (
    <PreferencesProvider>
      <RoleProvider>
        <Router>
          <Routes>
            <Route path="/" element={session ? <Home /> : <Navigate to="/login" replace />} />
            <Route path="/login" element={!session ? <Login /> : <Navigate to="/" replace />} />
            <Route path="/signup" element={!session ? <Signup /> : <Navigate to="/" replace />} />
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
