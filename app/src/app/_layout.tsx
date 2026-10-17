import '../i18n';
// Registers the walk location task before Android can deliver a fix to it.
import '../nav/walkLocation';

import Stack from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '../auth/AuthProvider';
import { LoadingScreen } from '../components/LoadingScreen';
import { PointsSnackbar } from '../points/PointsSnackbar';
import { colors } from '../theme/theme';

// Keep the native splash (mark on navy) until our JS loading screen is drawn,
// so the hand-off has no blank frame.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: 150 });

export default function RootLayout() {
  const [loading, setLoading] = useState(true);
  const hideNativeSplash = useCallback(() => SplashScreen.hide(), []);
  const finishLoading = useCallback(() => setLoading(false), []);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style={loading ? 'light' : 'dark'} />
        <AuthProvider>
          {/* Tabs, plus the walking screen on top of them without the tab bar. */}
          <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
          <PointsSnackbar />
        </AuthProvider>
        {loading && <LoadingScreen onLayout={hideNativeSplash} onDone={finishLoading} />}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
});
