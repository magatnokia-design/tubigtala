import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { AndroidSymbol } from 'expo-symbols';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CalendarModal } from '@/components/calendar';
import { DeviceSwitcher } from '@/components/device-switcher';
import { Icon } from '@/components/icon';
import { LevelChip } from '@/components/level-chip';
import { LineChart } from '@/components/line-chart';
import { Notice } from '@/components/notice';
import { OfflineBanner } from '@/components/offline-banner';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { METRIC_ICON } from '@/constants/metric-icons';
import { HEADER_CURVE, headerOnTop, Radius, Spacing } from '@/constants/theme';
import { endOfDay, formatRange, startOfDay, type DayRange } from '@/domain/dates';
import { formatClock, formatDateTime, formatNumber } from '@/domain/format';
import { insight, insightSentence } from '@/domain/insights';
import { STALE_AFTER_INTERVALS } from '@/domain/status';
import { classify, METRIC_INFO, RANGES, type Metric } from '@/domain/thresholds';
import type { Reading } from '@/domain/types';
import { useReadingsBetween } from '@/hooks/use-devices';
import { useNow } from '@/hooks/use-now';
import { useSelectedDevice } from '@/hooks/use-selected-device';
import { useTheme } from '@/hooks/use-theme';
import { HISTORY_LIMIT } from '@/services/devices';

// Order requested: pH level, temperature, ammonia.
const METRICS: { metric: Metric; icon: AndroidSymbol }[] = [
  { metric: 'ph', icon: METRIC_ICON.ph },
  { metric: 'temperatureC', icon: METRIC_ICON.temperatureC },
  { metric: 'nh3GasMv', icon: METRIC_ICON.nh3GasMv },
];

const LIVE_WINDOW_MS = 3_600_000;
// The live query restarts every 5 minutes so its window moves forward (and stays ~1 hour of
// reads); between restarts the charts are trimmed to exactly the last hour.
const LIVE_STEP_MS = 5 * 60_000;
// Latest instant Firestore timestamps allow; "no upper limit" for the live query.
const FAR_FUTURE_MS = 253402300799000;

type Mode = 'live' | 'date';

export default function AnalyticsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { devices, device, select } = useSelectedDevice();
  const [mode, setMode] = useState<Mode>('live');
  const [range, setRange] = useState<DayRange>(() => ({ start: startOfDay(Date.now()), end: startOfDay(Date.now()) }));
  const [calendarOpen, setCalendarOpen] = useState(false);

  const deviceId = device?.id ?? null;
  const now = useNow(30_000);
  const liveStart = Math.floor(now / LIVE_STEP_MS) * LIVE_STEP_MS - LIVE_WINDOW_MS;
  const live = useReadingsBetween(mode === 'live' ? deviceId : null, liveStart, FAR_FUTURE_MS);
  const dated = useReadingsBetween(mode === 'date' ? deviceId : null, range.start, endOfDay(range.end));
  const history = mode === 'live' ? live : dated;

  const readings = useMemo(() => {
    const loaded = device && history.status === 'ready' ? history.data.readings : [];
    return mode === 'live' ? loaded.filter((r) => r.serverTimeMs >= now - LIVE_WINDOW_MS) : loaded;
  }, [device, history, mode, now]);
  const loading = devices.status === 'loading' || (device !== null && history.status === 'loading');
  const loadError = devices.status === 'error' ? devices.message : device && history.status === 'error' ? history.message : null;
  const multiDay = mode === 'date' && range.end !== range.start;

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <StatusBar style="light" />
      <View style={[styles.header, headerOnTop, { backgroundColor: theme.tint, paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.headerRow}>
          <ThemedText style={[styles.title, { color: theme.onTint }]}>Analytics</ThemedText>
          <Pressable
            onPress={() => router.push('/export')}
            disabled={!device}
            accessibilityRole="button"
            accessibilityLabel="Export to Excel"
            style={({ pressed }) => [styles.exportButton, { opacity: !device ? 0.4 : pressed ? 0.7 : 1 }]}>
            <Icon name="download" size={20} color="onTint" />
            <ThemedText type="smallBold" style={{ color: theme.onTint }}>Export</ThemedText>
          </Pressable>
        </View>
        {devices.status === 'ready' && <DeviceSwitcher devices={devices.data} selectedId={deviceId} onSelect={select} />}
        <View style={[styles.segment, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
          {(['live', 'date'] as const).map((m) => {
            const selected = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.segmentItem, selected && { backgroundColor: theme.background }]}>
                <Icon name={m === 'live' ? 'bolt' : 'calendar_month'} size={16} color={selected ? 'tint' : 'onTint'} />
                <ThemedText type="smallBold" style={{ color: selected ? theme.tint : theme.onTint }}>{m === 'live' ? 'Live' : 'By date'}</ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <OfflineBanner />

        <View style={[styles.contextRow, mode === 'date' && styles.contextCentered]}>
          {mode === 'live' ? (
            <View style={styles.liveLabel}>
              <View style={[styles.liveDot, { backgroundColor: theme.levelNormal }]} />
              <ThemedText type="smallBold">Last hour</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">· updates as readings arrive</ThemedText>
            </View>
          ) : (
            <Pressable
              onPress={() => setCalendarOpen(true)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.dateChip, { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundElement : theme.background }]}>
              <Icon name="calendar_month" size={18} />
              <ThemedText type="smallBold">{formatRange(range)}</ThemedText>
              <Icon name="expand_more" size={18} color="textSecondary" />
            </Pressable>
          )}
          {loading && <ActivityIndicator color={theme.tint} style={mode === 'date' ? styles.spinnerRight : undefined} />}
        </View>

        {!device && !loading && <StatusPill status="no-data" label="No station connected" />}
        {loadError && <Notice tone="warning">{loadError}</Notice>}
        {device?.simulated && <Notice tone="warning">Simulated device: charts show generated test data.</Notice>}
        {device && history.status === 'ready' && history.data.truncated && (
          <Notice tone="warning">{`Showing the latest ${HISTORY_LIMIT.toLocaleString()} readings only.`}</Notice>
        )}

        {METRICS.map(({ metric, icon }) => (
          <MetricChart key={metric} metric={metric} icon={icon} readings={readings} multiDay={multiDay} intervalSec={device?.readingIntervalSec ?? 60} />
        ))}
      </ScrollView>

      {calendarOpen && (
        <CalendarModal
          visible
          initial={range}
          onClose={() => setCalendarOpen(false)}
          onApply={(r) => { setRange(r); setCalendarOpen(false); }}
        />
      )}
    </View>
  );
}

function MetricChart({ metric, icon, readings, multiDay, intervalSec }: { metric: Metric; icon: AndroidSymbol; readings: Reading[]; multiDay: boolean; intervalSec: number }) {
  const theme = useTheme();
  const info = METRIC_INFO[metric];
  const points = useMemo(() => readings.map((r) => ({ t: r.serverTimeMs, v: r[metric] })), [readings, metric]);
  const ins = useMemo(() => insight(metric, points), [metric, points]);
  // The big number and its status are the newest reading, as on the Water tab. When that reading
  // has no value, show "—" and say when the last value was, rather than passing it off as current.
  const status = classify(metric, ins.newest?.v ?? null);
  const showLastValid = ins.newest?.v === null && ins.latest !== null;
  const when = (t: number) => (multiDay ? formatDateTime(t) : formatClock(t));
  const fmt = (v: number) => `${formatNumber(v, info.decimals)}${info.unit ? ` ${info.unit}` : ''}`;

  return (
    <View style={[styles.card, { borderColor: theme.border }]}>
      <View style={styles.cardTop}>
        <Icon name={icon} size={20} />
        <ThemedText type="smallBold" style={styles.cardTitle}>{info.name}</ThemedText>
        <LevelChip level={status.level} label={status.label} compact />
      </View>

      <View style={styles.valueRow}>
        <ThemedText style={styles.value}>{formatNumber(ins.newest?.v ?? null, info.decimals)}</ThemedText>
        {info.unit ? <ThemedText themeColor="textSecondary" style={styles.unit}>{info.unit}</ThemedText> : null}
        <View style={styles.extremes}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.extremeText} numberOfLines={1}>
            {ins.max ? `High ${fmt(ins.max.v)} · ${when(ins.max.t)}` : 'High —'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.extremeText} numberOfLines={1}>
            {ins.min ? `Low ${fmt(ins.min.v)} · ${when(ins.min.t)}` : 'Low —'}
          </ThemedText>
        </View>
      </View>

      {showLastValid && ins.latest && (
        <ThemedText type="small" themeColor="textSecondary">{`No value in the newest reading · last value ${fmt(ins.latest.v)} at ${when(ins.latest.t)}`}</ThemedText>
      )}

      <LineChart points={points} decimals={info.decimals} gradientId={`grad-${metric}`} band={RANGES[metric].normal} height={130}
        // Same rule as the stale status (domain/status.ts): no reading for 3 intervals = a gap.
        gapMs={STALE_AFTER_INTERVALS * intervalSec * 1000} />

      <View style={[styles.insight, { backgroundColor: theme.backgroundElement }]}>
        <Icon name="insights" size={16} />
        <ThemedText type="small" style={styles.insightText}>{insightSentence(metric, ins)}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.three, gap: Spacing.two, borderBottomLeftRadius: HEADER_CURVE, borderBottomRightRadius: HEADER_CURVE },
  scroll: { marginTop: -HEADER_CURVE },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: 700 },
  exportButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.pill, backgroundColor: 'rgba(255,255,255,0.18)' },
  segment: { flexDirection: 'row', borderRadius: Radius.pill, padding: 3 },
  segmentItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one, paddingVertical: Spacing.two, borderRadius: Radius.pill },
  content: { padding: Spacing.three, paddingTop: HEADER_CURVE + Spacing.two, gap: Spacing.two + 2, paddingBottom: Spacing.five },
  contextRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  contextCentered: { justifyContent: 'center' },
  spinnerRight: { position: 'absolute', right: 0 },
  liveLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  card: { borderWidth: 1, borderRadius: Radius.card, padding: Spacing.three, gap: Spacing.two },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardTitle: { flex: 1, fontSize: 16 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.one },
  value: { fontSize: 30, lineHeight: 36, fontWeight: 700 },
  unit: { fontSize: 14 },
  extremes: { flex: 1, alignItems: 'flex-end' },
  extremeText: { fontSize: 12, lineHeight: 16 },
  insight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two + 2, paddingVertical: Spacing.two, borderRadius: Radius.small },
  insightText: { flex: 1 },
});
