/**
 * TubigTala palette: water blues on white. The app is light-only by design
 * (app.json userInterfaceStyle "light"), so `dark` deliberately reuses the light palette.
 */

import '@/global.css';

import { Platform } from 'react-native';

const light = {
  text: '#0B2540', // deep water navy
  background: '#FFFFFF',
  backgroundElement: '#EEF7FD', // pale water, cards
  backgroundSelected: '#D7ECFA',
  textSecondary: '#4F6B85',
  tint: '#0079CE', // logo blue: buttons, header, accents
  tintDeep: '#085698', // logo deep blue: pressed states, centre tab
  onTint: '#FFFFFF',
  border: '#CFE4F3',
  live: '#13865A',
  stale: '#B26A00',
  offline: '#C9372C',
  noData: '#4F6B85',
  notice: '#E3F2FC',
  onNotice: '#0B3D63',
  warning: '#FFF4DE',
  onWarning: '#6B4100',
  // Gauge tracks on the Water tab (pH acidic / neutral / basic; temperature cool / warm)
  scaleAcid: '#F5A35C',
  scaleNeutral: '#3CC28A',
  scaleBase: '#6A7FE0',
  scaleCool: '#7CC3F0',
  scaleWarm: '#F2A65A',
} as const;

export const Colors = { light, dark: light } as const;

export type ThemeColor = keyof typeof light;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { small: 10, card: 18, pill: 999 } as const;

export const MaxContentWidth = 800;
