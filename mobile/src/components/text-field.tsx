import { forwardRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import type { AndroidSymbol } from 'expo-symbols';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface Props extends TextInputProps {
  label: string;
  icon: AndroidSymbol;
  error?: string;
  /** Fixed text before the input, e.g. "+63". */
  prefix?: string;
  /** Adds a show/hide toggle and hides the text by default. */
  password?: boolean;
  hint?: string;
  right?: ReactNode;
}

export const TextField = forwardRef<TextInputInstance, Props>(function TextField(
  { label, icon, error, prefix, password = false, hint, right, style, ...input },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const borderColor = error ? theme.offline : focused ? theme.tint : theme.border;

  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={[styles.row, { borderColor, backgroundColor: focused ? theme.background : theme.backgroundElement }]}>
        <Icon name={icon} size={20} color={focused ? 'tint' : 'textSecondary'} />
        {prefix && (
          <View style={[styles.prefix, { borderRightColor: theme.border }]}>
            <ThemedText style={styles.prefixText}>{prefix}</ThemedText>
          </View>
        )}
        <TextInput
          ref={ref}
          {...input}
          secureTextEntry={password && !visible}
          placeholderTextColor={theme.textSecondary}
          onFocus={(e) => { setFocused(true); input.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); input.onBlur?.(e); }}
          style={[styles.input, { color: theme.text }, style]}
          accessibilityLabel={label}
        />
        {password && (
          <Pressable onPress={() => setVisible((v) => !v)} hitSlop={8} accessibilityLabel={visible ? 'Hide password' : 'Show password'}>
            <Icon name={visible ? 'visibility_off' : 'visibility'} size={20} color="textSecondary" />
          </Pressable>
        )}
        {right}
      </View>
      {error ? (
        <View style={styles.message}>
          <Icon name="error" size={16} color="offline" />
          <ThemedText type="small" style={{ color: theme.offline, flex: 1 }}>{error}</ThemedText>
        </View>
      ) : hint ? (
        <ThemedText type="small" themeColor="textSecondary">{hint}</ThemedText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { gap: Spacing.one },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    borderWidth: 1.5, borderRadius: Radius.small, paddingHorizontal: Spacing.three, minHeight: 52,
  },
  prefix: { paddingRight: Spacing.two, borderRightWidth: 1 },
  prefixText: { fontWeight: 600 },
  input: { flex: 1, paddingVertical: Spacing.two + 2, fontSize: 16 },
  message: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
