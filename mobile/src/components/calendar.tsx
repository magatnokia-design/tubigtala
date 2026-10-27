import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppModal } from '@/components/app-modal';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { addDays, formatRange, MAX_RANGE_DAYS, monthGrid, startOfDay, tapDay, type DayRange } from '@/domain/dates';
import { useTheme } from '@/hooks/use-theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * TubigTala's own date picker. Tap a day for one day, then a later day for a range
 * (up to MAX_RANGE_DAYS). Future days are disabled - there are no readings there yet.
 */
export function CalendarModal({ visible, initial, onApply, onClose }: {
  visible: boolean;
  initial: DayRange;
  onApply: (range: DayRange) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [today] = useState(() => startOfDay(Date.now())); // fixed while the calendar is open
  const [range, setRange] = useState<DayRange>(initial);
  const [picking, setPicking] = useState<'start' | 'end'>('start');
  const [month, setMonth] = useState(() => ({ y: new Date(initial.end).getFullYear(), m: new Date(initial.end).getMonth() }));

  const shift = (n: number) => setMonth(({ y, m }) => {
    const d = new Date(y, m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const nextDisabled = new Date(month.y, month.m + 1, 1).getTime() > today;
  const title = new Date(month.y, month.m, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });

  function pick(day: number) {
    const next = tapDay(range, day, picking);
    setRange(next.range);
    setPicking(next.picking);
  }

  function preset(days: number) {
    setRange({ start: addDays(today, -(days - 1)), end: today });
    setPicking('start');
    setMonth({ y: new Date(today).getFullYear(), m: new Date(today).getMonth() });
  }

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      compact
      title={formatRange(range)}
      actions={[
        { label: 'Apply', onPress: () => onApply(range) },
        { label: 'Cancel', onPress: onClose, variant: 'text' },
      ]}>
      <View style={styles.presets}>
        {[{ label: 'Today', days: 1 }, { label: 'Last 3 days', days: 3 }, { label: `Last ${MAX_RANGE_DAYS} days`, days: MAX_RANGE_DAYS }].map((p) => (
          <Pressable key={p.label} onPress={() => preset(p.days)} style={[styles.preset, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold" style={[styles.presetText, { color: theme.tint }]}>{p.label}</ThemedText>
          </Pressable>
        ))}
      </View>

      <View style={styles.monthRow}>
        <Pressable onPress={() => shift(-1)} hitSlop={8} accessibilityLabel="Previous month" style={styles.nav}>
          <Icon name="chevron_left" />
        </Pressable>
        <ThemedText type="smallBold" style={styles.monthTitle}>{title}</ThemedText>
        <Pressable onPress={() => !nextDisabled && shift(1)} hitSlop={8} accessibilityLabel="Next month" style={[styles.nav, nextDisabled && styles.disabled]}>
          <Icon name="chevron_right" />
        </Pressable>
      </View>

      <View style={styles.week}>
        {WEEKDAYS.map((d, i) => (
          <ThemedText key={i} type="small" themeColor="textSecondary" style={styles.weekday}>{d}</ThemedText>
        ))}
      </View>

      {monthGrid(month.y, month.m).map((row, r) => (
        <View key={r} style={styles.week}>
          {row.map((day, c) => {
            if (day === null) return <View key={c} style={styles.cell} />;
            const future = day > today;
            const inRange = day >= range.start && day <= range.end;
            const edge = day === range.start || day === range.end;
            return (
              <Pressable
                key={c}
                disabled={future}
                onPress={() => pick(day)}
                accessibilityLabel={new Date(day).toDateString()}
                accessibilityState={{ selected: inRange, disabled: future }}
                style={[styles.cell, inRange && !edge && { backgroundColor: theme.backgroundSelected }]}>
                <View style={[styles.dayDot, edge && { backgroundColor: theme.tint }, day === today && !edge && { borderWidth: 1.5, borderColor: theme.tint }]}>
                  <ThemedText
                    type="small"
                    style={[styles.dayText, { color: edge ? theme.onTint : future ? theme.border : theme.text }, edge && styles.dayTextBold]}>
                    {new Date(day).getDate()}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        {picking === 'end' ? 'Tap an end date, or Apply for one day' : `Up to ${MAX_RANGE_DAYS} days`}
      </ThemedText>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  presets: { flexDirection: 'row', gap: Spacing.two },
  preset: { flex: 1, alignItems: 'center', paddingVertical: Spacing.one + 2, borderRadius: Radius.pill },
  presetText: { fontSize: 12, lineHeight: 16 },
  monthRow: { flexDirection: 'row', alignItems: 'center' },
  nav: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.3 },
  monthTitle: { flex: 1, textAlign: 'center', fontSize: 15 },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12 },
  cell: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center' },
  dayDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 13, lineHeight: 18 },
  dayTextBold: { fontWeight: 700 },
  hint: { textAlign: 'center', fontSize: 12 },
});
