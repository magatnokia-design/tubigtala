import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppModal } from '@/components/app-modal';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import {
  DATA_START_DAY, formatRange, isSelectableDay, lastPickableEnd, MAX_RANGE_DAYS, monthGrid, pickModeOf, startOfDay,
  type DayRange, type PickMode,
} from '@/domain/dates';
import { useTheme } from '@/hooks/use-theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MODES: { key: PickMode; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'day', label: 'One day' },
  { key: 'range', label: 'Date range' },
];

/**
 * TubigTala's own date picker, shared by Analytics (By date) and Export. Three ways to pick:
 * today, one day, or a range of up to MAX_RANGE_DAYS. Only DATA_START_DAY (1 Nov 2026) to today
 * can be chosen - there are no readings before or after.
 */
export function CalendarModal({ visible, initial, onApply, onClose }: {
  visible: boolean;
  initial: DayRange;
  onApply: (range: DayRange) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [today] = useState(() => startOfDay(Date.now())); // fixed while the calendar is open
  const [mode, setMode] = useState<PickMode>(() => pickModeOf(initial, today));
  const [range, setRange] = useState<DayRange>(initial);
  // Range mode: after the first tap we wait for the end day.
  const [awaitingEnd, setAwaitingEnd] = useState(false);
  const [month, setMonth] = useState(() => ({ y: new Date(initial.end).getFullYear(), m: new Date(initial.end).getMonth() }));

  const monthStart = new Date(month.y, month.m, 1).getTime();
  const prevDisabled = monthStart <= DATA_START_DAY;
  const nextDisabled = new Date(month.y, month.m + 1, 1).getTime() > today;
  const title = new Date(monthStart).toLocaleDateString([], { month: 'long', year: 'numeric' });
  const endLimit = awaitingEnd ? lastPickableEnd(range.start, today) : today;

  const shift = (n: number) => setMonth(({ y, m }) => {
    const d = new Date(y, m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  function chooseMode(next: PickMode) {
    setMode(next);
    setAwaitingEnd(false);
    if (next === 'today') {
      setRange({ start: today, end: today });
      setMonth({ y: new Date(today).getFullYear(), m: new Date(today).getMonth() });
    } else if (next === 'day') {
      setRange({ start: range.end, end: range.end });
    }
  }

  function tap(day: number) {
    if (mode !== 'range') {
      setMode(day === today ? 'today' : 'day');
      setRange({ start: day, end: day });
      return;
    }
    if (!awaitingEnd || day < range.start) {
      setRange({ start: day, end: day });
      setAwaitingEnd(true);
    } else {
      setRange({ start: range.start, end: day });
      setAwaitingEnd(false);
    }
  }

  const hint = mode === 'today'
    ? 'Readings from midnight until now.'
    : mode === 'day'
      ? 'Tap a day.'
      : awaitingEnd
        ? `Now tap the last day (up to ${MAX_RANGE_DAYS} days).`
        : `Tap the first day, then the last (up to ${MAX_RANGE_DAYS} days).`;

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
      <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
        {MODES.map((m) => {
          const selected = mode === m.key;
          return (
            <Pressable
              key={m.key}
              onPress={() => chooseMode(m.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.segmentItem, selected && { backgroundColor: theme.tint }]}>
              <ThemedText type="smallBold" style={[styles.segmentText, { color: selected ? theme.onTint : theme.text }]}>{m.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.monthRow}>
        <Pressable onPress={() => !prevDisabled && shift(-1)} hitSlop={8} accessibilityLabel="Previous month" style={[styles.nav, prevDisabled && styles.disabled]}>
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
            const enabled = isSelectableDay(day, today) && (!awaitingEnd || day <= endLimit);
            const inRange = day >= range.start && day <= range.end;
            const isStart = day === range.start;
            const isEnd = day === range.end;
            const edge = isStart || isEnd;
            const band = inRange && range.start !== range.end;
            return (
              <Pressable
                key={c}
                disabled={!enabled}
                onPress={() => tap(day)}
                accessibilityLabel={new Date(day).toDateString()}
                accessibilityState={{ selected: inRange, disabled: !enabled }}
                style={styles.cell}>
                {/* The range band runs behind the days and is rounded at its two ends. */}
                {band && (
                  <View
                    style={[
                      styles.band,
                      { backgroundColor: theme.backgroundSelected },
                      isStart && styles.bandStart,
                      isEnd && styles.bandEnd,
                    ]}
                  />
                )}
                <View style={[styles.dayDot, edge && { backgroundColor: theme.tint }, day === today && !edge && { borderWidth: 1.5, borderColor: theme.tint }]}>
                  <ThemedText
                    type="small"
                    style={[styles.dayText, { color: edge ? theme.onTint : enabled ? theme.text : theme.border }, (edge || day === today) && styles.dayTextBold]}>
                    {new Date(day).getDate()}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>{hint}</ThemedText>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', borderRadius: Radius.pill, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.one + 2, borderRadius: Radius.pill },
  segmentText: { fontSize: 13, lineHeight: 18 },
  monthRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.one },
  nav: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.25 },
  monthTitle: { flex: 1, textAlign: 'center', fontSize: 15 },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, paddingBottom: 2 },
  cell: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center' },
  band: { position: 'absolute', left: 0, right: 0, top: 4, bottom: 4 },
  bandStart: { left: '50%' },
  bandEnd: { right: '50%' },
  dayDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 13, lineHeight: 18 },
  dayTextBold: { fontWeight: 700 },
  hint: { textAlign: 'center', fontSize: 12 },
});
