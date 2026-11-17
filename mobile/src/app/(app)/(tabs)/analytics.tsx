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
import { InsightsSheet } from '@/components/insights-sheet';
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
import { periodBadge, periodInsight } from '@/domain/period';
import { deviceStatus, STALE_AFTER_INTERVALS } from '@/domain/status';
import { limitsOf } from '@/domain/limits';
import { classify, METRIC_INFO, type Metric, type Range, type Status } from '@/domain/thresholds';
import { warmingUp } from '@/domain/warmup';
import type { Reading } from '@/domain/types';
import { useAppActive } from '@/hooks/use-app-active';
import { useHoursBetween, useReadingsBetween } from '@/hooks/use-devices';
import { useNow } from '@/hooks/use-now';
import { useNotifications } from '@/hooks/use-profile';
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
// The live query starts at the top of the previous hour and restarts once an hour, so it holds
// 1-2 hours of readings; in between, each new reading costs one read and the charts are trimmed
// to exactly the last hour. (Until 0.9.2 it restarted every 5 minutes, re-reading the whole hour
// each time: ~19,000 reads a day for a phone left on this screen, now ~3,000.)
const LIVE_STEP_MS = 60 * 60_000;
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
  // Once By date has been opened, its query stays while the app is in front, so switching
  // Live <-> By date does not re-read the whole range each time.
  const [dateOpened, setDateOpened] = useState(false);

  const deviceId = device?.id ?? null;
  const now = useNow(30_000);
  // Queries only while the app is on screen: nothing is read for a phone that has it in the background.
  const appActive = useAppActive();
  const liveStart = Math.floor(now / LIVE_STEP_MS) * LIVE_STEP_MS - LIVE_WINDOW_MS;
  const live = useReadingsBetween(appActive ? deviceId : null, liveStart, FAR_FUTURE_MS);
  // By date reads the hourly packs (up to 31 days = 744 reads; domain/hours.ts); Live reads readings.
  const dated = useHoursBetween(appActive && dateOpened ? device : null, range.start, endOfDay(range.end));
  const history = mode === 'live' ? live : dated;

  const readings = useMemo(() => {
    const loaded = device && history.status === 'ready' ? history.data.readings : [];
    return mode === 'live' ? loaded.filter((r) => r.serverTimeMs >= now - LIVE_WINDOW_MS) : loaded;
  }, [device, history, mode, now]);
  const loading = devices.status === 'loading' || (device !== null && history.status === 'loading');
  const loadError = devices.status === 'error' ? devices.message : device && history.status === 'error' ? history.message : null;
  const multiDay = mode === 'date' && range.end !== range.start;
  // Live only, and only while the station is live: is its newest reading from the gas warm-up?
  const newestReading = readings.length ? readings[readings.length - 1] : null;
  const warmingNow = (metric: Metric) => mode === 'live' && device !== null && newestReading !== null
    && deviceStatus(newestReading.serverTimeMs, device.readingIntervalSec, now) === 'live'
    && warmingUp(metric, newestReading, device.readingIntervalSec);
  // The period the cards describe (insights): the last hour, or the chosen days.
  const period = useMemo(() => (mode === 'live'
    ? { startMs: now - LIVE_WINDOW_MS, endMs: now, nowMs: now }
    : { startMs: range.start, endMs: endOfDay(range.end), nowMs: now }), [mode, now, range]);
  // Alerts per sensor in the period, from the bell list (the newest 100): "or more" when the
  // period reaches back past the oldest one loaded.
  const notifications = useNotifications();
  const alertsFor = (metric: Metric) => {
    if (notifications.status !== 'ready' || !device) return null;
    const list = notifications.data;
    const count = list.filter((n) => n.deviceId === device.id && n.metric === metric
      && n.createdAtMs >= period.startMs && n.createdAtMs <= period.endMs).length;
    const atLeast = list.length >= 100 && list[list.length - 1].createdAtMs > period.startMs;
    return { count, atLeast };
  };

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
                onPress={() => {
                  setMode(m);
                  if (m === 'date') setDateOpened(true);
                }}
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

      {/* Fills the screen like the Water tab: the three cards share its height and each chart
          stretches into its card, so a normal phone shows Live and By date without scrolling; a
          very small one (or extra notices) still scrolls instead of squashing the charts. */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} bounces={false} overScrollMode="never">
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
          <MetricChart key={metric} metric={metric} icon={icon} readings={readings} mode={mode} multiDay={multiDay}
            intervalSec={device?.readingIntervalSec ?? 60} limits={limitsOf(device)[metric]} warming={warmingNow(metric)}
            period={period} periodLabel={mode === 'live' ? 'Last hour' : formatRange(range)} alerts={alertsFor(metric)} />
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

/**
 * One sensor's card. `limits`: the station's alert limits for this sensor (limits.ts), for the
 * status, the normal band and the insights. Tapping it opens the period's insights (InsightsSheet).
 */
function MetricChart({ metric, icon, readings, mode, multiDay, intervalSec, limits, warming, period: win, periodLabel, alerts }: {
  metric: Metric; icon: AndroidSymbol; readings: Reading[]; mode: Mode; multiDay: boolean; intervalSec: number; limits: Range;
  /** the newest reading is from the gas sensor's warm-up (domain/warmup.ts): no status yet, as on the Water tab */
  warming: boolean;
  /** the period shown: [start, end] and now (ms) */
  period: { startMs: number; endMs: number; nowMs: number };
  periodLabel: string;
  alerts: { count: number; atLeast: boolean } | null;
}) {
  const theme = useTheme();
  const info = METRIC_INFO[metric];
  const [open, setOpen] = useState(false);
  const points = useMemo(() => readings.map((r) => ({ t: r.serverTimeMs, v: r[metric] })), [readings, metric]);
  const ins = useMemo(() => insight(metric, points, limits), [metric, points, limits]);
  const period = useMemo(
    () => periodInsight(metric, readings, limits, { intervalSec, startMs: win.startMs, endMs: win.endMs, nowMs: win.nowMs }),
    [metric, readings, limits, intervalSec, win.startMs, win.endMs, win.nowMs],
  );
  const dated = mode === 'date';
  // Live: the big number and its status are the newest reading, as on the Water tab; a missing
  // value shows "—" and when the last value was. By date: a past period has no "now", so the number
  // is its average and the chip says how the whole period went - "Normal" there (the newest
  // reading) read as if the too-hot spell had never happened (user, 17 Nov 2026).
  const status: Status = warming ? { level: 'unknown', label: 'Warming up' } : classify(metric, ins.newest?.v ?? null, limits);
  const badge = periodBadge(period);
  const showLastValid = !dated && ins.newest?.v === null && ins.latest !== null;
  const when = (t: number) => (multiDay ? formatDateTime(t) : formatClock(t));
  const fmt = (v: number) => `${formatNumber(v, info.decimals)}${info.unit ? ` ${info.unit}` : ''}`;
  const normalPct = period.shares.find((s) => s.key === 'normal')?.pct ?? 0;

  // Simple card so three fit one screen: name, value and status on one row; the chart fills the
  // rest; one quiet line underneath. (High / low lines were removed in 0.9.3 at the user's request;
  // the details live in the insights opened by tapping.)
  return (
    <Pressable
      onPress={() => setOpen(true)}
      accessibilityRole="button"
      accessibilityLabel={`${info.name}: details and insights`}
      style={({ pressed }) => [styles.card, { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundElement : theme.background }]}>
      <View style={styles.cardTop}>
        <Icon name={icon} size={20} />
        <ThemedText type="smallBold" style={styles.cardTitle} numberOfLines={1}>{info.name}</ThemedText>
        <View style={styles.valueBox}>
          {dated && period.avg !== null && <ThemedText themeColor="textSecondary" style={styles.unit}>avg</ThemedText>}
          <ThemedText style={styles.value}>{formatNumber(dated ? period.avg : ins.newest?.v ?? null, info.decimals)}</ThemedText>
          {info.unit ? <ThemedText themeColor="textSecondary" style={styles.unit}>{info.unit}</ThemedText> : null}
        </View>
        {!dated && <LevelChip level={status.level} label={status.label} compact />}
      </View>

      {showLastValid && ins.latest && (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.lineText}>
          {`No value in the newest reading · last ${fmt(ins.latest.v)} at ${when(ins.latest.t)}`}
        </ThemedText>
      )}

      <LineChart points={points} decimals={info.decimals} gradientId={`grad-${metric}`} band={limits.normal}
        // Same rule as the stale status (domain/status.ts): no reading for 3 intervals = a gap.
        gapMs={STALE_AFTER_INTERVALS * intervalSec * 1000} />

      <View style={styles.bottomRow}>
        {dated && <LevelChip level={badge.level} label={badge.label} compact />}
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={[styles.lineText, styles.flex]}>
          {dated ? (period.count ? `Normal ${normalPct}% of the time` : '') : insightSentence(metric, ins)}
        </ThemedText>
        <ThemedText type="smallBold" style={[styles.lineText, { color: theme.tint }]}>Details</ThemedText>
        <Icon name="chevron_right" size={16} color="tint" />
      </View>

      {open && (
        <InsightsSheet metric={metric} period={period} periodLabel={periodLabel} when={when} alerts={alerts} onClose={() => setOpen(false)} />
      )}
    </Pressable>
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
  content: { flexGrow: 1, padding: Spacing.three, paddingTop: HEADER_CURVE + Spacing.two, gap: Spacing.two, paddingBottom: Spacing.three },
  contextRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
  contextCentered: { justifyContent: 'center' },
  spinnerRight: { position: 'absolute', right: 0 },
  liveLabel: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  // flex: 1 = the three cards share the screen; minHeight keeps a chart readable on small phones
  // (the screen scrolls instead).
  // Budget on a 360 x 800 phone: ~150 per card (measured from the user's phone, 17 Nov 2026: the
  // header and the date row leave ~450 for three cards); fixed rows ~100, so the chart gets ~50.
  // The minimum was 160, which made that phone scroll a little - unlike the Water tab.
  card: { flex: 1, minHeight: 128, borderWidth: 1, borderRadius: Radius.card, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, gap: Spacing.one + 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardTitle: { flex: 1, fontSize: 15 },
  valueBox: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  value: { fontSize: 22, lineHeight: 28, fontWeight: 700 },
  unit: { fontSize: 13 },
  lineText: { fontSize: 12, lineHeight: 16 },
  flex: { flex: 1 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
