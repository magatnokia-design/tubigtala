import { useRef, useState } from 'react';
import {
  ScrollView, StyleSheet, useWindowDimensions, View,
  type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance,
} from 'react-native';
import type { AndroidSymbol } from 'expo-symbols';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useOnboarding } from '@/hooks/use-onboarding';
import { useTheme } from '@/hooks/use-theme';

// Shown once per account, right after sign-up / first sign-in. One feature per slide.
const SLIDES: { icon: AndroidSymbol; title: string; body: string }[] = [
  { icon: 'water_ph', title: 'pH level', body: 'See if your water is acidic, neutral or basic.' },
  { icon: 'device_thermostat', title: 'Temperature', body: 'Live water temperature in °C.' },
  { icon: 'air', title: 'Ammonia', body: 'Ammonia gas in the air above the water.' },
  { icon: 'monitoring', title: 'Analytics', body: 'Trends for the last hour, day or week.' },
];

export default function OnboardingScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { finish } = useOnboarding();
  const scroller = useRef<ScrollViewInstance>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  function next() {
    if (last) return finish();
    scroller.current?.scrollTo({ x: (index + 1) * width, animated: true });
    setIndex(index + 1);
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.fill}>
        <View style={styles.topBar}>
          <Image source={require('@/assets/brand/logo-mark.svg')} style={styles.mark} contentFit="contain" accessibilityLabel="TubigTala" />
          {!last && <Button label="Skip" variant="text" onPress={finish} />}
        </View>

        <ScrollView ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScrollEnd}>
          {SLIDES.map((slide) => (
            <View key={slide.title} style={[styles.slide, { width }]}>
              <View style={[styles.halo, { backgroundColor: theme.backgroundElement }]}>
                <View style={[styles.badge, { backgroundColor: theme.tint }]}>
                  <Icon name={slide.icon} size={64} color="onTint" />
                </View>
              </View>
              <ThemedText style={styles.title}>{slide.title}</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.body}>{slide.body}</ThemedText>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {SLIDES.map((s, i) => (
              <View key={s.title} style={[styles.dot, { backgroundColor: i === index ? theme.tint : theme.border, width: i === index ? 24 : 8 }]} />
            ))}
          </View>
          <Button label={last ? 'Get started' : 'Next'} icon={last ? 'check_circle' : 'arrow_forward'} onPress={next} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.four, minHeight: 56 },
  mark: { width: 36, height: 36 },
  slide: { paddingHorizontal: Spacing.five, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  halo: { width: 200, height: 200, borderRadius: 100, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.four },
  badge: { width: 132, height: 132, borderRadius: 66, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 30, lineHeight: 36, fontWeight: 700, textAlign: 'center' },
  body: { textAlign: 'center', fontSize: 17, lineHeight: 24 },
  footer: { padding: Spacing.four, gap: Spacing.four },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two },
  dot: { height: 8, borderRadius: 4 },
});
