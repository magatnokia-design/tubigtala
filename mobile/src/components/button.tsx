import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { AndroidSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'text';
  icon?: AndroidSymbol;
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', icon, busy = false, disabled = false, style }: Props) {
  const theme = useTheme();
  const primary = variant === 'primary';
  const fg = primary ? theme.onTint : theme.tint;
  const inactive = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => [
        styles.base,
        variant === 'text' ? styles.text : null,
        primary && { backgroundColor: pressed ? theme.tintDeep : theme.tint },
        variant === 'outline' && { borderWidth: 1, borderColor: theme.border, backgroundColor: pressed ? theme.backgroundElement : theme.background },
        variant === 'text' && pressed && { opacity: 0.6 },
        disabled && !busy && { opacity: 0.5 },
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon && <Icon name={icon} size={20} color={primary ? 'onTint' : 'tint'} />}
          <ThemedText type="smallBold" style={[styles.label, { color: fg }]}>{label}</ThemedText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 52, borderRadius: Radius.small, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.four },
  text: { minHeight: 40, paddingHorizontal: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  label: { fontSize: 16 },
});
