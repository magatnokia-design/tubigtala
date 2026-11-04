import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Google's branding rules: white button, official "G" logo, "Continue with Google". */
export function GoogleButton({ onPress, busy, disabled }: { onPress: () => void; busy: boolean; disabled: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      style={({ pressed }) => [
        styles.button,
        { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundElement : theme.background },
        disabled && !busy && { opacity: 0.5 },
      ]}>
      {busy ? (
        <ActivityIndicator color={theme.tint} />
      ) : (
        <>
          <Image source={require('@/assets/images/google-g.svg')} style={styles.logo} contentFit="contain" />
          <ThemedText type="smallBold" style={styles.label}>Continue with Google</ThemedText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.three,
    minHeight: 52, borderWidth: 1.5, borderRadius: Radius.small,
  },
  logo: { width: 20, height: 20 },
  label: { fontSize: 16 },
});
