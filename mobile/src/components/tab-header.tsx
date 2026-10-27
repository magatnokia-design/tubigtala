import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Water-blue header with rounded bottom corners, used by all three tabs. */
export function TabHeader({ eyebrow, title, right, children }: {
  eyebrow?: string;
  title: string;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { backgroundColor: theme.tint, paddingTop: insets.top + Spacing.three }]}>
      <StatusBar style="light" />
      <View style={styles.row}>
        <View style={styles.titles}>
          {eyebrow ? <ThemedText type="small" style={{ color: theme.onTint, opacity: 0.85 }}>{eyebrow}</ThemedText> : null}
          <ThemedText style={[styles.title, { color: theme.onTint }]} numberOfLines={1}>{title}</ThemedText>
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.four, paddingBottom: Spacing.four, gap: Spacing.three,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  titles: { flex: 1 },
  title: { fontSize: 26, lineHeight: 32, fontWeight: 700 },
});
