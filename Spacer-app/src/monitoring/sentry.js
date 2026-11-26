import * as Sentry from "@sentry/react";
import { supabase } from "../supabase";
import { scrubEvent } from "./scrub";

// Error monitoring. Off unless VITE_SENTRY_DSN is set, so local development
// and builds without it send nothing.
//
// What is sent: uncaught errors, errors caught by the page error boundary, and
// every console.error (most failed Supabase calls are logged that way), each
// with the last steps before it (pages visited, clicks, requests). Personal
// data is removed first (see scrub.js); the signed-in person is identified by
// their user id only. No session replay and no performance tracing.

const DSN = import.meta.env.VITE_SENTRY_DSN;

export const isMonitoringOn = Boolean(DSN);

export function startMonitoring() {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_RELEASE || undefined,
    sendDefaultPii: false,
    integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
    // Only errors from Spacer's own code, not from browser extensions
    allowUrls: [window.location.origin],
    ignoreErrors: ["ResizeObserver loop"],
    beforeSend: (event) => scrubEvent(event),
  });

  // Tag errors with who hit them (id only) so one person's problem can be found
  supabase.auth.onAuthStateChange((_event, session) => {
    const userId = session?.user?.id;
    Sentry.setUser(userId ? { id: userId } : null);
  });
}

// For createRoot: reports render errors with the component stack, including
// ones the page error boundary catches and shows a recovery screen for.
export const rootErrorHandlers = isMonitoringOn
  ? {
      onUncaughtError: Sentry.reactErrorHandler(),
      onCaughtError: Sentry.reactErrorHandler(),
    }
  : {};
