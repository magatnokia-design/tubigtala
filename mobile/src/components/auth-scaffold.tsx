import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Water-blue hero with the TubigTala mark, and a white sheet for the form. */
export function AuthScaffold({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.fill, { backgroundColor: theme.tint }]}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.fill} edges={['top']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.fill}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bounces={false}>
            <View style={styles.hero}>
              <Image source={require('@/assets/brand/logo-symbol.svg')} style={styles.logo} contentFit="contain" accessibilityLabel="TubigTala logo" />
              <ThemedText style={[styles.brand, { color: theme.onTint }]}>TubigTala</ThemedText>
            </View>
            <View style={[styles.sheet, { backgroundColor: theme.background }]}>
              <View style={styles.titles}>
                <ThemedText style={styles.title}>{title}</ThemedText>
                <ThemedText themeColor="textSecondary">{subtitle}</ThemedText>
              </View>
              {children}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1 },
  hero: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  logo: { width: 76, height: 76 },
  brand: { fontSize: 22, lineHeight: 28, fontWeight: 700, letterSpacing: 0.3 },
  sheet: { flexGrow: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: Spacing.four, gap: Spacing.three },
  titles: { gap: Spacing.half, marginBottom: Spacing.one },
  title: { fontSize: 26, lineHeight: 32, fontWeight: 700 },
});
