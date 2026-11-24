import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import { PreferencesProvider } from './PreferencesContext'
import { RoleProvider } from './RoleContext'
import MfaChallenge from './components/MfaChallenge'
import MfaSetupRequired from './components/MfaSetupRequired'
import ErrorBoundary from './components/ErrorBoundary'
import { hasTrustedDeviceFor, clearTrustedDevice } from './trustedDevice'
import { mfaSetupState, hasVerifiedFactor } from './mfaSetupGate'
import PlanetLoader from "./components/PlanetLoader"
import { clearSavedProjectLists } from "./projectListCache"

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
const SetPassword = lazy(() => import('./SetPassword'))
const GeneralOverview = lazy(() => import('./general/GeneralOverview'))
const Announcements = lazy(() => import('./general/Announcements'))
const CompanyCalendar = lazy(() => import('./general/CompanyCalendar'))
const Directory = lazy(() => import('./general/Directory'))
const Privacy = lazy(() => import('./Privacy'))
const Terms = lazy(() => import('./Terms'))

// Pages that set the password themselves, so the gate below leaves them alone
const SETS_OWN_PASSWORD = new Set(['/accept-invite', '/reset-password'])

// Accounts without a password (Google sign-ups, unfinished invites) must set
// one before using the app
function PasswordGate({ needsPassword, email, onPasswordSet, children }) {
  const { pathname } = useLocation()
  if (needsPassword && !SETS_OWN_PASSWORD.has(pathname)) {
    return <SetPassword email={email} onPasswordSet={onPasswordSet} />
  }
  return children
}

// Drawn with CSS, not an icon: the icon font may not have loaded yet at startup
const PageLoader = () => (
  <div className="bg-canvas min-h-screen flex items-center justify-center">
    <PlanetLoader label="Loading" className="text-[44px] text-accent" />
  </div>
)

// One crashing page shows a recovery screen instead of blanking the app.
// Keyed by path so moving to another page starts fresh.
// A fresh project page per project, so nothing from the previous one lingers
function ProjectPageRoute() {
  const { project_id } = useParams()
  return <ProjectPage key={project_id} />
}

function PageErrorBoundary({ children }) {
  const { pathname } = useLocation()
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
}

// True when the account has two-factor on but this session has only passed the
// password step. Read from the session itself (no API call), because calling
// Supabase inside onAuthStateChange can deadlock.
function needsSecondFactor(session) {
  if (!hasVerifiedFactor(session?.user)) return false
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

  // Admins, super admins and team leads must set up two-factor first; the
  // database gives them no data until they do. { userId, required }
  const [mfaSetupCheck, setMfaSetupCheck] = useState(null)
  const accountHasFactor = hasVerifiedFactor(session?.user)
  const setupState = mfaSetupState({ userId, hasVerifiedFactor: accountHasFactor, check: mfaSetupCheck })

  // Asks the server; on failure lets them in (the database still enforces the rule)
  const checkMfaSetup = useCallback(async (forUserId) => {
    const { data, error } = await supabase.rpc('mfa_setup_required')
    if (error) console.error('Checking whether two-factor is required failed:', error)
    const required = !error && data === true
    setMfaSetupCheck({ userId: forUserId, required })
    return required
  }, [])

  useEffect(() => {
    if (setupState !== 'checking') return
    let active = true
    // Deferred so it never runs inside the auth state callback's call stack
    const timer = setTimeout(() => { if (active) checkMfaSetup(userId) }, 0)
    return () => { active = false; clearTimeout(timer) }
  }, [setupState, userId, checkMfaSetup])

  // Signed in far enough to load data: second factor passed or device remembered,
  // and no two-factor setup outstanding
  const sessionReady = Boolean(session) && setupState === 'none' &&
    (!mfaPending || (hasLocalTrust && deviceTrust?.userId === userId && deviceTrust?.trusted))

  // Which organization the user belongs to (null = none yet -> /welcome)
  const [orgStatus, setOrgStatus] = useState(null) // { userId, orgId }
  // Whether the account has a password (false = show SetPassword)
  const [passwordStatus, setPasswordStatus] = useState(null) // { userId, hasPassword }

  const refreshPasswordStatus = useCallback(async () => {
    const { data: { session: current } } = await supabase.auth.getSession()
    const currentUserId = current?.user?.id
    if (!currentUserId) return
    const { data, error } = await supabase.rpc('has_password')
    // On failure let them in rather than lock them out; the next load asks again
    if (error) console.error('Checking for a password failed:', error)
    setPasswordStatus({ userId: currentUserId, hasPassword: error ? null : data })
  }, [])

  useEffect(() => {
    if (!sessionReady || passwordStatus?.userId === userId) return
    let active = true
    const timer = setTimeout(() => { if (active) refreshPasswordStatus() }, 0)
    return () => { active = false; clearTimeout(timer) }
  }, [sessionReady, userId, passwordStatus?.userId, refreshPasswordStatus])

  // Accept any pending invite for this email, then read the user's organization.
  // Returns whether they now belong to one.
  const refreshOrganization = useCallback(async () => {
    const { data: { session: current } } = await supabase.auth.getSession()
    const currentUserId = current?.user?.id
    if (!currentUserId) return false
    const { error: claimError } = await supabase.rpc('claim_pending_invites')
    if (claimError) console.error('Claiming pending invites failed:', claimError)
    // An invite or a newly launched organization may have just made them an
    // admin or team lead: then two-factor comes first (their organization is
    // read once it's set up, as the database hides it until then)
    if (!hasVerifiedFactor(current.user) && await checkMfaSetup(currentUserId)) return true
    const { data, error } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', currentUserId)
      .maybeSingle()
    if (error) {
      // Not the same as "no organization": don't send them to /welcome (B-03)
      console.error('Loading organization failed:', error)
      setOrgStatus({ userId: currentUserId, orgId: null, failed: true })
      return false
    }
    const orgId = data?.organization_id ?? null
    setOrgStatus({ userId: currentUserId, orgId })
    return Boolean(orgId)
  }, [checkMfaSetup])

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
        clearSavedProjectLists()
      }
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await handleSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      handleSession(session)
      // A password was set on /accept-invite or /reset-password: re-check, deferred
      // because calling Supabase inside this callback can deadlock
      if (event === 'USER_UPDATED') setTimeout(refreshPasswordStatus, 0)
    })

    return () => subscription.unsubscribe()
  }, [refreshPasswordStatus])

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

  // A manager without two-factor: set it up before anything else. Enrolling
  // upgrades the session to aal2, so the data unlocks right after.
  if (session && setupState === 'checking') return <PageLoader />
  if (session && setupState === 'required') {
    // Organization re-read: it was hidden while two-factor was missing
    const handleEnabled = () => {
      setMfaSetupCheck({ userId, required: false })
      setOrgStatus(null)
    }
    return <MfaSetupRequired onEnabled={handleEnabled} />
  }

  // Signed in, organization or password status not known yet
  if (sessionReady && (orgStatus?.userId !== userId || passwordStatus?.userId !== userId)) return <PageLoader />
  // The organization couldn't be read: offer a retry instead of the "get started" page
  if (sessionReady && orgStatus?.failed) {
    return (
      <div role="alert" className="min-h-screen bg-panel flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-white text-lg font-semibold">We couldn't load your organization.</p>
        <p className="text-muted text-sm max-w-sm">Check your connection and try again.</p>
        <div className="flex gap-3">
          <button type="button" onClick={() => setOrgStatus(null)} className="px-4 py-2 rounded-lg bg-accent text-black text-sm font-semibold">Try again</button>
          <button type="button" onClick={() => supabase.auth.signOut()} className="px-4 py-2 rounded-lg border border-line text-muted text-sm">Sign out</button>
        </div>
      </div>
    )
  }
  const needsPassword = sessionReady && passwordStatus?.hasPassword === false
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
          <PasswordGate
            needsPassword={needsPassword}
            email={session?.user?.email}
            onPasswordSet={() => setPasswordStatus({ userId, hasPassword: true })}
          >
          <Routes>
            <Route path="/" element={inOrganization(<Home />)} />
            <Route path="/welcome" element={withoutOrganization(<Welcome onOrganizationChanged={refreshOrganization} />)} />
            <Route path="/login" element={!session ? <Login /> : <Navigate to="/" replace />} />
            <Route path="/signup" element={!session ? <Signup /> : <Navigate to="/" replace />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* Public, signed in or not: Google's consent screen links here */}
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
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
            <Route path="/general" element={inOrganization(<GeneralOverview />)} />
            <Route path="/general/announcements" element={inOrganization(<Announcements />)} />
            <Route path="/general/calendar" element={inOrganization(<CompanyCalendar />)} />
            <Route path="/general/directory" element={inOrganization(<Directory />)} />
            <Route path="/project_page/:project_id" element={inOrganization(<ProjectPageRoute />)} />
          </Routes>
          </PasswordGate>
          </Suspense>
          </PageErrorBoundary>
        </Router>
      </RoleProvider>
    </PreferencesProvider>
  )
}

export default App
