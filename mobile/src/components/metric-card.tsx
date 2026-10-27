import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { AndroidSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface Tag {
  label: string;
  tone: 'info' | 'warning';
}

/** One reading on the Water tab: big value, unit, honest tags, and an optional gauge below. */
export function MetricCard({ icon, label, value, unit, description, tags = [], dimmed, children }: {
  icon: AndroidSymbol;
  label: string;
  value: string;
  unit?: string;
  description?: string;
  tags?: Tag[];
  dimmed: boolean;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border, opacity: dimmed ? 0.6 : 1 }]}>
      <View style={styles.top}>
        <View style={[styles.iconWrap, { backgroundColor: theme.backgroundElement }]}>
          <Icon name={icon} size={24} />
        </View>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>{label.toUpperCase()}</ThemedText>
      </View>

      <View style={styles.valueRow}>
        <ThemedText style={styles.value}>{value}</ThemedText>
        {unit ? <ThemedText style={[styles.unit, { color: theme.textSecondary }]}>{unit}</ThemedText> : null}
      </View>
      {description ? <ThemedText type="smallBold" style={{ color: theme.tint }}>{description}</ThemedText> : null}

      {children}

      {tags.length > 0 && (
        <View style={styles.tags}>
          {tags.map((t) => (
            <View key={t.label} style={[styles.tag, { backgroundColor: t.tone === 'warning' ? theme.warning : theme.notice }]}>
              <ThemedText type="small" style={{ color: t.tone === 'warning' ? theme.onWarning : theme.onNotice, fontSize: 12, lineHeight: 16 }}>
                {t.label}
              </ThemedText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.card, borderWidth: 1, padding: Spacing.four, gap: Spacing.two, elevation: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  label: { letterSpacing: 1, fontSize: 13 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two, marginTop: Spacing.one },
  value: { fontSize: 52, lineHeight: 58, fontWeight: 700 },
  unit: { fontSize: 20, lineHeight: 26, fontWeight: 600 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.one },
  tag: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.half, borderRadius: Radius.pill },
});
