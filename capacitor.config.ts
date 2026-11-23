import type { CapacitorConfig } from '@capacitor/cli';

// Android app (APK): the built web app (dist/) runs inside the phone's WebView. Data still comes from the same
// Supabase project, so the phone needs an internet connection.
// Build it with `npm run android:apk` (scripts/build-android.mjs): that leaves the website's download files
// (Windows installers, the APK itself) out of the app, which otherwise made the APK over 1 GB.
const config: CapacitorConfig = {
  appId: 'com.arguscnc.erp',
  appName: 'Argus Business Intelligence',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    // edge-to-edge phones: the app draws under the status / gesture bars and gets their sizes as
    // --safe-area-inset-* CSS values (the top bar and the bottom strip use them, so nothing hides behind the bars)
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
