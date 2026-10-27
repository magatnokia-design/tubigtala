import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import type { Level } from '@/domain/thresholds';
import { useTheme } from '@/hooks/use-theme';

export const LEVEL_COLORS: Record<Level, { fg: ThemeColor; bg: ThemeColor }> = {
  normal: { fg: 'levelNormal', bg: 'levelNormalBg' },
  warning: { fg: 'levelWarning', bg: 'levelWarningBg' },
  critical: { fg: 'levelCritical', bg: 'levelCriticalBg' },
  unknown: { fg: 'textSecondary', bg: 'backgroundElement' },
};

const LEVEL_ICON = { normal: 'check_circle', warning: 'warning', critical: 'error', unknown: 'help' } as const;

/** The plain-language status of a reading: "Normal", "Too hot", ... in its level colour. */
export function LevelChip({ level, label, compact = false }: { level: Level; label: string; compact?: boolean }) {
  const theme = useTheme();
  const c = LEVEL_COLORS[level];
  return (
    <View style={[styles.chip, compact && styles.compact, { backgroundColor: theme[c.bg] }]}>
      <Icon name={LEVEL_ICON[level]} size={compact ? 14 : 16} color={c.fg} />
      <ThemedText type="smallBold" style={[{ color: theme[c.fg] }, compact && styles.compactText]}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.two + 2, paddingVertical: Spacing.one, borderRadius: Radius.pill, alignSelf: 'flex-start' },
  compact: { paddingHorizontal: Spacing.two, paddingVertical: 2 },
  compactText: { fontSize: 12, lineHeight: 16 },
});
