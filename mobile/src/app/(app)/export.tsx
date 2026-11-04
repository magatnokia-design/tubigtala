import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { AndroidSymbol } from 'expo-symbols';
import { router } from 'expo-router';

import { Button } from '@/components/button';
import { CalendarModal } from '@/components/calendar';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { formatRange, MAX_RANGE_DAYS, startOfDay, type DayRange } from '@/domain/dates';
import { METRIC_INFO, type Metric } from '@/domain/thresholds';
import { useAuth } from '@/hooks/use-auth';
import { useDialog } from '@/hooks/use-dialog';
import { useOnline } from '@/hooks/use-online';
import { useSelectedDevice } from '@/hooks/use-selected-device';
import { useTheme } from '@/hooks/use-theme';
import { exportToExcel } from '@/services/export';

const FIELDS: { metric: Metric; icon: AndroidSymbol }[] = [
  { metric: 'ph', icon: 'water_ph' },
  { metric: 'temperatureC', icon: 'device_thermostat' },
  { metric: 'nh3GasMv', icon: 'air' },
];

export default function ExportScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { device } = useSelectedDevice();
  const online = useOnline();
  const dialog = useDialog();
  const [selected, setSelected] = useState<Metric[]>(['ph', 'temperatureC', 'nh3GasMv']);
  const [range, setRange] = useState<DayRange>(() => ({ start: startOfDay(Date.now()), end: startOfDay(Date.now()) }));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggle = (m: Metric) => setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  async function run() {
    if (!user || !device || !selected.length) return;
    setBusy(true);
    try {
      const r = await exportToExcel(user.uid, device, range, selected);
      await dialog.notify({
        tone: 'success',
        title: 'Excel file ready',
        message: `${r.readingCount.toLocaleString()} readings and ${r.alertCount} alerts${r.truncated ? ' (latest readings only)' : ''}.`,
      });
      router.back();
    } catch (e) {
      await dialog.notify({ tone: 'danger', title: 'Export failed', message: e instanceof Error ? e.message : 'Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <View style={[styles.deviceRow, { backgroundColor: theme.backgroundElement }]}>
        <Icon name="sensors" />
        <ThemedText type="smallBold" style={styles.flex} numberOfLines={1}>{device?.name ?? 'No device connected'}</ThemedText>
        <Icon name="table_view" color="textSecondary" />
      </View>

      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>FIELDS</ThemedText>
      <View style={[styles.group, { borderColor: theme.border }]}>
        {FIELDS.map(({ metric, icon }) => {
          const on = selected.includes(metric);
          return (
            <Pressable
              key={metric}
              onPress={() => toggle(metric)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundElement }]}>
              <Icon name={icon} />
              <ThemedText style={styles.flex}>{METRIC_INFO[metric].name}</ThemedText>
              <Icon name={on ? 'check_box' : 'check_box_outline_blank'} color={on ? 'tint' : 'textSecondary'} />
            </Pressable>
          );
        })}
      </View>

      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>DATES</ThemedText>
      <Pressable
        onPress={() => setCalendarOpen(true)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.group, styles.row, { borderColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
        <Icon name="calendar_month" />
        <ThemedText style={styles.flex}>{formatRange(range)}</ThemedText>
        <Icon name="chevron_right" color="textSecondary" />
      </Pressable>
      <ThemedText type="small" themeColor="textSecondary">{`Up to ${MAX_RANGE_DAYS} days per file`}</ThemedText>

      <View style={styles.spacer} />
      <Button
        label={online ? 'Export to Excel' : 'Connect to export'}
        icon="download"
        onPress={run}
        busy={busy}
        disabled={!device || !selected.length || !online}
      />

      {calendarOpen && (
        <CalendarModal visible initial={range} onClose={() => setCalendarOpen(false)} onApply={(r) => { setRange(r); setCalendarOpen(false); }} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.two, flexGrow: 1 },
  flex: { flex: 1 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.card },
  section: { letterSpacing: 1, fontSize: 12, marginTop: Spacing.three },
  group: { borderWidth: 1, borderRadius: Radius.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, minHeight: 54 },
  spacer: { flexGrow: 1, minHeight: Spacing.four },
});
