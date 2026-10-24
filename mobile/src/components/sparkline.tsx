import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

const BARS = 48;
const HEIGHT = 40;

/**
 * Minimal trend bars built from Views (no chart library yet). Values are bucketed into
 * up to 48 bars; a bucket with no valid samples is left empty rather than drawn as zero.
 */
export function Sparkline({ values }: { values: (number | null)[] }) {
  const theme = useTheme();
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length < 2) {
    return (
      <View style={[styles.box, styles.center]}>
        <ThemedText type="small" themeColor="textSecondary">
          Not enough data for a trend
        </ThemedText>
      </View>
    );
  }

  const n = Math.min(BARS, values.length);
  const buckets: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    const slice = values.slice(Math.floor((i * values.length) / n), Math.floor(((i + 1) * values.length) / n));
    const nums = slice.filter((v): v is number => v !== null);
    buckets.push(nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null);
  }
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const span = max - min || 1;

  return (
    <View style={[styles.box, styles.row]}>
      {buckets.map((v, i) => (
        <View key={i} style={styles.slot}>
          {v !== null && (
            <View
              style={{
                height: 4 + ((v - min) / span) * (HEIGHT - 4),
                backgroundColor: theme.tint,
                borderRadius: 2,
                opacity: i === buckets.length - 1 ? 1 : 0.6,
              }}
            />
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: HEIGHT },
  center: { justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  slot: { flex: 1, justifyContent: 'flex-end' },
});
