import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
<<<<<<< HEAD
  appId: 'com.mqplayer.app',
  appName: 'MQ Player',
  // webDir is bundled into the APK — the app loads LOCAL files, not the live URL.
  // All fetch('/api/...') calls are routed to https://mq1.vercel.app via
  // <base href="https://mq1.vercel.app/"> in index.html (see scripts/build-apk-web.sh).
  webDir: 'out',
  // No server.url — use local bundle.
  android: {
    allowMixedContent: true,
=======
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
>>>>>>> b58bf91 (feat(player+apk): rebuild PlayerBar + FullTrackView from scratch + real standalone APK)
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
<<<<<<< HEAD
      launchShowDuration: 1500,
      backgroundColor: '#0e0e0e',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
=======
      launchShowDuration: 1200,
      backgroundColor: '#0e0e0e',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      androidSpinnerStyle: 'large',
>>>>>>> b58bf91 (feat(player+apk): rebuild PlayerBar + FullTrackView from scratch + real standalone APK)
    },
  },
};

export default config;
