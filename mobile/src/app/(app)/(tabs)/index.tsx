import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeviceSwitcher } from '@/components/device-switcher';
import { Icon } from '@/components/icon';
import { MetricCard, type Tag } from '@/components/metric-card';
import { Notice } from '@/components/notice';
import { OfflineBanner } from '@/components/offline-banner';
import { ScaleBar } from '@/components/scale-bar';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { HEADER_CURVE, headerOnTop, Radius, Spacing } from '@/constants/theme';
import { formatAge, formatNumber } from '@/domain/format';
import { deviceStatus } from '@/domain/status';
import { classify, normalRangeText, RANGES } from '@/domain/thresholds';
import { useLatestReading } from '@/hooks/use-devices';
import { useNow } from '@/hooks/use-now';
import { useNotifications } from '@/hooks/use-profile';
import { useSelectedDevice } from '@/hooks/use-selected-device';
import { useTheme } from '@/hooks/use-theme';

/**
 * Water tab: logo + bell, then the three readings. Each card leads with its status in plain
 * words and turns amber/red when out of range. Cards are always shown; without a device or a
 * reading they show "—" and "No reading" (never made-up values).
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

  const ph = classify('ph', reading?.ph ?? null);
  const temp = classify('temperatureC', reading?.temperatureC ?? null);
  const nh3 = classify('nh3GasMv', reading?.nh3GasMv ?? null);

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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <OfflineBanner />
        <View style={styles.statusRow}>
          {loading ? (
            <ActivityIndicator color={theme.tint} />
          ) : (
            <StatusPill status={status} label={device ? undefined : 'No device connected'} />
          )}
          {device && <ThemedText type="smallBold" numberOfLines={1} style={styles.deviceName}>{device.name}</ThemedText>}
          {reading && <ThemedText type="small" themeColor="textSecondary">· {formatAge(now - reading.serverTimeMs)}</ThemedText>}
        </View>

        {loadError && <Notice tone="warning">{loadError}</Notice>}

        <MetricCard
          icon="water_ph"
          label="pH level"
          value={formatNumber(reading?.ph ?? null, 1)}
          status={ph}
          note={`Normal ${normalRangeText('ph')}`}
          dimmed={dimmed}
          tags={[...(reading && !reading.phCalibrated ? [{ label: 'Uncalibrated', tone: 'warning' as const }] : []), ...sim]}>
          <ScaleBar
            value={reading?.ph ?? null}
            min={0}
            max={14}
            segments={[{ until: RANGES.ph.normal[0], color: theme.scaleAcid }, { until: RANGES.ph.normal[1], color: theme.scaleNeutral }, { until: 14, color: theme.scaleBase }]}
            labels={['0 Acidic', '7 Neutral', 'Basic 14']}
          />
        </MetricCard>

        <MetricCard
          icon="device_thermostat"
          label="Temperature"
          value={formatNumber(reading?.temperatureC ?? null, 1)}
          unit="°C"
          status={temp}
          note={`Normal ${normalRangeText('temperatureC')}`}
          dimmed={dimmed}
          tags={sim}>
          <ScaleBar
            value={reading?.temperatureC ?? null}
            min={0}
            max={40}
            segments={[{ until: RANGES.temperatureC.normal[0], color: theme.scaleCool }, { until: RANGES.temperatureC.normal[1], color: theme.scaleNeutral }, { until: 40, color: theme.scaleWarm }]}
            labels={['0 °C', '20 °C', '40 °C']}
          />
        </MetricCard>

        <MetricCard
          icon="air"
          label="Ammonia"
          value={formatNumber(reading?.nh3GasMv ?? null, 0)}
          unit="mV"
          status={nh3}
          note={`Gas above the water · normal ${normalRangeText('nh3GasMv')}`}
          dimmed={dimmed}
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
  content: { padding: Spacing.three, paddingTop: HEADER_CURVE + Spacing.three, gap: Spacing.two + 2, paddingBottom: Spacing.five },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 28 },
  deviceName: { flexShrink: 1 },
  bell: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  badge: {
    position: 'absolute', top: 2, right: 0, minWidth: 22, height: 22, borderRadius: Radius.pill,
    paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  badgeText: { fontSize: 11, lineHeight: 14, fontWeight: 700 },
});
