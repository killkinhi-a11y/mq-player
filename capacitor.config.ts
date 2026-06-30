import type { CapacitorConfig } from '@capacitor/cli';

const PROD_URL = 'https://mq1.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.mq.player',
  appName: 'MQ Player',
  // Local webDir — used as offline fallback if server is unreachable
  webDir: 'out',
  // Load the production app directly in the WebView.
  // All chunks and API calls work natively from the CDN — no shims needed,
  // no chunk-404 problems that previously prevented React from mounting past splash.
  server: {
    url: `${PROD_URL}/play`,
    cleartext: false,
    androidScheme: 'https',
    // Allow WebView to navigate within the prod domain and common asset CDNs
    allowNavigation: ['mq1.vercel.app', 'vercel.app', '*.vercel.app'],
    // Offline fallback — shown when remote URL fails to load
    errorPath: 'offline.html',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0e0e0e',
    webContentsDebuggingEnabled: false,
    minWebViewVersion: 60,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0e0e0e',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
};

export default config;
