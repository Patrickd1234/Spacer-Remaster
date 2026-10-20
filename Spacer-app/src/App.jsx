import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './supabase'
import { PreferencesProvider } from './PreferencesContext'
import { RoleProvider } from './RoleContext'
import MfaChallenge from './components/MfaChallenge'
import ErrorBoundary from './components/ErrorBoundary'
import { hasTrustedDeviceFor, clearTrustedDevice } from './trustedDevice'

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
const Welcome = lazy(() => import('./Welcome'))
const ForgotPassword = lazy(() => import('./ForgotPassword'))
const ResetPassword = lazy(() => import('./ResetPassword'))

const PageLoader = () => (
  <div className="bg-background text-on-background min-h-screen flex items-center justify-center">
    <span className="material-symbols-outlined animate-spin text-4xl text-primary-fixed">progress_activity</span>
  </div>
)

// One crashing page shows a recovery screen instead of blanking the app.
// Keyed by path so moving to another page starts fresh.
function PageErrorBoundary({ children }) {
  const { pathname } = useLocation()
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
}

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
  // Server's answer on whether this browser's remembered-device token is valid
  const [deviceTrust, setDeviceTrust] = useState(null) // { userId, trusted }
  const mfaPending = needsSecondFactor(session)
  const userId = session?.user?.id
  const hasLocalTrust = mfaPending && hasTrustedDeviceFor(userId)

  // Remembered device: confirm the token with the server instead of asking for a code
  useEffect(() => {
    if (!hasLocalTrust) return
    let active = true
    supabase.rpc('is_trusted_device').then(({ data, error }) => {
      if (!active) return
      const trusted = !error && data === true
      if (!trusted) clearTrustedDevice() // expired or revoked
      setDeviceTrust({ userId, trusted })
    })
    return () => { active = false }
  }, [hasLocalTrust, userId])

  // Signed in far enough to load data: second factor passed or device remembered
  const sessionReady = Boolean(session) &&
    (!mfaPending || (hasLocalTrust && deviceTrust?.userId === userId && deviceTrust?.trusted))

  // Which organization the user belongs to (null = none yet -> /welcome)
  const [orgStatus, setOrgStatus] = useState(null) // { userId, orgId }

  // Accept any pending invite for this email, then read the user's organization.
  // Returns whether they now belong to one.
  const refreshOrganization = useCallback(async () => {
    const { data: { session: current } } = await supabase.auth.getSession()
    const currentUserId = current?.user?.id
    if (!currentUserId) return false
    const { error: claimError } = await supabase.rpc('claim_pending_invites')
    if (claimError) console.error('Claiming pending invites failed:', claimError)
    const { data, error } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', currentUserId)
      .maybeSingle()
    if (error) console.error('Loading organization failed:', error)
    const orgId = data?.organization_id ?? null
    setOrgStatus({ userId: currentUserId, orgId })
    return Boolean(orgId)
  }, [])

  useEffect(() => {
    if (!sessionReady || orgStatus?.userId === userId) return
    let active = true
    // Deferred so it never runs inside the auth state callback's call stack
    const timer = setTimeout(() => { if (active) refreshOrganization() }, 0)
    return () => { active = false; clearTimeout(timer) }
  }, [sessionReady, userId, orgStatus?.userId, refreshOrganization])

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

  if (loading) return <PageLoader />

  // Signed in with the password (or Google) but the account requires its
  // authenticator code: nothing else is shown until it's entered — unless this
  // device was remembered within the last 7 days (the server accepts its token).
  // Verifying fires onAuthStateChange with an upgraded session, which clears this.
  if (session && mfaPending) {
    const trustChecked = deviceTrust?.userId === userId
    if (hasLocalTrust && !trustChecked) return <PageLoader />
    if (!(hasLocalTrust && deviceTrust?.trusted)) {
      return <MfaChallenge onVerified={() => supabase.auth.getSession().then(({ data }) => setSession(data.session))} />
    }
  }

  // Signed in, organization not known yet
  if (sessionReady && orgStatus?.userId !== userId) return <PageLoader />
  const hasOrganization = Boolean(session) && Boolean(orgStatus?.orgId)

  // Pages that need an organization: no session -> login, no org -> get started
  const inOrganization = (page) =>
    !session ? <Navigate to="/login" replace /> : hasOrganization ? page : <Navigate to="/welcome" replace />
  // Pages only for signed-in users without an organization
  const withoutOrganization = (page) =>
    !session ? <Navigate to="/login" replace /> : hasOrganization ? <Navigate to="/" replace /> : page

  return (
    <PreferencesProvider>
      <RoleProvider>
        <Router>
          <PageErrorBoundary>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={inOrganization(<Home />)} />
            <Route path="/welcome" element={withoutOrganization(<Welcome onOrganizationChanged={refreshOrganization} />)} />
            <Route path="/login" element={!session ? <Login /> : <Navigate to="/" replace />} />
            <Route path="/signup" element={!session ? <Signup /> : <Navigate to="/" replace />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* Always reachable: the invite magic-link itself establishes a session
                before a password is set, so this can't be gated behind `session`
                the way other routes are. */}
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/launch" element={withoutOrganization(<LaunchOrganization onOrganizationChanged={refreshOrganization} />)} />
            <Route path="/onboarding" element={inOrganization(<Onboarding />)} />
            <Route path="/reports" element={inOrganization(<Reports />)} />
            <Route path="/department" element={inOrganization(<Department />)} />
            <Route path="/calendar" element={inOrganization(<CalendarView />)} />
            <Route path="/profile" element={inOrganization(<Profile />)} />
            <Route path="/settings" element={inOrganization(<Settings />)} />
            <Route path="/tasks" element={inOrganization(<Tasks />)} />
            <Route path="/project_page/:project_id" element={inOrganization(<ProjectPage />)} />
          </Routes>
          </Suspense>
          </PageErrorBoundary>
        </Router>
      </RoleProvider>
    </PreferencesProvider>
  )
}

export default App
