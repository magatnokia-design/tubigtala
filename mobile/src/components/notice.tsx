import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Highlighted note for things the user must not miss: simulated data, uncalibrated sensors, errors. */
export function Notice({ children, tone = 'info' }: { children: string; tone?: 'info' | 'warning' }) {
  const theme = useTheme();
  const warning = tone === 'warning';
  return (
    <View style={[styles.box, { backgroundColor: warning ? theme.warning : theme.notice }]}>
      <Icon name={warning ? 'warning' : 'info'} size={20} color={warning ? 'onWarning' : 'onNotice'} />
      <ThemedText type="small" style={[styles.text, { color: warning ? theme.onWarning : theme.onNotice }]}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: Spacing.two, padding: Spacing.three, borderRadius: Radius.small, alignItems: 'flex-start' },
  text: { flex: 1 },
});
