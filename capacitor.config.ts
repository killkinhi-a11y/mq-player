import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mqplayer.app',
  appName: 'MQ Player',
  // webDir is bundled into the APK — the app loads LOCAL files, not the live URL.
  // All fetch('/api/...') calls are routed to https://mq1.vercel.app via
  // <base href="https://mq1.vercel.app/"> in index.html (see scripts/build-apk-web.sh).
  webDir: 'out',
  // No server.url — use local bundle.
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
