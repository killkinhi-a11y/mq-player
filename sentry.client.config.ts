import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Adjust this value in production, or use tracesSampler for finer control
  tracesSampleRate: 0.1,

  // Set profilesSampleRate to 1.0 to profile every transaction.
  // Since profilesSampleRate is relative to tracesSampleRate,
  // the final profiling rate can be computed as tracesSampleRate * profilesSampleRate
  // e.g. 0.1 * 1.0 = 0.1 = 10% of transactions will be profiled
  profilesSampleRate: 0.1,

  // Capture Replay for 10% of all sessions,
  // plus for 100% of sessions with an error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // You can remove this option if you're not planning to use the Sentry Session Replay feature:
  integrations: [
    Sentry.replayIntegration({
      // Additional Replay configuration goes in here, for example:
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Filter out common noise errors that are not actionable
  ignoreErrors: [
    // Browser autoplay policy errors — common with media players
    "NotAllowedError",
    "AbortError",
    // ResizeObserver loop errors — benign browser behavior
    "ResizeObserver loop completed with undelivered notifications",
    "ResizeObserver loop limit exceeded",
    // Network errors that are expected (user goes offline, etc.)
    "NetworkError",
    "Network request failed",
    // Cancelled requests
    "CanceledError",
    // Hydration mismatches are logged by React, not real errors
    "Hydration",
    // ChunkLoadError — happens when user navigates after new deploy
    "ChunkLoadError",
    "Loading chunk",
    // Browser extension errors — not from our code
    /Non-Error promise rejection captured/,
  ],

  // Don't send events if there's no DSN configured
  beforeSend(event) {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
      return null;
    }
    // Scrub sensitive data from breadcrumbs and tags
    if (event.request) {
      delete event.request.cookies;
      if (event.request.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
      }
    }
    return event;
  },

  debug: false,
});
