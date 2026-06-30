import type { CapacitorConfig } from '@capacitor/cli';

const PROD_URL = 'https://mq1.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.mq.player',
  appName: 'MQ Player',
  webDir: 'out',
  // Load prod directly — WebView handles connection natively
  // errorPath shows offline.html when network fails (reliable, no JS probe)
  server: {
    url: `${PROD_URL}/play`,
    cleartext: false,
    androidScheme: 'https',
    errorPath: 'offline.html',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0e0e0e',
    webContentsDebuggingEnabled: false,
    minWebViewVersion: 80,
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
