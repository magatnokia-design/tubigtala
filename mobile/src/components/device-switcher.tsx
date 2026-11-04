import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { Device } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';

/** Chips on the blue header for picking a device. Renders nothing for a single device. */
export function DeviceSwitcher({ devices, selectedId, onSelect }: {
  devices: Device[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();
  if (devices.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {devices.map((d) => {
        const selected = d.id === selectedId;
        return (
          <Pressable
            key={d.id}
            onPress={() => onSelect(d.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.chip, { backgroundColor: selected ? theme.background : 'rgba(255,255,255,0.18)' }]}>
            <Icon name="sensors" size={16} color={selected ? 'tint' : 'onTint'} />
            <ThemedText type="smallBold" style={{ color: selected ? theme.tint : theme.onTint }}>{d.name}</ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two },
  chip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2, borderRadius: Radius.pill },
});
