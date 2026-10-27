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

export default function WaterScreen() {
  const theme = useTheme();
  const now = useNow();
  const profile = useProfile();
  const { devices, device, select } = useSelectedDevice();
  const latest = useLatestReading(device?.id ?? null);
  const notifications = useNotifications();

  const firstName = profile.status === 'ready' ? profile.data?.displayName.split(' ')[0] ?? '' : '';
  const unread = notifications.status === 'ready' ? notifications.data.filter((n) => !n.read).length : 0;

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
        {devices.status === 'loading' && <ActivityIndicator style={styles.loading} color={theme.tint} />}
        {devices.status === 'error' && <Notice tone="warning">{devices.message}</Notice>}
        {devices.status === 'ready' && !device && (
          <EmptyState
            icon="sensors_off"
            title="No device yet"
            body="Your TubigTala device appears here once it is linked to this account."
          />
        )}

        {device && latest.status === 'loading' && <ActivityIndicator style={styles.loading} color={theme.tint} />}
        {device && latest.status === 'error' && <Notice tone="warning">{latest.message}</Notice>}
        {device && latest.status === 'ready' && !latest.data && (
          <EmptyState icon="hourglass_empty" title="Waiting for the first reading" body="Readings appear here as soon as the device sends one." />
        )}

        {device && latest.status === 'ready' && latest.data && (() => {
          const r = latest.data;
          const status = deviceStatus(r.serverTimeMs, device.readingIntervalSec, now);
          const dimmed = status !== 'live';
          const sim: Tag[] = r.simulated ? [{ label: 'Simulated data', tone: 'warning' }] : [];
          return (
            <>
              <View style={styles.statusRow}>
                <StatusPill status={status} />
                <ThemedText type="small" themeColor="textSecondary">Updated {formatAge(now - r.serverTimeMs)}</ThemedText>
              </View>

              {device.simulated && (
                <Notice tone="warning">Simulated device: these values are generated for testing, not measured by a sensor.</Notice>
              )}
              {status === 'offline' && (
                <Notice tone="warning">The device has not reported for a while. These are the last values received.</Notice>
              )}

              <MetricCard
                icon="water_ph"
                label="pH level"
                value={formatNumber(r.ph, 1)}
                description={phDescriptor(r.ph)}
                dimmed={dimmed}
                tags={[...(r.phCalibrated ? [] : [{ label: 'Uncalibrated probe', tone: 'warning' as const }]), ...sim]}>
                <ScaleBar
                  value={r.ph}
                  min={0}
                  max={14}
                  segments={[{ until: 6.5, color: theme.scaleAcid }, { until: 7.5, color: theme.scaleNeutral }, { until: 14, color: theme.scaleBase }]}
                  labels={['0 Acidic', '7 Neutral', 'Basic 14']}
                />
              </MetricCard>

              <MetricCard
                icon="device_thermostat"
                label="Temperature"
                value={formatNumber(r.temperatureC, 1)}
                unit="°C"
                description="Water temperature"
                dimmed={dimmed}
                tags={sim}>
                <ScaleBar
                  value={r.temperatureC}
                  min={0}
                  max={40}
                  segments={[{ until: 20, color: theme.scaleCool }, { until: 40, color: theme.scaleWarm }]}
                  labels={['0 °C', '20 °C', '40 °C']}
                />
              </MetricCard>

              <MetricCard
                icon="air"
                label="Ammonia"
                value={formatNumber(r.nh3GasMv, 0)}
                unit="mV"
                description="Ammonia gas in the air above the water"
                dimmed={dimmed}
                tags={[{ label: 'Relative, not ppm', tone: 'info' }, { label: 'Uncalibrated', tone: 'warning' }, ...sim]}
              />

              <ThemedText type="small" themeColor="textSecondary" style={styles.disclaimer}>
                Monitoring aid only. Not a certified drinking-water test.
              </ThemedText>
            </>
          );
        })()}
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

function EmptyState({ icon, title, body }: { icon: 'sensors_off' | 'hourglass_empty'; title: string; body: string }) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundElement }]}>
        <Icon name={icon} size={40} />
      </View>
      <ThemedText type="smallBold" style={styles.emptyTitle}>{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>{body}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  loading: { marginTop: Spacing.six },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  bell: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  badge: {
    position: 'absolute', top: 4, right: 4, minWidth: 20, height: 20, borderRadius: Radius.pill,
    paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  badgeText: { fontSize: 11, lineHeight: 14, fontWeight: 700 },
  empty: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.six, paddingHorizontal: Spacing.four },
  emptyIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, lineHeight: 24 },
  center: { textAlign: 'center' },
  disclaimer: { textAlign: 'center', marginTop: Spacing.two },
});
