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
 * The app's dialog: dimmed backdrop, white card, tone icon, title, optional message or
 * custom content, and up to a few actions (stacked, primary first).
 */
export function AppModal({ visible, onClose, tone = 'info', icon, title, message, children, actions = [], compact = false }: {
  visible: boolean;
  onClose: () => void;
  tone?: ModalTone;
  icon?: AndroidSymbol;
  title: string;
  message?: string;
  children?: ReactNode;
  actions?: ModalAction[];
  /** no icon, smaller title and spacing (e.g. the calendar) */
  compact?: boolean;
}) {
  const theme = useTheme();
  const t = TONE[tone];
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.card, compact && styles.cardCompact, { backgroundColor: theme.background }]} onPress={() => {}}>
          {!compact && (
            <View style={[styles.iconWrap, { backgroundColor: theme[t.bg] }]}>
              <Icon name={icon ?? t.icon} size={30} color={t.fg} />
            </View>
          )}
          <ThemedText style={[styles.title, compact && styles.titleCompact]}>{title}</ThemedText>
          {message ? <ThemedText themeColor="textSecondary" style={styles.message}>{message}</ThemedText> : null}
          {children}
          {actions.length > 0 && (
            <View style={[styles.actions, compact && styles.actionsCompact]}>
              {actions.map((a) => (
                <Button key={a.label} label={a.label} onPress={a.onPress} variant={a.variant ?? 'primary'} busy={a.busy} style={compact ? styles.actionCompact : undefined} />
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
  card: { width: '100%', maxWidth: 420, borderRadius: 24, padding: Spacing.four, gap: Spacing.three, alignItems: 'stretch' },
  iconWrap: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: 700, textAlign: 'center' },
  message: { textAlign: 'center' },
  actions: { gap: Spacing.two, marginTop: Spacing.one },
  cardCompact: { padding: Spacing.three, gap: Spacing.two, maxWidth: 360 },
  titleCompact: { fontSize: 17, lineHeight: 22 },
  actionsCompact: { flexDirection: 'row-reverse', gap: Spacing.two, marginTop: 0 },
  actionCompact: { flex: 1, minHeight: 44, paddingHorizontal: Spacing.two },
});

export const modalRadius = Radius.card;
