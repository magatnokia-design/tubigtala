import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DeviceSwitcher } from '@/components/device-switcher';
import { Icon } from '@/components/icon';
import { MetricCard, type CardWait, type Tag } from '@/components/metric-card';
import { Notice } from '@/components/notice';
import { OfflineBanner } from '@/components/offline-banner';
import { ScaleBar } from '@/components/scale-bar';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { METRIC_ICON } from '@/constants/metric-icons';
import { HEADER_CURVE, headerOnTop, Radius, Spacing } from '@/constants/theme';
import { CALIBRATION_PICKUP_MS } from '@/domain/calibration';
import { formatAge, formatNumber } from '@/domain/format';
import { STATION_NAME } from '@/domain/pairing';
import { deviceStatus } from '@/domain/status';
import { limitsOf } from '@/domain/limits';
import { classify, normalRangeText, type Metric } from '@/domain/thresholds';
import { GAS_SETTLE_MS, gasWarmupLeftMs, isFirstReading, warmingUp } from '@/domain/warmup';
import { useLatestReading } from '@/hooks/use-devices';
import { useNow } from '@/hooks/use-now';
import { useNotifications } from '@/hooks/use-profile';
import { useSelectedDevice } from '@/hooks/use-selected-device';
import { useTheme } from '@/hooks/use-theme';

/**
 * Water tab: logo + bell, then the three readings. Each card leads with its status in plain
 * words and turns amber/red when out of range. Cards are always shown; without a device or a
 * reading they show "—" and "No reading" (never made-up values). While loading, right after the
 * station starts, or while the gas sensor warms up, a card pulses instead (MetricCard `wait`).
 */
export default function WaterScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const { devices, device, select } = useSelectedDevice();
  const latest = useLatestReading(device?.id ?? null);
  const notifications = useNotifications();
  const unread = notifications.status === 'ready' ? notifications.data.filter((n) => !n.read).length : 0;

  const reading = device && latest.status === 'ready' ? latest.data : null;
  const loading = devices.status === 'loading' || (device !== null && latest.status === 'loading');
  const status = reading && device ? deviceStatus(reading.serverTimeMs, device.readingIntervalSec, now) : 'no-data';
  const dimmed = reading !== null && status !== 'live';
  const sim: Tag[] = reading?.simulated ? [{ label: 'Simulated', tone: 'warning' }] : [];
  const loadError = devices.status === 'error' ? devices.message : device && latest.status === 'error' ? latest.message : null;

  // The station's own alert limits, or the defaults (Settings > Alert limits).
  const limits = limitsOf(device);
  // The temperature scale reaches past the critical limit when it is set above 35 °C.
  const tempMax = Math.max(40, Math.ceil((limits.temperatureC.warning[1] + 5) / 20) * 20);
  const ph = classify('ph', reading?.ph ?? null, limits.ph);
  const temp = classify('temperatureC', reading?.temperatureC ?? null, limits.temperatureC);
  const nh3 = classify('nh3GasMv', reading?.nh3GasMv ?? null, limits.nh3GasMv);

  /**
   * Whether a card waits instead of showing a status (domain/warmup.ts): still loading, the
   * station just started, or the gas sensor warming up - the same rule that holds the server's
   * gas alerts, so the card never says "A bit high" while the alerts say nothing, or the reverse.
   * Only while the station is live: a stopped station is not warming up.
   */
  function waitFor(metric: Metric, value: number | null): CardWait | null {
    if (loading) return { kind: 'loading' };
    if (!device || !reading || status !== 'live') return null;
    if (warmingUp(metric, reading, device.readingIntervalSec)) {
      const leftMs = Math.max(0, gasWarmupLeftMs(reading, device.readingIntervalSec) - Math.max(0, now - reading.serverTimeMs));
      const min = Math.max(1, Math.ceil(leftMs / 60_000));
      return {
        kind: 'warming',
        hasValue: value !== null,
        progress: 1 - leftMs / GAS_SETTLE_MS,
        text: value === null ? `Sensor heating up · ready in about ${min} min` : `Settling after power-on · ready in about ${min} min`,
      };
    }
    if (value === null && isFirstReading(reading)) return { kind: 'starting' };
    return null;
  }
  // The station reads a newly saved pH calibration within 10 minutes; until then say so.
  const cal = device?.phCalibration;
  const applyingCalibration = status === 'live' && cal?.status === 'calibrated' && cal.calibratedAtMs !== null
    && now - cal.calibratedAtMs < CALIBRATION_PICKUP_MS;

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <StatusBar style="light" />
      <View style={[styles.header, headerOnTop, { backgroundColor: theme.tint, paddingTop: insets.top + Spacing.two }]}>
        <View style={styles.headerRow}>
          <View style={styles.brand}>
            <Image source={require('@/assets/brand/logo-symbol.svg')} style={styles.logo} contentFit="contain" accessibilityLabel="TubigTala" />
            <ThemedText style={[styles.brandText, { color: theme.onTint }]}>TubigTala</ThemedText>
          </View>
          <Bell unread={unread} />
        </View>
        {devices.status === 'ready' && <DeviceSwitcher devices={devices.data} selectedId={device?.id ?? null} onSelect={select} />}
      </View>

      {/* Fills the screen: the cards share its height, so a normal phone shows all three without
          scrolling; a very small one still scrolls instead of cutting a card off. */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} bounces={false} overScrollMode="never">
        <OfflineBanner />
        {/* The station's status lives in Settings. Here it appears only when it matters: an old
            reading must not look like the current water. */}
        {/* While loading, the cards themselves pulse (MetricCard `wait`). */}
        {loading ? null : !device ? (
          <StatusPill status="no-data" label="No station connected" />
        ) : status !== 'live' ? (
          <View style={styles.statusRow}>
            <StatusPill status={status} />
            {reading && <ThemedText type="small" themeColor="textSecondary">last reading {formatAge(now - reading.serverTimeMs)}</ThemedText>}
          </View>
        ) : null}

        {loadError && <Notice tone="warning">{loadError}</Notice>}
        {/* Only when the list really loaded empty - not offline, where it is unknown. */}
        {devices.status === 'ready' && devices.data.length === 0 && (
          <Button label={`Add ${STATION_NAME}`} icon="qr_code_scanner" onPress={() => router.push('/pair-device')} />
        )}

        <MetricCard
          icon={METRIC_ICON.ph}
          label="pH level"
          value={formatNumber(reading?.ph ?? null, 1)}
          status={ph}
          note={`Normal ${normalRangeText('ph', limits.ph)}`}
          dimmed={dimmed}
          wait={waitFor('ph', reading?.ph ?? null)}
          tags={[
            ...(applyingCalibration ? [{ label: 'Applying new calibration', tone: 'info' as const, pulse: true }]
              : reading && !reading.phCalibrated ? [{ label: 'Uncalibrated', tone: 'warning' as const }] : []),
            ...sim,
          ]}>
          <ScaleBar
            value={reading?.ph ?? null}
            min={0}
            max={14}
            segments={[{ until: limits.ph.normal[0], color: theme.scaleAcid }, { until: limits.ph.normal[1], color: theme.scaleNeutral }, { until: 14, color: theme.scaleBase }]}
            labels={['0 Acidic', '7 Neutral', 'Alkaline 14']}
          />
        </MetricCard>

        <MetricCard
          icon={METRIC_ICON.temperatureC}
          label="Temperature"
          value={formatNumber(reading?.temperatureC ?? null, 1)}
          unit="°C"
          status={temp}
          note={`Normal ${normalRangeText('temperatureC', limits.temperatureC)}`}
          dimmed={dimmed}
          wait={waitFor('temperatureC', reading?.temperatureC ?? null)}
          tags={sim}>
          <ScaleBar
            value={reading?.temperatureC ?? null}
            min={0}
            max={tempMax}
            segments={[{ until: limits.temperatureC.normal[0], color: theme.scaleCool }, { until: limits.temperatureC.normal[1], color: theme.scaleNeutral }, { until: tempMax, color: theme.scaleWarm }]}
            labels={['0 °C', `${tempMax / 2} °C`, `${tempMax} °C`]}
          />
        </MetricCard>

        <MetricCard
          icon={METRIC_ICON.nh3GasMv}
          label="Ammonia gas"
          value={formatNumber(reading?.nh3GasMv ?? null, 0)}
          unit="mV"
          status={nh3}
          note={`Air above the water · normal ${normalRangeText('nh3GasMv', limits.nh3GasMv)}`}
          dimmed={dimmed}
          wait={waitFor('nh3GasMv', reading?.nh3GasMv ?? null)}
          tags={[{ label: 'Relative, not ppm', tone: 'info' }, ...sim]}
        />
      </ScrollView>
    </View>
  );
}

function Bell({ unread }: { unread: number }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      style={({ pressed }) => [styles.bell, { opacity: pressed ? 0.7 : 1 }]}>
      <Icon name="notifications" size={26} color="onTint" />
      {unread > 0 && (
        <View style={[styles.badge, { backgroundColor: theme.levelCritical, borderColor: theme.tint }]}>
          <ThemedText style={[styles.badgeText, { color: theme.onTint }]}>{unread > 99 ? '99+' : unread}</ThemedText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.three, gap: Spacing.two, borderBottomLeftRadius: HEADER_CURVE, borderBottomRightRadius: HEADER_CURVE },
  scroll: { marginTop: -HEADER_CURVE },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  logo: { width: 40, height: 40 },
  brandText: { fontSize: 20, lineHeight: 26, fontWeight: 700 },
  content: { flexGrow: 1, padding: Spacing.three, paddingTop: HEADER_CURVE + Spacing.two, gap: Spacing.two, paddingBottom: Spacing.three },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 28 },
  bell: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  badge: {
    position: 'absolute', top: 2, right: 0, minWidth: 22, height: 22, borderRadius: Radius.pill,
    paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  badgeText: { fontSize: 11, lineHeight: 14, fontWeight: 700 },
});
