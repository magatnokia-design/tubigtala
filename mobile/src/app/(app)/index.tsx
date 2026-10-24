import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';

import { Icon } from '@/components/icon';
import { Notice } from '@/components/notice';
import { StatusPill } from '@/components/status-pill';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { formatAge } from '@/domain/format';
import { deviceStatus } from '@/domain/status';
import type { Device } from '@/domain/types';
import { useAuth } from '@/hooks/use-auth';
import { useLatestReading, useOwnedDevices } from '@/hooks/use-devices';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';

export default function DevicesScreen() {
  const devices = useOwnedDevices();
  const { user } = useAuth();

  return (
    <ThemedView style={styles.fill}>
      {devices.status === 'loading' && <ActivityIndicator style={styles.center} />}
      {devices.status === 'error' && (
        <View style={styles.pad}>
          <Notice tone="warning">{devices.message}</Notice>
        </View>
      )}
      {devices.status === 'ready' && (
        <FlatList
          data={devices.data}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <ThemedText type="small" themeColor="textSecondary">
              {`Signed in as ${user?.email ?? 'unknown'}`}
            </ThemedText>
          }
          renderItem={({ item }) => <DeviceRow device={item} />}
          ListEmptyComponent={<EmptyDevices />}
        />
      )}
    </ThemedView>
  );
}

function EmptyDevices() {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundElement }]}>
        <Icon name="sensors_off" size={36} />
      </View>
      <ThemedText type="smallBold">No devices on this account</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
        A monitoring device appears here once it is linked to the account you signed in with.
      </ThemedText>
    </View>
  );
}

function DeviceRow({ device }: { device: Device }) {
  const theme = useTheme();
  const latest = useLatestReading(device.id);
  const now = useNow();

  let detail = 'Loading…';
  let status = null;
  if (latest.status === 'error') detail = latest.message;
  if (latest.status === 'ready') {
    status = deviceStatus(latest.data?.serverTimeMs ?? null, device.readingIntervalSec, now);
    detail = latest.data ? `Last reading ${formatAge(now - latest.data.serverTimeMs)}` : 'Waiting for the first reading';
  }

  return (
    <Link href={{ pathname: '/device/[id]', params: { id: device.id } }} asChild>
      <Pressable
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement, borderColor: theme.border },
        ]}>
        <View style={[styles.rowIcon, { backgroundColor: theme.background }]}>
          <Icon name="water_drop" size={26} />
        </View>
        <View style={styles.rowBody}>
          <ThemedText type="smallBold" style={styles.name}>{device.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{detail}</ThemedText>
          {status && <StatusPill status={status} />}
          {device.simulated && (
            <View style={styles.simRow}>
              <Icon name="science" size={16} color="stale" />
              <ThemedText type="small" style={{ color: theme.stale }}>Simulated - not real sensor data</ThemedText>
            </View>
          )}
        </View>
        <Icon name="chevron_right" color="textSecondary" />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { marginTop: Spacing.six },
  centerText: { textAlign: 'center' },
  pad: { padding: Spacing.three },
  list: { padding: Spacing.three, gap: Spacing.three },
  empty: { alignItems: 'center', gap: Spacing.two, marginTop: Spacing.six, paddingHorizontal: Spacing.four },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.three,
    padding: Spacing.three, borderRadius: Radius.card, borderWidth: 1,
  },
  rowIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: Spacing.one },
  name: { fontSize: 18, lineHeight: 24 },
  simRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
