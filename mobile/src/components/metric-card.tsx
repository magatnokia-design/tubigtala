import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { AndroidSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import { LEVEL_COLORS, LevelChip } from '@/components/level-chip';
import { Pulse } from '@/components/pulse';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { Status } from '@/domain/thresholds';
import { useTheme } from '@/hooks/use-theme';

export interface Tag {
  label: string;
  tone: 'info' | 'warning';
  /** fades in and out: something in progress, e.g. a calibration being applied */
  pulse?: boolean;
}

/**
 * A card that is waiting rather than showing a status (domain/warmup.ts):
 * - loading: the app is still fetching the reading;
 * - starting: the station's first reading after power-on has no value for this sensor yet;
 * - warming: the gas sensor's heater is warming up (`progress` 0..1, `text` how long is left);
 *   `hasValue` false while the station sends no gas value at all (its first 3 minutes).
 */
export type CardWait =
  | { kind: 'loading' }
  | { kind: 'starting' }
  | { kind: 'warming'; progress: number; text: string; hasValue: boolean };

/**
 * One reading on the Water tab. The status ("Normal", "Too hot") is the headline: the card's
 * border, value and chip take its colour, so a problem is visible at a glance. The card grows to
 * fill its share of the screen (the Water tab fits all three without scrolling on a normal phone).
 * While `wait` is set the card stays neutral and pulses instead of showing a status, so "No reading"
 * or "A bit high" never appears for a value that is simply not ready yet.
 */
export function MetricCard({ icon, label, value, unit, status, note, tags = [], dimmed, wait = null, children }: {
  icon: AndroidSymbol;
  label: string;
  value: string;
  unit?: string;
  status: Status;
  /** short line under the value, e.g. "Water temperature" */
  note?: string;
  tags?: Tag[];
  dimmed: boolean;
  wait?: CardWait | null;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const c = LEVEL_COLORS[status.level];
  const alert = !wait && (status.level === 'warning' || status.level === 'critical');
  const skeleton = wait !== null && (wait.kind !== 'warming' || !wait.hasValue);
  const waitLabel = wait?.kind === 'starting' ? 'Starting up' : wait?.kind === 'warming' ? 'Warming up' : null;
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
        {wait?.kind === 'loading' ? (
          <Pulse><View style={[styles.chipSkeleton, { backgroundColor: theme.backgroundElement }]} /></Pulse>
        ) : waitLabel ? (
          <Pulse><LevelChip level="unknown" label={waitLabel} /></Pulse>
        ) : (
          <LevelChip level={status.level} label={status.label} />
        )}
      </View>

      <View style={styles.valueRow} accessibilityLabel={wait?.kind === 'loading' ? `${label}, loading` : undefined}>
        {skeleton ? (
          <Pulse><View style={[styles.valueSkeleton, { backgroundColor: theme.backgroundElement }]} /></Pulse>
        ) : (
          <>
            {/* While the gas sensor settles its value is shown faded: real, but not to be trusted yet. */}
            <ThemedText style={[styles.value, alert && { color: theme[c.fg] }, wait?.kind === 'warming' && styles.settling]}>{value}</ThemedText>
            {unit ? <ThemedText style={[styles.unit, { color: theme.textSecondary }]}>{unit}</ThemedText> : null}
          </>
        )}
      </View>

      {wait?.kind === 'warming' && (
        <View style={styles.warm} accessibilityLabel={`${label}: ${wait.text}`}>
          <View style={[styles.warmTrack, { backgroundColor: theme.backgroundElement }]}>
            <Pulse style={[styles.warmFill, { width: `${Math.round(Math.min(1, Math.max(0.04, wait.progress)) * 100)}%`, backgroundColor: theme.tint }]} />
          </View>
          <ThemedText type="small" themeColor="textSecondary">{wait.text}</ThemedText>
        </View>
      )}

      {/* Note and tags share one line to keep the card short. */}
      {(note || tags.length > 0) && (
        <View style={styles.meta}>
          {note ? <ThemedText type="small" themeColor="textSecondary" style={styles.note}>{note}</ThemedText> : null}
          {tags.map((t) => {
            const tag = (
              <View style={[styles.tag, { backgroundColor: t.tone === 'warning' ? theme.warning : theme.notice }]}>
                <ThemedText type="small" style={[styles.tagText, { color: t.tone === 'warning' ? theme.onWarning : theme.onNotice }]}>{t.label}</ThemedText>
              </View>
            );
            return t.pulse ? <Pulse key={t.label}>{tag}</Pulse> : <View key={t.label}>{tag}</View>;
          })}
        </View>
      )}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // flex: 1 shares the screen height between the cards; space-between spreads the rows inside.
  card: { flex: 1, minHeight: 150, justifyContent: 'space-between', borderRadius: Radius.card, borderWidth: 1, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, gap: 2 },
  alertBorder: { borderWidth: 2 },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  iconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, letterSpacing: 1, fontSize: 12 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two, minHeight: 44 },
  value: { fontSize: 38, lineHeight: 44, fontWeight: 700 },
  settling: { opacity: 0.45 },
  unit: { fontSize: 16, lineHeight: 22, fontWeight: 600 },
  // Same size as the value / chip they stand in for, so the card does not jump when data arrives.
  valueSkeleton: { width: 120, height: 36, marginTop: 4, borderRadius: Radius.small },
  chipSkeleton: { width: 78, height: 26, borderRadius: Radius.pill },
  warm: { gap: 2 },
  warmTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  warmFill: { height: 6, borderRadius: 3 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.one },
  note: { marginRight: Spacing.one },
  tag: { paddingHorizontal: Spacing.two, paddingVertical: 1, borderRadius: Radius.pill },
  tagText: { fontSize: 11, lineHeight: 15 },
});
