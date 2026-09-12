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
      // Use the custom splash icon generated from resources/icon.png
      androidSplashResourceName: 'splash',
    },
    MediaSession: {
      // Native media notification with playback controls
      // Shows on lock screen + notification shade
      foregroundService: 'always',
      // Small icon for status bar (white silhouette, generated as ic_stat_mq)
      androidNotificationIcon: 'ic_stat_mq',
      // Large icon for notification shade (app icon)
      androidNotificationLargeIcon: 'ic_launcher',
      // Notification channel name (Android 8+)
      androidChannelName: 'MQ Player',
      androidChannelDescription: 'Управление воспроизведением музыки',
    },
    StatusBar: {
      // Style status bar to match app theme
      style: 'DARK',
      backgroundColor: '#0e0e0e',
      overlaysWebView: false,
    },
    AppBar: {
      style: 'DARK',
    },
  },
};

export default config;
