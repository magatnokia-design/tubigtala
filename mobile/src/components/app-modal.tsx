import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import type { AndroidSymbol } from 'expo-symbols';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ModalTone = 'info' | 'success' | 'warning' | 'danger';

const TONE: Record<ModalTone, { icon: AndroidSymbol; fg: ThemeColor; bg: ThemeColor }> = {
  info: { icon: 'info', fg: 'tint', bg: 'backgroundElement' },
  success: { icon: 'check_circle', fg: 'levelNormal', bg: 'levelNormalBg' },
  warning: { icon: 'warning', fg: 'levelWarning', bg: 'levelWarningBg' },
  danger: { icon: 'error', fg: 'levelCritical', bg: 'levelCriticalBg' },
};

export interface ModalAction {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'text';
  busy?: boolean;
}

/**
 * The app's dialog, kept compact: a small tone icon beside the title, optional message or custom
 * content, and the actions side by side (the first action is the main one and sits on the right).
 */
export function AppModal({ visible, onClose, tone = 'info', icon, title, aside, message, children, actions = [], compact = false }: {
  visible: boolean;
  onClose: () => void;
  tone?: ModalTone;
  icon?: AndroidSymbol;
  title: string;
  /** shown at the end of the title row, e.g. a status chip */
  aside?: ReactNode;
  message?: string;
  children?: ReactNode;
  actions?: ModalAction[];
  /** no icon (e.g. the calendar) */
  compact?: boolean;
}) {
  const theme = useTheme();
  const t = TONE[tone];
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.card, { backgroundColor: theme.background }]} onPress={() => {}}>
          <View style={styles.header}>
            {!compact && (
              <View style={[styles.iconWrap, { backgroundColor: theme[t.bg] }]}>
                <Icon name={icon ?? t.icon} size={20} color={t.fg} />
              </View>
            )}
            <ThemedText style={styles.title}>{title}</ThemedText>
            {aside}
          </View>
          {message ? <ThemedText type="small" themeColor="textSecondary" style={styles.message}>{message}</ThemedText> : null}
          {children}
          {actions.length > 0 && (
            <View style={styles.actions}>
              {actions.map((a) => (
                <Button key={a.label} label={a.label} onPress={a.onPress} variant={a.variant ?? 'primary'} busy={a.busy} style={styles.action} />
              ))}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  card: { width: '100%', maxWidth: 380, borderRadius: 20, padding: Spacing.three, gap: Spacing.two + 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: 700 },
  message: { lineHeight: 20 },
  // row-reverse: the first (main) action ends up on the right
  actions: { flexDirection: 'row-reverse', gap: Spacing.two, marginTop: Spacing.one },
  action: { flex: 1, minHeight: 44, paddingHorizontal: Spacing.two },
});

export const modalRadius = Radius.card;
