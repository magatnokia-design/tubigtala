import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { Notice } from '@/components/notice';
import { ReadingCard } from '@/components/reading-card';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { formatAge, formatDateTime, formatNumber } from '@/domain/format';
import { deviceStatus } from '@/domain/status';
import type { Reading } from '@/domain/types';
import { useLatestReading, useOwnedDevices, useReadingsSince } from '@/hooks/use-devices';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';

const RANGES = [
  { label: '1 h', ms: 3_600_000 },
  { label: '6 h', ms: 6 * 3_600_000 },
  { label: '24 h', ms: 24 * 3_600_000 },
] as const;

export default function DeviceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const now = useNow();
  const devices = useOwnedDevices();
  const latest = useLatestReading(id);
  const [rangeMs, setRangeMs] = useState<number>(RANGES[2].ms);
  const history = useReadingsSince(id, rangeMs);

  if (devices.status === 'loading' || latest.status === 'loading') {
    return <ThemedView style={styles.fill}><ActivityIndicator style={styles.loading} /></ThemedView>;
  }
  if (devices.status === 'error' || latest.status === 'error') {
    const message = devices.status === 'error' ? devices.message : latest.status === 'error' ? latest.message : '';
    return <ThemedView style={[styles.fill, styles.pad]}><Notice tone="warning">{message}</Notice></ThemedView>;
  }

  const device = devices.data.find((d) => d.id === id);
  if (!device) {
    return <ThemedView style={[styles.fill, styles.pad]}><Notice tone="warning">This device was not found on your account.</Notice></ThemedView>;
  }

  const reading = latest.data;
  const status = deviceStatus(reading?.serverTimeMs ?? null, device.readingIntervalSec, now);
  const dimmed = status !== 'live';
  const series = history.status === 'ready' ? history.data : [];
  const trend = (pick: (r: Reading) => number | null) => series.map(pick);

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: device.name }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusRow}>
          <StatusPill status={status} />
          <ThemedText type="small" themeColor="textSecondary">
            {reading ? `Updated ${formatAge(now - reading.serverTimeMs)} · ${formatDateTime(reading.serverTimeMs)}` : ''}
          </ThemedText>
        </View>

        {device.simulated && <Notice tone="warning">Simulated device. These values are generated for testing, not measured by a sensor.</Notice>}
        {status === 'offline' && reading && (
          <Notice tone="warning">{`No reading for ${formatAge(now - reading.serverTimeMs).replace(' ago', '')}. Values below are the last ones received.`}</Notice>
        )}

        {!reading ? (
          <View style={styles.empty}>
            <ThemedText type="smallBold">No readings yet</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Readings appear here once the device sends its first one.
            </ThemedText>
          </View>
        ) : (
          <>
            <View style={styles.ranges}>
              {RANGES.map((r) => {
                const selected = r.ms === rangeMs;
                return (
                  <Pressable
                    key={r.label}
                    onPress={() => setRangeMs(r.ms)}
                    style={[styles.range, { backgroundColor: selected ? theme.tint : theme.backgroundElement, borderColor: selected ? theme.tint : theme.border }]}>
                    <ThemedText type="smallBold" style={{ color: selected ? theme.onTint : theme.text }}>{r.label}</ThemedText>
                  </Pressable>
                );
              })}
              {history.status === 'loading' && <ActivityIndicator />}
            </View>
            {history.status === 'error' && <Notice tone="warning">{`History: ${history.message}`}</Notice>}

            <ReadingCard
              icon="water_ph"
              label="pH"
              value={formatNumber(reading.ph, 2)}
              unit=""
              caption={reading.phCalibrated ? 'Calibrated probe' : 'Uncalibrated probe - indicative only'}
              trend={trend((r) => r.ph)}
              dimmed={dimmed}
            />
            <ReadingCard
              icon="device_thermostat"
              label="Water temperature"
              value={formatNumber(reading.temperatureC, 1)}
              unit="°C"
              caption="DS18B20 probe in the water"
              trend={trend((r) => r.temperatureC)}
              dimmed={dimmed}
            />
            <ReadingCard
              icon="air"
              label="Ammonia gas (air)"
              value={formatNumber(reading.nh3GasMv, 0)}
              unit="mV"
              caption="MQ-137 in the air above the water. Relative, uncalibrated - not ppm and not dissolved ammonia."
              trend={trend((r) => r.nh3GasMv)}
              dimmed={dimmed}
            />
          </>
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimer}>
          Prototype. Not a certified drinking-water test and not a substitute for laboratory analysis.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { padding: Spacing.three },
  loading: { marginTop: Spacing.six },
  content: { padding: Spacing.three, gap: Spacing.three },
  statusRow: { gap: Spacing.one },
  empty: { alignItems: 'center', gap: Spacing.one, marginVertical: Spacing.five },
  ranges: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  range: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2, borderRadius: Radius.pill, borderWidth: 1 },
  disclaimer: { textAlign: 'center', marginTop: Spacing.three },
});
