import type { CapacitorConfig } from '@capacitor/cli';

const PROD_URL = 'https://mq1.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.mq.player',
  appName: 'MQ Player',
  // Use local webDir as the app entry point.
  // The local index.html checks connection and redirects to prod URL.
  // If offline, it shows a custom offline screen with retry button.
  // This gives us FULL control over the offline experience.
  webDir: 'out',
  server: {
    androidScheme: 'https',
    // No server.url — we use local index.html which handles redirection
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
