import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { AndroidSymbol } from 'expo-symbols';

import { DeviceSwitcher } from '@/components/device-switcher';
import { Icon } from '@/components/icon';
import { LineChart } from '@/components/line-chart';
import { Notice } from '@/components/notice';
import { TabHeader } from '@/components/tab-header';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { formatNumber } from '@/domain/format';
import { stats, type Point } from '@/domain/readings';
import type { Reading } from '@/domain/types';
import { useReadingsSince } from '@/hooks/use-devices';
import { useSelectedDevice } from '@/hooks/use-selected-device';
import { useTheme } from '@/hooks/use-theme';
import { HISTORY_LIMIT } from '@/services/devices';

const RANGES = [
  { label: '1 h', ms: 3_600_000 },
  { label: '6 h', ms: 6 * 3_600_000 },
  { label: '24 h', ms: 24 * 3_600_000 },
  { label: '7 d', ms: 7 * 24 * 3_600_000 },
] as const;

// Order requested: pH level, temperature, ammonia.
const METRICS: {
  key: string; icon: AndroidSymbol; title: string; unit: string; decimals: number;
  pick: (r: Reading) => number | null; note: string;
}[] = [
  { key: 'ph', icon: 'water_ph', title: 'pH level', unit: '', decimals: 1, pick: (r) => r.ph, note: '0-14 scale. Indicative while the probe is uncalibrated.' },
  { key: 'temp', icon: 'device_thermostat', title: 'Temperature', unit: '°C', decimals: 1, pick: (r) => r.temperatureC, note: 'Water temperature from the DS18B20 probe.' },
  { key: 'nh3', icon: 'air', title: 'Ammonia', unit: 'mV', decimals: 0, pick: (r) => r.nh3GasMv, note: 'Ammonia gas in the air above the water. Relative, uncalibrated - not ppm.' },
];

export default function AnalyticsScreen() {
  const theme = useTheme();
  const { devices, device, select } = useSelectedDevice();
  const [rangeMs, setRangeMs] = useState<number>(RANGES[2].ms);
  const history = useReadingsSince(device?.id ?? null, rangeMs);

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <TabHeader eyebrow={device?.name ?? 'No device'} title="Analytics">
        {devices.status === 'ready' && <DeviceSwitcher devices={devices.data} selectedId={device?.id ?? null} onSelect={select} />}
        <View style={styles.ranges}>
          {RANGES.map((r) => {
            const selected = r.ms === rangeMs;
            return (
              <Pressable
                key={r.label}
                onPress={() => setRangeMs(r.ms)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.range, { backgroundColor: selected ? theme.background : 'rgba(255,255,255,0.18)' }]}>
                <ThemedText type="smallBold" style={{ color: selected ? theme.tint : theme.onTint }}>{r.label}</ThemedText>
              </Pressable>
            );
          })}
        </View>
      </TabHeader>

      <ScrollView contentContainerStyle={styles.content}>
        {devices.status === 'error' && <Notice tone="warning">{devices.message}</Notice>}
        {devices.status === 'ready' && !device && (
          <Notice>No device is linked to this account yet, so there is nothing to chart.</Notice>
        )}
        {device && history.status === 'loading' && <ActivityIndicator style={styles.loading} color={theme.tint} />}
        {device && history.status === 'error' && <Notice tone="warning">{history.message}</Notice>}
        {device && history.status === 'ready' && (
          <>
            {device.simulated && <Notice tone="warning">Simulated device: charts show generated test data.</Notice>}
            {history.data.truncated && (
              <Notice tone="warning">{`Showing only the latest ${HISTORY_LIMIT.toLocaleString()} readings; older ones in this range are not included.`}</Notice>
            )}
            {history.data.readings.length === 0 && <Notice>No readings in this time range.</Notice>}
            {METRICS.map((m) => {
              const points: Point[] = history.data.readings.map((r) => ({ t: r.serverTimeMs, v: m.pick(r) }));
              const s = stats(points.map((p) => p.v));
              return (
                <View key={m.key} style={[styles.card, { borderColor: theme.border }]}>
                  <View style={styles.cardTop}>
                    <View style={[styles.iconWrap, { backgroundColor: theme.backgroundElement }]}>
                      <Icon name={m.icon} size={22} />
                    </View>
                    <ThemedText type="smallBold" style={styles.cardTitle}>{m.title}</ThemedText>
                    {m.unit ? <ThemedText type="small" themeColor="textSecondary">{m.unit}</ThemedText> : null}
                  </View>
                  <View style={styles.statsRow}>
                    <Stat label="Lowest" value={s ? formatNumber(s.min, m.decimals) : '—'} />
                    <Stat label="Average" value={s ? formatNumber(s.avg, m.decimals) : '—'} />
                    <Stat label="Highest" value={s ? formatNumber(s.max, m.decimals) : '—'} />
                  </View>
                  <LineChart points={points} decimals={m.decimals} gradientId={`grad-${m.key}`} />
                  <ThemedText type="small" themeColor="textSecondary">{m.note}</ThemedText>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.statLabel}>{label}</ThemedText>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  ranges: { flexDirection: 'row', gap: Spacing.two },
  range: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: Radius.pill },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  loading: { marginTop: Spacing.six },
  card: { borderWidth: 1, borderRadius: Radius.card, padding: Spacing.three, gap: Spacing.three },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  iconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, fontSize: 17 },
  statsRow: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, borderRadius: Radius.small, paddingVertical: Spacing.two, alignItems: 'center' },
  statLabel: { fontSize: 12, lineHeight: 16 },
  statValue: { fontSize: 18, lineHeight: 24, fontWeight: 700 },
});
