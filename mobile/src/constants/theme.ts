/**
 * TubigTala palette: water blues on white. The app is light-only by design
 * (app.json userInterfaceStyle "light"), so `dark` deliberately reuses the light palette.
 * The values live in constants/tokens.ts, shared with the landing page (website/).
 */

import '@/global.css';

import { Platform } from 'react-native';

import { palette as light, Radius, Spacing } from './tokens';

export { Radius, Spacing };

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

/**
 * Tab headers have rounded bottom corners. Scroll content starts this far *under* the header
 * (which sits on top), so cards slide behind the curve instead of being cut off in a straight
 * line below it.
 */
export const HEADER_CURVE = 24;
export const headerOnTop = { zIndex: 2, elevation: 4 } as const;

export const MaxContentWidth = 800;
