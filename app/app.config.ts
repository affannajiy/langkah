import type { ExpoConfig } from 'expo/config';

const NAVY = '#0F2A47';
const FONT_DIR = './node_modules/@expo-google-fonts/atkinson-hyperlegible-next';

const config: ExpoConfig = {
  name: 'Langkah',
  slug: 'langkah',
  scheme: 'langkah',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/brand/icon-1024.png',
  platforms: ['android'],
  android: {
    package: 'com.langkah.app',
    adaptiveIcon: {
      foregroundImage: './assets/brand/adaptive-icon-foreground-1024.png',
      backgroundColor: NAVY,
    },
    // Least privilege. An active walk keeps its location through a foreground service
    // with a visible notification, which needs only "while using the app" location,
    // so ACCESS_BACKGROUND_LOCATION stays blocked. VIBRATE is for turn and hazard pulses.
    // CAMERA is asked for only when the user taps Take photo in the report flow.
    // Storage is not needed: the gallery uses the system photo picker.
    // expo-network adds ACCESS_NETWORK_STATE for the offline banner. Its Wi-Fi
    // permission is only for reading the IP address, which Langkah never does.
    // RECEIVE_BOOT_COMPLETED: expo-task-manager hands each walk location to a saved job,
    // and Android refuses saved jobs without it (the app crashed on the first walk fix).
    // It shows no prompt, and Langkah never starts anything after the phone restarts.
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'VIBRATE', 'CAMERA', 'RECEIVE_BOOT_COMPLETED'],
    blockedPermissions: [
      'ACCESS_BACKGROUND_LOCATION',
      'READ_EXTERNAL_STORAGE',
      'WRITE_EXTERNAL_STORAGE',
      'RECORD_AUDIO',
      'ACCESS_WIFI_STATE',
    ],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-localization',
    '@maplibre/maplibre-react-native',
    [
      'expo-location',
      {
        isAndroidBackgroundLocationEnabled: false,
        // Adds FOREGROUND_SERVICE and FOREGROUND_SERVICE_LOCATION, used only during a walk.
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    // Photos only: no microphone. The Google sign-in and expo-sharing plugins are
    // iOS-only (or Firebase-only), so they are not listed here.
    ['expo-image-picker', { microphonePermission: false }],
    [
      'expo-splash-screen',
      {
        backgroundColor: NAVY,
        image: './assets/brand/splash-mark-white-512.png',
        imageWidth: 200,
      },
    ],
    [
      // Embed the font at build time so text never flashes in a fallback font.
      'expo-font',
      {
        android: {
          fonts: [
            {
              fontFamily: 'AtkinsonHyperlegibleNext',
              fontDefinitions: [
                { path: `${FONT_DIR}/400Regular/AtkinsonHyperlegibleNext_400Regular.ttf`, weight: 400 },
                { path: `${FONT_DIR}/500Medium/AtkinsonHyperlegibleNext_500Medium.ttf`, weight: 500 },
                { path: `${FONT_DIR}/600SemiBold/AtkinsonHyperlegibleNext_600SemiBold.ttf`, weight: 600 },
                { path: `${FONT_DIR}/700Bold/AtkinsonHyperlegibleNext_700Bold.ttf`, weight: 700 },
              ],
            },
          ],
        },
      },
    ],
    // HTTP/2 pings, so requests recover after the phone changes network.
    './plugins/withNetworkPing',
  ],
  experiments: {
    typedRoutes: true,
  },
  // Links the app to its EAS project (not a secret).
  owner: 'affannajiy',
  extra: {
    eas: {
      projectId: 'c1751ad0-7693-40c1-b439-636967a33bdc',
    },
  },
};

export default config;
