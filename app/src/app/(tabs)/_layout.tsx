import Tabs from 'expo-router/js-tabs';
import { Map as MapIcon, UserRound, UsersRound, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { colors, fontFamily, radius, spacing } from '../../theme/theme';

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

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.bar,
        tabBarItemStyle: styles.item,
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.map'), tabBarIcon: tabIcon(MapIcon) }} />
      <Tabs.Screen name="community" options={{ title: t('tabs.community'), tabBarIcon: tabIcon(UsersRound) }} />
      <Tabs.Screen name="me" options={{ title: t('tabs.me'), tabBarIcon: tabIcon(UserRound) }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.white,
    borderTopColor: colors.border,
    height: 80,
    paddingTop: spacing.sm,
  },
  item: { minHeight: 56 },
  label: { fontFamily, fontSize: 14, fontWeight: '700', marginTop: spacing.xs },
  iconPill: {
    width: 56,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: { backgroundColor: colors.interactiveSoft },
});
