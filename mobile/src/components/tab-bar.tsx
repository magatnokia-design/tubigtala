import { Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import type { AndroidSymbol } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TABS: Record<string, { label: string; icon: AndroidSymbol }> = {
  analytics: { label: 'Analytics', icon: 'monitoring' },
  index: { label: 'Water', icon: 'water_drop' },
  settings: { label: 'Settings', icon: 'settings' },
};

/** Three tabs; Water sits in the middle as a raised round button. */
export function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { backgroundColor: theme.background, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, Spacing.two) }]}>
      {state.routes.map((route, i) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === i;
        const center = route.name === 'index';
        const onPress = () => {
          // Same sequence as expo-router's own BottomTabBar.
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        };
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
            style={styles.item}>
            {center ? (
              <View style={[styles.centerButton, { backgroundColor: focused ? theme.tint : theme.tintDeep, borderColor: theme.background }]}>
                <Icon name={tab.icon} size={30} color="onTint" />
              </View>
            ) : (
              <View style={[styles.pill, focused && { backgroundColor: theme.backgroundElement }]}>
                <Icon name={tab.icon} size={24} color={focused ? 'tint' : 'textSecondary'} />
              </View>
            )}
            <ThemedText type="small" style={[styles.label, { color: focused ? theme.tint : theme.textSecondary }, focused && styles.labelFocused]}>
              {tab.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, paddingTop: Spacing.two },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: Spacing.half },
  pill: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  centerButton: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    marginTop: -30, borderWidth: 4, elevation: 6,
  },
  label: { fontSize: 12, lineHeight: 16 },
  labelFocused: { fontWeight: 700 },
});
