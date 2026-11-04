import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useOnline } from '@/hooks/use-online';
import { useTheme } from '@/hooks/use-theme';

/** Shown at the top of each tab while the phone is offline. Renders nothing when online. */
export function OfflineBanner() {
  const theme = useTheme();
  const online = useOnline();
  if (online) return null;
  return (
    <View style={[styles.banner, { backgroundColor: theme.levelWarningBg }]} accessibilityRole="alert">
      <Icon name="cloud_off" size={18} color="levelWarning" />
      <ThemedText type="small" style={[styles.text, { color: theme.levelWarning }]}>Offline · showing last saved data</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.small },
  text: { flex: 1, fontWeight: 600 },
});
