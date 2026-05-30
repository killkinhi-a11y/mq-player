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

  // Filter out common noise errors on the server
  ignoreErrors: [
    // JWT validation errors are expected when tokens expire
    "JWTExpired",
    "jwt expired",
    // Rate limit errors are intentional
    "Rate limit exceeded",
    // Turso connection resets on serverless cold starts
    "SQLITE_BUSY",
    "WSAPI_ERROR",
  ],

  // Don't send events if there's no DSN configured
  beforeSend(event) {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
      return null;
    }
    // Scrub sensitive data from request
    if (event.request) {
      delete event.request.cookies;
      if (event.request.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["cookie"];
        delete event.request.headers["jwt"];
      }
      // Scrub query params that might contain tokens
      if (event.request.query_string && typeof event.request.query_string === 'string') {
        event.request.query_string = (event.request.query_string as string)
          .replace(/token=[^&]*/g, "token=[REDACTED]")
          .replace(/key=[^&]*/g, "key=[REDACTED]")
          .replace(/secret=[^&]*/g, "secret=[REDACTED]");
      }
    }
    return event;
  },

  debug: false,
});
