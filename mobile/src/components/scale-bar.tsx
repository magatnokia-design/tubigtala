import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A horizontal scale with a marker at `value`. `segments` colour the track (e.g. acidic /
 * neutral / basic for pH). No marker is drawn for a missing value.
 */
export function ScaleBar({ value, min, max, segments, labels }: {
  value: number | null;
  min: number;
  max: number;
  segments: { until: number; color: string }[];
  labels: string[];
}) {
  const theme = useTheme();
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
  // Width of each coloured segment = distance from the previous segment's end.
  const widths = segments.map((s, i) => pct(s.until) - pct(i === 0 ? min : segments[i - 1].until));

  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        {segments.map((s, i) => (
          <View key={s.until} style={{ width: `${widths[i]}%`, backgroundColor: s.color }} />
        ))}
        {value !== null && (
          <View style={[styles.marker, { left: `${pct(value)}%`, borderColor: theme.background, backgroundColor: theme.text }]} />
        )}
      </View>
      <View style={styles.labels}>
        {labels.map((l) => (
          <ThemedText key={l} type="small" themeColor="textSecondary" style={styles.labelText}>{l}</ThemedText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one, marginTop: Spacing.two },
  track: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'visible' },
  marker: { position: 'absolute', top: -5, width: 20, height: 20, marginLeft: -10, borderRadius: 10, borderWidth: 3 },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  labelText: { fontSize: 12, lineHeight: 16 },
});
