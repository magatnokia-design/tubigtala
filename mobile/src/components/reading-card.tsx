import { StyleSheet, View } from 'react-native';
import type { AndroidSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import { Sparkline } from '@/components/sparkline';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  icon: AndroidSymbol;
  label: string;
  value: string;
  unit: string;
  /** Explains what the number is (and is not). Always shown. */
  caption: string;
  /** Older-to-newer values for the trend line; null = missing sample. */
  trend: (number | null)[];
  /** Grey out values when the device is stale or offline. */
  dimmed: boolean;
}

export function ReadingCard({ icon, label, value, unit, caption, trend, dimmed }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border, opacity: dimmed ? 0.55 : 1 }]}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: theme.backgroundElement }]}>
          <Icon name={icon} size={20} />
        </View>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {label}
        </ThemedText>
      </View>
      <View style={styles.valueRow}>
        <ThemedText style={styles.value}>{value}</ThemedText>
        {unit ? (
          <ThemedText type="small" themeColor="textSecondary">
            {unit}
          </ThemedText>
        ) : null}
      </View>
      <Sparkline values={trend} />
      <ThemedText type="small" themeColor="textSecondary">
        {caption}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Radius.card, borderWidth: 1, gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  iconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  value: { fontSize: 40, lineHeight: 46, fontWeight: 600 },
});
