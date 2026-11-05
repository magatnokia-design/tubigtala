// Grouped rows used by Settings and Account, so both screens look and behave the same.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { AndroidSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>{title.toUpperCase()}</ThemedText>
      <View style={[styles.sectionBody, { borderColor: theme.border }]}>{children}</View>
    </View>
  );
}

/** One row: icon, label, optional second line (`value`), and something on the right. */
export function Row({ icon, label, value, right, onPress, chevron, danger }: {
  icon: AndroidSymbol; label: string; value?: ReactNode; right?: ReactNode; onPress?: () => void; chevron?: boolean; danger?: boolean;
}) {
  const theme = useTheme();
  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: theme.backgroundElement }]}>
        <Icon name={icon} size={18} color={danger ? 'levelCritical' : 'tint'} />
      </View>
      <View style={styles.flex}>
        <ThemedText style={danger ? { color: theme.levelCritical } : undefined}>{label}</ThemedText>
        {typeof value === 'string' ? <ThemedText type="small" themeColor="textSecondary">{value}</ThemedText> : value ?? null}
      </View>
      {right}
      {chevron && <Icon name="chevron_right" color="textSecondary" />}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundElement }]}>
      {content}
    </Pressable>
  );
}

/** "Change" in the tint colour, for the right side of a row. */
export function ChangeLabel({ label = 'Change' }: { label?: string }) {
  const theme = useTheme();
  return <ThemedText type="smallBold" style={{ color: theme.tint }}>{label}</ThemedText>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: Spacing.two },
  sectionTitle: { letterSpacing: 1, fontSize: 12 },
  sectionBody: { borderWidth: 1, borderRadius: Radius.card, overflow: 'hidden', paddingVertical: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minHeight: 50 },
  rowIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
