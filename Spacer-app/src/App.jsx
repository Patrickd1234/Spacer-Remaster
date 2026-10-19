import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabase'
import { PreferencesProvider } from './PreferencesContext'
import { RoleProvider } from './RoleContext'

// Pages load on first visit instead of all up front
const Home = lazy(() => import('./home'))
const Login = lazy(() => import('./Login'))
const Signup = lazy(() => import('./signup'))
const LaunchOrganization = lazy(() => import('./Launch_Organization'))
const ProjectPage = lazy(() => import('./project_page'))
const Onboarding = lazy(() => import('./onboarding'))
const Reports = lazy(() => import('./Reports'))
const Profile = lazy(() => import('./Profile'))
const Department = lazy(() => import('./Department'))
const CalendarView = lazy(() => import('./CalendarView'))
const Settings = lazy(() => import('./Settings'))
const Tasks = lazy(() => import('./Tasks'))
const AcceptInvite = lazy(() => import('./AcceptInvite'))
const ForgotPassword = lazy(() => import('./ForgotPassword'))
const ResetPassword = lazy(() => import('./ResetPassword'))

const PageLoader = () => (
  <div className="bg-background text-on-background min-h-screen flex items-center justify-center">
    <span className="material-symbols-outlined animate-spin text-4xl text-primary-fixed">progress_activity</span>
  </div>
)

const syncedUserIds = new Set()

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
        // Ensure the profile row exists in the background — never block the
        // first render on it, and only try once per user per page load.
        if (!syncedUserIds.has(activeSession.user.id)) {
          syncedUserIds.add(activeSession.user.id)
          syncUserProfile(activeSession.user)
        }
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

  if (loading) return <PageLoader />

  return (
    <PreferencesProvider>
      <RoleProvider>
        <Router>
          <Suspense fallback={<PageLoader />}>
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
          </Suspense>
        </Router>
      </RoleProvider>
    </PreferencesProvider>
  )
}

export default App
