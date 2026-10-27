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
import { Radius, Spacing } from '@/constants/theme';
import { useOnboarding } from '@/hooks/use-onboarding';
import { useTheme } from '@/hooks/use-theme';

const SLIDES: { icon: AndroidSymbol; logo?: boolean; title: string; body: string; points: { icon: AndroidSymbol; text: string }[] }[] = [
  {
    icon: 'water_drop',
    logo: true,
    title: 'Welcome to TubigTala',
    body: 'Keep an eye on your water from your phone. A TubigTala device sits by your tank or pond and sends readings every minute.',
    points: [
      { icon: 'sensors', text: 'Place the device near the water' },
      { icon: 'wifi', text: 'Connect it to Wi-Fi' },
      { icon: 'smartphone', text: 'Watch the readings here' },
    ],
  },
  {
    icon: 'water_ph',
    title: 'Read the Water tab',
    body: 'Three cards show the latest values. A green "Live" badge means the reading is fresh; grey means the device has gone quiet.',
    points: [
      { icon: 'water_ph', text: 'pH level: 7 is neutral, below is acidic, above is basic' },
      { icon: 'device_thermostat', text: 'Water temperature in °C' },
      { icon: 'air', text: 'Ammonia gas in the air above the water (relative, not ppm)' },
    ],
  },
  {
    icon: 'monitoring',
    title: 'See trends in Analytics',
    body: 'Charts show how each reading changed over the last hour, day or week, so slow changes are easy to spot.',
    points: [
      { icon: 'schedule', text: 'Switch between 1 h, 6 h, 24 h and 7 days' },
      { icon: 'trending_up', text: 'Lowest, average and highest at a glance' },
    ],
  },
  {
    icon: 'notifications_active',
    title: 'Get alerted',
    body: 'Turn on notifications and add your mobile number in Settings to hear about problems even when the app is closed.',
    points: [
      { icon: 'notifications', text: 'App notifications' },
      { icon: 'sms', text: 'SMS to your PH mobile number' },
      { icon: 'info', text: 'TubigTala is a monitoring aid, not a certified drinking-water test' },
    ],
  },
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
          <View style={styles.brandRow}>
            <Image source={require('@/assets/brand/logo-mark.svg')} style={styles.mark} contentFit="contain" />
            <ThemedText type="smallBold" style={{ color: theme.tint }}>TubigTala</ThemedText>
          </View>
          {!last && <Button label="Skip" variant="text" onPress={finish} />}
        </View>

        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}>
          {SLIDES.map((slide) => (
            <View key={slide.title} style={[styles.slide, { width }]}>
              {slide.logo ? (
                <Image source={require('@/assets/brand/logo-wordmark.svg')} style={styles.wordmark} contentFit="contain" accessibilityLabel="TubigTala" />
              ) : (
                <View style={[styles.halo, { backgroundColor: theme.backgroundElement }]}>
                  <View style={[styles.badge, { backgroundColor: theme.tint }]}>
                    <Icon name={slide.icon} size={56} color="onTint" />
                  </View>
                </View>
              )}
              <ThemedText style={styles.title}>{slide.title}</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.body}>{slide.body}</ThemedText>
              <View style={[styles.points, { backgroundColor: theme.backgroundElement }]}>
                {slide.points.map((p) => (
                  <View key={p.text} style={styles.point}>
                    <Icon name={p.icon} size={20} />
                    <ThemedText type="small" style={styles.pointText}>{p.text}</ThemedText>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {SLIDES.map((s, i) => (
              <View
                key={s.title}
                style={[styles.dot, { backgroundColor: i === index ? theme.tint : theme.border, width: i === index ? 24 : 8 }]}
              />
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
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  mark: { width: 28, height: 28 },
  wordmark: { width: 220, height: 193, marginBottom: Spacing.two },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.four, minHeight: 48 },
  slide: { paddingHorizontal: Spacing.four, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  halo: { width: 168, height: 168, borderRadius: 84, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.two },
  badge: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, lineHeight: 32, fontWeight: 700, textAlign: 'center' },
  body: { textAlign: 'center' },
  points: { alignSelf: 'stretch', borderRadius: Radius.card, padding: Spacing.three, gap: Spacing.three, marginTop: Spacing.two },
  point: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  pointText: { flex: 1 },
  footer: { padding: Spacing.four, gap: Spacing.four },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.two },
  dot: { height: 8, borderRadius: 4 },
});
