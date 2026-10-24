import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import type { ThemeColor } from '@/constants/theme';

/**
 * The app's only icon component: Google Material Symbols via expo-symbols (bundled with
 * Expo, works in Expo Go). Use these instead of emoji so icons match across phones.
 * Browse names at https://fonts.google.com/icons.
 */
export function Icon({
  name, size = 22, color = 'tint', style,
}: { name: AndroidSymbol; size?: number; color?: ThemeColor; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <SymbolView name={{ android: name, web: name }} size={size} tintColor={theme[color]} style={style} />;
}
