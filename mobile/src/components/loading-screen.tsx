import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Full-screen wait on the brand colour. After a few seconds it says why it might be stuck,
 * so "no connection" never looks like an endless spinner.
 */
export function LoadingScreen({ message, error, action }: {
  message?: string;
  error?: string;
  action?: { label: string; onPress: () => void };
}) {
  const theme = useTheme();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={[styles.fill, { backgroundColor: theme.tint }]}>
      <StatusBar style="light" />
      <Image source={require('@/assets/brand/logo-symbol.svg')} style={styles.logo} contentFit="contain" accessibilityLabel="TubigTala logo" />
      {error ? (
        <ThemedText style={[styles.text, { color: theme.onTint }]}>{error}</ThemedText>
      ) : (
        <>
          <ActivityIndicator color={theme.onTint} />
          <ThemedText style={[styles.text, { color: theme.onTint }]}>
            {slow ? 'Still connecting… check your internet connection.' : message ?? 'Loading…'}
          </ThemedText>
        </>
      )}
      {action && (error || slow) && (
        <Button label={action.label} onPress={action.onPress} variant="outline" style={styles.action} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.five },
  logo: { width: 120, height: 120 },
  text: { textAlign: 'center', opacity: 0.9 },
  action: { alignSelf: 'stretch', marginTop: Spacing.three },
});
