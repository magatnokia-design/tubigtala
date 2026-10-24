import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { DeviceStatus } from '@/domain/status';
import { useTheme } from '@/hooks/use-theme';

const LABEL: Record<DeviceStatus, string> = {
  'no-data': 'No readings yet',
  live: 'Live',
  stale: 'Stale',
  offline: 'Offline',
};

const COLOR = { 'no-data': 'noData', live: 'live', stale: 'stale', offline: 'offline' } as const;

export function StatusPill({ status }: { status: DeviceStatus }) {
  const theme = useTheme();
  const color = theme[COLOR[status]];
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText type="smallBold" style={{ color }}>
        {LABEL[status]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderWidth: 1,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
