import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mq.player',
  appName: 'MQ Player',
  // webDir is bundled into the APK — the app loads LOCAL files, not a remote URL.
  // This makes it a TRUE standalone app: works offline for UI, makes API calls
  // to https://mq1.vercel.app via fetch (relative URLs resolved via <base href>).
  webDir: 'out',
  // No server.url — use local bundle for real app experience.
  android: {
    allowMixedContent: true,
    backgroundColor: '#0e0e0e',
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0e0e0e',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      androidSpinnerStyle: 'large',
    },
  },
};

export default config;
