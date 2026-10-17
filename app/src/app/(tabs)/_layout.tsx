import { Redirect } from 'expo-router';
import Tabs from 'expo-router/js-tabs';
import { Map as MapIcon, UserRound, UsersRound, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { useTabBarStyle } from '../../navigation/tabBar';
import { useSettings, useSettingsLoaded } from '../../storage/settings';
import { chromeTextScale, colors, radius, spacing } from '../../theme/theme';

// Active tab gets a soft blue pill behind its icon plus bold text, so the state
// is shown by shape and weight, not colour alone (docs/screens/Main.png).
function tabIcon(Icon: LucideIcon) {
  return function TabIcon({ focused }: { focused: boolean }) {
    return (
      <View style={[styles.iconPill, focused && styles.iconPillActive]}>
        <Icon size={24} color={focused ? colors.navy : colors.textMuted} strokeWidth={focused ? 2.25 : 2} />
      </View>
    );
  };
}

// Our own label, so its text grows with the phone's font size only up to
// chromeTextScale, matching the height useTabBarStyle reserves for it.
function tabLabel({ focused, children }: { focused: boolean; children: string }) {
  return (
    <AppText
      variant="label"
      color={focused ? colors.navy : colors.textMuted}
      maxFontSizeMultiplier={chromeTextScale}
      numberOfLines={1}
      // Long labels (Komuniti, Community) shrink a little on narrow phones instead of cutting off.
      adjustsFontSizeToFit
      minimumFontScale={0.8}
      style={styles.label}
    >
      {children}
    </AppText>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const loaded = useSettingsLoaded();
  const { onboarded } = useSettings();
  const tabBarStyle = useTabBarStyle();

  // First launch: language and location first (guide Section 5.5). The loading
  // screen covers the short wait for settings.
  if (!loaded) return null;
  if (!onboarded) return <Redirect href="/welcome" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle,
        tabBarItemStyle: styles.item,
        tabBarLabel: tabLabel,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.map'), tabBarIcon: tabIcon(MapIcon) }} />
      <Tabs.Screen name="community" options={{ title: t('tabs.community'), tabBarIcon: tabIcon(UsersRound) }} />
      <Tabs.Screen name="me" options={{ title: t('tabs.me'), tabBarIcon: tabIcon(UserRound) }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  item: { minHeight: 56 },
  label: { fontWeight: '700', marginTop: spacing.xs },
  iconPill: {
    width: 56,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: { backgroundColor: colors.interactiveSoft },
});
