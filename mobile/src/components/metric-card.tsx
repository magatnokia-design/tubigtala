import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { AndroidSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import { LEVEL_COLORS, LevelChip } from '@/components/level-chip';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { Status } from '@/domain/thresholds';
import { useTheme } from '@/hooks/use-theme';

export interface Tag {
  label: string;
  tone: 'info' | 'warning';
}

/**
 * One reading on the Water tab. The status ("Normal", "Too hot") is the headline: the card's
 * border, value and chip take its colour, so a problem is visible at a glance.
 */
export function MetricCard({ icon, label, value, unit, status, note, tags = [], dimmed, children }: {
  icon: AndroidSymbol;
  label: string;
  value: string;
  unit?: string;
  status: Status;
  /** short line under the value, e.g. "Water temperature" */
  note?: string;
  tags?: Tag[];
  dimmed: boolean;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const c = LEVEL_COLORS[status.level];
  const alert = status.level === 'warning' || status.level === 'critical';
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: alert ? theme[c.bg] : theme.background, borderColor: alert ? theme[c.fg] : theme.border, opacity: dimmed ? 0.6 : 1 },
        alert && styles.alertBorder,
      ]}>
      <View style={styles.top}>
        <View style={[styles.iconWrap, { backgroundColor: alert ? theme.background : theme.backgroundElement }]}>
          <Icon name={icon} size={22} color={alert ? c.fg : 'tint'} />
        </View>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>{label.toUpperCase()}</ThemedText>
        <LevelChip level={status.level} label={status.label} />
      </View>

      <View style={styles.valueRow}>
        <ThemedText style={[styles.value, alert && { color: theme[c.fg] }]}>{value}</ThemedText>
        {unit ? <ThemedText style={[styles.unit, { color: theme.textSecondary }]}>{unit}</ThemedText> : null}
      </View>
      {note ? <ThemedText type="small" themeColor="textSecondary">{note}</ThemedText> : null}

      {children}

      {tags.length > 0 && (
        <View style={styles.tags}>
          {tags.map((t) => (
            <View key={t.label} style={[styles.tag, { backgroundColor: t.tone === 'warning' ? theme.warning : theme.notice }]}>
              <ThemedText type="small" style={[styles.tagText, { color: t.tone === 'warning' ? theme.onWarning : theme.onNotice }]}>{t.label}</ThemedText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.card, borderWidth: 1, padding: Spacing.three, gap: Spacing.one },
  alertBorder: { borderWidth: 2 },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  iconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, letterSpacing: 1, fontSize: 12 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two, marginTop: Spacing.one },
  value: { fontSize: 46, lineHeight: 52, fontWeight: 700 },
  unit: { fontSize: 18, lineHeight: 24, fontWeight: 600 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.one },
  tag: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.half, borderRadius: Radius.pill },
  tagText: { fontSize: 11, lineHeight: 15 },
});
