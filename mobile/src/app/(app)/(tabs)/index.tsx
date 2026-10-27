import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { DeviceSwitcher } from '@/components/device-switcher';
import { Icon } from '@/components/icon';
import { MetricCard, type Tag } from '@/components/metric-card';
import { Notice } from '@/components/notice';
import { ScaleBar } from '@/components/scale-bar';
import { StatusPill } from '@/components/status-pill';
import { TabHeader } from '@/components/tab-header';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { formatAge, formatNumber } from '@/domain/format';
import { phDescriptor } from '@/domain/readings';
import { deviceStatus } from '@/domain/status';
import { useLatestReading } from '@/hooks/use-devices';
import { useNow } from '@/hooks/use-now';
import { useNotifications, useProfile } from '@/hooks/use-profile';
import { useSelectedDevice } from '@/hooks/use-selected-device';
import { useTheme } from '@/hooks/use-theme';

function greeting(now: number): string {
  const h = new Date(now).getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The three reading cards are always shown. Without a device or a reading they show "—"
 * (never made-up values), so the layout is visible before any hardware is connected.
 */
export default function WaterScreen() {
  const theme = useTheme();
  const now = useNow();
  const profile = useProfile();
  const { devices, device, select } = useSelectedDevice();
  const latest = useLatestReading(device?.id ?? null);
  const notifications = useNotifications();

  const firstName = profile.status === 'ready' ? profile.data?.displayName.split(' ')[0] ?? '' : '';
  const unread = notifications.status === 'ready' ? notifications.data.filter((n) => !n.read).length : 0;

  const reading = device && latest.status === 'ready' ? latest.data : null;
  const loading = devices.status === 'loading' || (device !== null && latest.status === 'loading');
  const status = reading && device ? deviceStatus(reading.serverTimeMs, device.readingIntervalSec, now) : 'no-data';
  const dimmed = status !== 'live';
  const sim: Tag[] = reading?.simulated ? [{ label: 'Simulated', tone: 'warning' }] : [];
  const loadError = devices.status === 'error' ? devices.message : device && latest.status === 'error' ? latest.message : null;

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <TabHeader
        eyebrow={`${greeting(now)}${firstName ? `, ${firstName}` : ''}`}
        title={device?.name ?? 'Your water'}
        right={<Bell unread={unread} />}>
        {devices.status === 'ready' && (
          <DeviceSwitcher devices={devices.data} selectedId={device?.id ?? null} onSelect={select} />
        )}
      </TabHeader>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusRow}>
          {loading ? (
            <ActivityIndicator color={theme.tint} />
          ) : (
            <StatusPill status={status} label={device ? undefined : 'No device connected'} />
          )}
          {reading && <ThemedText type="small" themeColor="textSecondary">Updated {formatAge(now - reading.serverTimeMs)}</ThemedText>}
        </View>

        {loadError && <Notice tone="warning">{loadError}</Notice>}
        {device?.simulated && <Notice tone="warning">Simulated device: values are generated for testing.</Notice>}

        <MetricCard
          icon="water_ph"
          label="pH level"
          value={formatNumber(reading?.ph ?? null, 1)}
          description={reading ? phDescriptor(reading.ph) : 'Waiting for data'}
          dimmed={dimmed}
          tags={[...(reading && !reading.phCalibrated ? [{ label: 'Uncalibrated', tone: 'warning' as const }] : []), ...sim]}>
          <ScaleBar
            value={reading?.ph ?? null}
            min={0}
            max={14}
            segments={[{ until: 6.5, color: theme.scaleAcid }, { until: 7.5, color: theme.scaleNeutral }, { until: 14, color: theme.scaleBase }]}
            labels={['0 Acidic', '7 Neutral', 'Basic 14']}
          />
        </MetricCard>

        <MetricCard
          icon="device_thermostat"
          label="Temperature"
          value={formatNumber(reading?.temperatureC ?? null, 1)}
          unit="°C"
          description={reading ? 'Water temperature' : 'Waiting for data'}
          dimmed={dimmed}
          tags={sim}>
          <ScaleBar
            value={reading?.temperatureC ?? null}
            min={0}
            max={40}
            segments={[{ until: 20, color: theme.scaleCool }, { until: 40, color: theme.scaleWarm }]}
            labels={['0 °C', '20 °C', '40 °C']}
          />
        </MetricCard>

        <MetricCard
          icon="air"
          label="Ammonia"
          value={formatNumber(reading?.nh3GasMv ?? null, 0)}
          unit="mV"
          description={reading ? 'Gas above the water' : 'Waiting for data'}
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
        <View style={[styles.badge, { backgroundColor: theme.offline, borderColor: theme.tint }]}>
          <ThemedText style={[styles.badgeText, { color: theme.onTint }]}>{unread > 9 ? '9+' : unread}</ThemedText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap', minHeight: 28 },
  bell: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  badge: {
    position: 'absolute', top: 4, right: 4, minWidth: 20, height: 20, borderRadius: Radius.pill,
    paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  badgeText: { fontSize: 11, lineHeight: 14, fontWeight: 700 },
});
