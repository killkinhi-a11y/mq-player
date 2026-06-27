import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mqplayer.app',
  appName: 'MQ Player',
  webDir: 'out',
  server: {
    // The Android app loads the live web app via WebView (no local bundle).
    // This way the APK stays tiny (~5 MB) and always shows the latest version.
    url: 'https://mq1.vercel.app',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#0e0e0e',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
