import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppModal } from '@/components/app-modal';
import { LevelChip } from '@/components/level-chip';
import { ThemedText } from '@/components/themed-text';
import { METRIC_ICON } from '@/constants/metric-icons';
import { Spacing } from '@/constants/theme';
import { valueText } from '@/domain/alerts';
import { durationText, periodBadge, periodSummary, type PeriodInsight, type StatusShare } from '@/domain/period';
import { METRIC_INFO, type Metric } from '@/domain/thresholds';
import { useTheme } from '@/hooks/use-theme';

/**
 * Analytics > tap a card: what the period looked like for one sensor (domain/period.ts) - how much
 * of the time it was in each status, the average and extremes with their times, the longest spell
 * outside normal, alerts, and how much data there is. Opened from the card, so the Analytics tab
 * itself stays one screen.
 */
export function InsightsSheet({ metric, period, periodLabel, when, alerts, onClose }: {
  metric: Metric;
  period: PeriodInsight;
  /** "Last hour" / "Nov 14 – Nov 17, 2026" */
  periodLabel: string;
  /** formats a time for this period: a clock for one day, a date and time for several */
  when: (t: number) => string;
  /** alerts for this sensor in the period; atLeast when older alerts are not loaded */
  alerts: { count: number; atLeast: boolean } | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const info = METRIC_INFO[metric];
  const badge = periodBadge(period);
  const v = (x: number) => valueText(metric, x);
  const color = (s: StatusShare) => (s.level === 'critical' ? theme.levelCritical : s.level === 'warning' ? theme.levelWarning : theme.levelNormal);
  const tone = badge.level === 'critical' ? 'danger' : badge.level === 'warning' ? 'warning' : badge.level === 'normal' ? 'success' : 'info';
  const change = period.change;
  const step = 10 ** -info.decimals;

  return (
    <AppModal
      visible
      onClose={onClose}
      tone={tone}
      icon={METRIC_ICON[metric]}
      title={info.name}
      aside={<LevelChip level={badge.level} label={badge.label} compact />}
      actions={[{ label: 'Close', onPress: onClose }]}>
      <ScrollView style={{ maxHeight: height * 0.6 }} contentContainerStyle={styles.body}>
        <ThemedText type="small" themeColor="textSecondary">{`${periodLabel} · ${period.count.toLocaleString()} readings`}</ThemedText>
        <ThemedText>{periodSummary(metric, period, when)}</ThemedText>

        {period.shares.length > 0 && (
          <View style={styles.shares} accessibilityLabel={period.shares.map((s) => `${s.label} ${s.pct}%`).join(', ')}>
            <View style={styles.bar}>
              {period.shares.map((s) => (
                <View key={s.key} style={{ flex: Math.max(s.pct, 1), backgroundColor: color(s) }} />
              ))}
            </View>
            <View style={styles.legend}>
              {period.shares.map((s) => (
                <View key={s.key} style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: color(s) }]} />
                  <ThemedText type="small">{`${s.label} ${s.pct}%`}</ThemedText>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={[styles.rows, { borderColor: theme.border }]}>
          {period.avg !== null && <Row label="Average" value={v(period.avg)} />}
          {period.min && <Row label="Lowest" value={`${v(period.min.v)} · ${when(period.min.t)}`} />}
          {period.max && <Row label="Highest" value={`${v(period.max.v)} · ${when(period.max.t)}`} />}
          {change !== null && (
            <Row
              label="Change"
              value={Math.abs(change) < step ? 'Steady' : `${change > 0 ? 'Rose' : 'Fell'} ${Math.abs(change).toFixed(info.decimals)}${info.unit ? ` ${info.unit}` : ''}`}
            />
          )}
          <Row
            label="Longest outside normal"
            value={period.longestOut
              ? `${durationText(period.longestOut.minutes)} (${period.longestOut.label.toLowerCase()}) · from ${when(period.longestOut.startMs)}`
              : 'Never'}
          />
          {alerts && <Row label="Alerts" value={`${alerts.count}${alerts.atLeast ? ' or more' : ''}`} />}
          <Row label="Data" value={`Readings in ${period.hoursWithData} of ${period.hoursTotal} hours`} />
        </View>

        {metric === 'nh3GasMv' && (
          <ThemedText type="small" themeColor="textSecondary">
            {`Gas in the air above the water, a relative mV reading (not ppm).${period.warmupSkipped ? ` ${period.warmupSkipped.toLocaleString()} readings from the sensor's warm-up after power-on are not counted.` : ''}`}
          </ThemedText>
        )}
        {metric === 'ph' && period.uncalibrated > 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            {`${period.uncalibrated.toLocaleString()} of these pH readings came from an uncalibrated probe, so they may be off.`}
          </ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary">{"Judged with the station's alert limits as they are now."}</ThemedText>
      </ScrollView>
    </AppModal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.rowLabel}>{label}</ThemedText>
      <ThemedText type="smallBold" style={styles.rowValue}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  shares: { gap: Spacing.one },
  bar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.three, rowGap: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rows: { borderTopWidth: 1, paddingTop: Spacing.one },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.three, paddingVertical: 3 },
  rowLabel: { flexShrink: 0 },
  rowValue: { flexShrink: 1, textAlign: 'right' },
});
