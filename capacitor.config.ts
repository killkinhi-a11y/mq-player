import type { CapacitorConfig } from '@capacitor/cli';

const PROD_URL = 'https://mq1.vercel.app';

const config: CapacitorConfig = {
  appId: 'com.mq.player',
  appName: 'MQ Player',
  // Use local webDir as fallback (offline screen)
  webDir: 'out',
  // Load the production app directly — all chunks and API calls work natively
  server: {
    url: `${PROD_URL}/play`,
    cleartext: true,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#0e0e0e',
    webContentsDebuggingEnabled: false,
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
