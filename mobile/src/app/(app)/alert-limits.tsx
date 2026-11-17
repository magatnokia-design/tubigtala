import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { LevelChip } from '@/components/level-chip';
import { Notice } from '@/components/notice';
import { Pulse } from '@/components/pulse';
import { ScaleBar } from '@/components/scale-bar';
import { ThemedText } from '@/components/themed-text';
import { METRIC_ICON } from '@/constants/metric-icons';
import { Radius, Spacing } from '@/constants/theme';
import { formatNumber } from '@/domain/format';
import {
  HIGH_SIDE_ONLY, LIMIT_FIELDS, LIMIT_METRICS, limitFieldError, limitsOf, limitTexts, rangeFromTexts, sameRange,
  type LimitField, type Limits, type LimitTexts,
} from '@/domain/limits';
import { deviceStatus } from '@/domain/status';
import { classify, METRIC_INFO, normalRangeText, RANGES, type Metric, type Range } from '@/domain/thresholds';
import { gasWarmupLeftNowMs, warmingUp, warmupMinutesLeft } from '@/domain/warmup';
import { useLatestReading } from '@/hooks/use-devices';
import { useDialog } from '@/hooks/use-dialog';
import { useForm } from '@/hooks/use-form';
import { useNow } from '@/hooks/use-now';
import { useOnline } from '@/hooks/use-online';
import { useSelectedDevice } from '@/hooks/use-selected-device';
import { useTheme } from '@/hooks/use-theme';
import { saveLimits } from '@/services/devices';

// One form field per sensor and limit, e.g. "ph.normalMin".
type Field = `${Metric}.${LimitField}`;
const FIELDS = LIMIT_METRICS.flatMap((m) => LIMIT_FIELDS.map((f): Field => `${m}.${f}`));

const textsOf = (values: Record<Field, string>, m: Metric): LimitTexts =>
  Object.fromEntries(LIMIT_FIELDS.map((f) => [f, values[`${m}.${f}`]])) as LimitTexts;

const formValues = (limits: Limits): Record<Field, string> =>
  Object.fromEntries(LIMIT_METRICS.flatMap((m) => {
    const t = limitTexts(m, limits[m]);
    return LIMIT_FIELDS.map((f) => [`${m}.${f}`, t[f]]);
  })) as Record<Field, string>;

const DEFAULT_VALUES = formValues(RANGES);

// Module-level, so the form hook gets the same validators on every render.
const VALIDATORS = Object.fromEntries(FIELDS.map((field) => {
  const [m, f] = field.split('.') as [Metric, LimitField];
  return [field, (_: string, all: Record<Field, string>) => limitFieldError(m, f, textsOf(all, m))];
})) as Record<Field, (value: string, all: Record<Field, string>) => string | undefined>;

/** "normal 6.5 to 8.5, critical below 6.0 or above 9.0" / "normal up to 1700 mV, critical above 2200 mV" */
function limitsSentence(m: Metric, r: Range): string {
  const { unit, decimals } = METRIC_INFO[m];
  const n = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
  const critical = HIGH_SIDE_ONLY[m] ? `above ${n(r.warning[1])}` : `below ${n(r.warning[0])} or above ${n(r.warning[1])}`;
  return `normal ${normalRangeText(m, r)}, critical ${critical}`;
}

/**
 * Settings > Alert limits: when the station's readings count as normal, warning or critical, per
 * sensor. Saved on the station (devices/{id}.limits, domain/limits.ts); the server raises alerts
 * with them from the next reading, and every screen colours readings with them.
 */
export default function AlertLimitsScreen() {
  const theme = useTheme();
  const online = useOnline();
  const dialog = useDialog();
  const { device } = useSelectedDevice();
  const latest = useLatestReading(device?.id ?? null);
  const now = useNow();
  const saved = limitsOf(device);
  const savedValues = useMemo(() => formValues(saved), [saved]);
  const form = useForm<Field>(savedValues, VALIDATORS);
  const [busy, setBusy] = useState(false);
  // The saved limits can change while this screen is open: the live station record replacing a
  // cached one from an older app version (which has no limits), or another phone saving. Follow
  // them until the user starts editing, so Save never writes back limits they did not see.
  // (React's "adjust state while rendering" pattern, compared by value.)
  const [base, setBase] = useState(savedValues);
  if (FIELDS.some((f) => base[f] !== savedValues[f])) {
    setBase(savedValues);
    if (FIELDS.every((f) => form.values[f] === base[f])) form.reset(savedValues);
  }

  const reading = latest.status === 'ready' ? latest.data : null;
  // Same warm-up rule as the Water tab and the server (domain/warmup.ts): while the gas sensor warms
  // up after a power-on its value is not judged, so this screen must not call it "Too high" either.
  const live = reading !== null && device !== null && deviceStatus(reading.serverTimeMs, device.readingIntervalSec, now) === 'live';
  const warmupMin = (m: Metric): number | null => (live && reading && device && warmingUp(m, reading, device.readingIntervalSec)
    ? warmupMinutesLeft(gasWarmupLeftNowMs(reading, device.readingIntervalSec, now))
    : null);
  const changed = FIELDS.some((f) => form.values[f].trim() !== savedValues[f]);
  const atDefaults = FIELDS.every((f) => form.values[f].trim() === DEFAULT_VALUES[f]);

  if (!device) {
    return <View style={styles.pad}><Notice tone="warning">No station connected. Add a station first.</Notice></View>;
  }
  const deviceId = device.id;
  const stationName = device.name;

  async function save() {
    if (!form.validateAll()) return;
    const next = Object.fromEntries(LIMIT_METRICS.map((m) => [m, rangeFromTexts(m, textsOf(form.values, m))])) as Record<Metric, Range | null>;
    if (LIMIT_METRICS.some((m) => next[m] === null)) return; // cannot happen after validateAll; never save a partial set
    setBusy(true);
    try {
      await saveLimits(deviceId, next as Limits);
      await dialog.notify({ tone: 'success', title: 'Alert limits saved', message: `${stationName} uses them from its next reading.` });
      router.back();
    } catch {
      await dialog.notify({ tone: 'danger', title: 'Could not save', message: 'Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function resetToDefaults() {
    const ok = await dialog.confirm({
      title: 'Use the default limits?',
      message: 'The form is filled with the default limits. Press Save to use them.',
      confirmLabel: 'Fill in defaults',
    });
    if (ok) form.reset(DEFAULT_VALUES);
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ThemedText themeColor="textSecondary">
        {`Choose when ${stationName} warns you. Changes apply from its next reading, and past readings are coloured with the new limits too.`}
      </ThemedText>

      <View style={[styles.legend, { backgroundColor: theme.backgroundElement }]}>
        <Legend color={theme.levelNormal} text="Normal: no alert" />
        <Legend color={theme.levelWarning} text="Outside normal: phone notification" />
        <Legend color={theme.levelCritical} text="Critical: phone notification, and an SMS after 3 readings in a row (temperature, and pH once calibrated)" />
      </View>

      {!online && <Notice tone="warning">You are offline. Saving needs a connection.</Notice>}

      {LIMIT_METRICS.map((m) => {
        const texts = textsOf(form.values, m);
        const range = rangeFromTexts(m, texts);
        const value = reading ? reading[m] : null;
        return (
          <SensorCard
            key={m}
            metric={m}
            range={range}
            fallback={saved[m]}
            value={value}
            warmupMin={warmupMin(m)}
            input={(f, label, prefix) => (
              <LimitInput
                prefix={prefix}
                unit={METRIC_INFO[m].unit}
                value={form.values[`${m}.${f}`]}
                onChangeText={form.set(`${m}.${f}`)}
                onBlur={form.blur(`${m}.${f}`)}
                error={form.errors[`${m}.${f}`]}
                accessibilityLabel={`${METRIC_INFO[m].name}, ${label}`}
              />
            )}
          />
        );
      })}

      <Button label="Save" icon="check_circle" onPress={save} busy={busy} disabled={!changed || !online} />
      {!atDefaults && <Button label="Reset to defaults" variant="text" onPress={resetToDefaults} />}
    </ScrollView>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText type="small" style={styles.flex}>{text}</ThemedText>
    </View>
  );
}

/**
 * One sensor: a bar showing its bands with the newest reading, the limits as inputs, and what the
 * newest reading would be with them. `range` is null while the inputs have an error; the bar
 * then keeps showing `fallback` (the saved limits). `warmupMin`: minutes left in the gas sensor's
 * warm-up after a power-on (null when not warming up); the reading is then not judged.
 */
function SensorCard({ metric, range, fallback, value, warmupMin, input }: {
  metric: Metric;
  range: Range | null;
  fallback: Range;
  value: number | null;
  warmupMin: number | null;
  input: (field: LimitField, label: string, prefix?: string) => ReactNode;
}) {
  const theme = useTheme();
  const info = METRIC_INFO[metric];
  const r = range ?? fallback;
  const gas = HIGH_SIDE_ONLY[metric];
  const scale = scaleFor(metric, r);
  const segments = gas
    ? [
        { until: r.normal[1], color: theme.levelNormal },
        { until: r.warning[1], color: theme.levelWarning },
        { until: scale.max, color: theme.levelCritical },
      ]
    : [
        { until: r.warning[0], color: theme.levelCritical },
        { until: r.normal[0], color: theme.levelWarning },
        { until: r.normal[1], color: theme.levelNormal },
        { until: r.warning[1], color: theme.levelWarning },
        { until: scale.max, color: theme.levelCritical },
      ];
  const status = value === null ? null : classify(metric, value, r);
  const isDefault = range !== null && sameRange(range, RANGES[metric]);

  return (
    <View style={[styles.card, { borderColor: theme.border }]}>
      <View style={styles.cardTop}>
        <Icon name={METRIC_ICON[metric]} size={20} />
        <ThemedText type="smallBold" style={styles.cardTitle}>{info.name}</ThemedText>
        {warmupMin !== null
          ? <Pulse><LevelChip level="unknown" label="Warming up" compact /></Pulse>
          : status && <LevelChip level={status.level} label={status.label} compact />}
      </View>

      <ScaleBar value={value} min={scale.min} max={scale.max} segments={segments} labels={scale.labels} />
      {warmupMin !== null ? (
        <ThemedText type="small" themeColor="textSecondary">
          {`${value === null ? 'No value yet' : `Newest reading ${formatNumber(value, info.decimals)}${info.unit ? ` ${info.unit}` : ''}`} · the sensor is warming up after power-on, so it is not checked for about ${warmupMin} more min`}
        </ThemedText>
      ) : value !== null && (
        <ThemedText type="small" themeColor="textSecondary">
          {`Newest reading ${formatNumber(value, info.decimals)}${info.unit ? ` ${info.unit}` : ''}, checked with the limits below`}
        </ThemedText>
      )}

      <ThemedText type="smallBold" style={styles.rowLabel}>Normal</ThemedText>
      {gas ? (
        <View style={styles.inputs}>{input('normalMax', 'Normal up to', 'up to')}</View>
      ) : (
        <View style={styles.inputs}>
          {input('normalMin', 'Normal from')}
          <ThemedText themeColor="textSecondary" style={styles.joiner}>to</ThemedText>
          {input('normalMax', 'Normal to')}
        </View>
      )}

      <ThemedText type="smallBold" style={styles.rowLabel}>Critical</ThemedText>
      {gas ? (
        <View style={styles.inputs}>{input('criticalAbove', 'Critical above', 'above')}</View>
      ) : (
        <View style={styles.inputs}>
          {input('criticalBelow', 'Critical below', 'below')}
          <ThemedText themeColor="textSecondary" style={styles.joiner}>or</ThemedText>
          {input('criticalAbove', 'Critical above', 'above')}
        </View>
      )}

      {!isDefault && (
        <ThemedText type="small" themeColor="textSecondary">{`Default: ${limitsSentence(metric, RANGES[metric])}`}</ThemedText>
      )}
      {metric === 'nh3GasMv' && (
        <ThemedText type="small" themeColor="textSecondary">Gas in the air above the water, relative mV (not ppm). Never sent by SMS.</ThemedText>
      )}
    </View>
  );
}

/** The bar's span: the sensor's usual scale, widened when a limit is set beyond it. */
function scaleFor(metric: Metric, r: Range): { min: number; max: number; labels: string[] } {
  if (metric === 'ph') return { min: 0, max: 14, labels: ['0', '7', '14'] };
  if (metric === 'temperatureC') {
    const min = Math.min(0, Math.floor((r.warning[0] - 5) / 10) * 10);
    const max = Math.max(40, Math.ceil((r.warning[1] + 5) / 20) * 20);
    return { min, max, labels: [`${min} °C`, `${max} °C`] };
  }
  const max = Math.max(3000, Math.ceil((r.warning[1] + 500) / 1000) * 1000);
  return { min: 0, max, labels: ['0 mV', `${max} mV`] };
}

function LimitInput({ prefix, unit, value, onChangeText, onBlur, error, accessibilityLabel }: {
  prefix?: string;
  unit: string;
  value: string;
  onChangeText: (t: string) => void;
  onBlur: () => void;
  error?: string;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? theme.offline : focused ? theme.tint : theme.border;
  return (
    <View style={styles.inputCol}>
      <View style={[styles.inputBox, { borderColor, backgroundColor: focused ? theme.background : theme.backgroundElement }]}>
        {prefix && <ThemedText type="small" themeColor="textSecondary">{prefix}</ThemedText>}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); onBlur(); }}
          keyboardType="numeric"
          selectTextOnFocus
          maxLength={7}
          placeholder="—"
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel={accessibilityLabel}
          style={[styles.input, { color: theme.text }]}
        />
        {unit ? <ThemedText type="small" themeColor="textSecondary">{unit}</ThemedText> : null}
      </View>
      {error && (
        <View style={styles.message}>
          <Icon name="error" size={14} color="offline" />
          <ThemedText type="small" style={[styles.flex, { color: theme.offline }]}>{error}</ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: Spacing.four },
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  legend: { borderRadius: Radius.small, padding: Spacing.three, gap: Spacing.two },
  legendRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  card: { borderWidth: 1, borderRadius: Radius.card, padding: Spacing.three, gap: Spacing.two },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardTitle: { flex: 1, fontSize: 16, lineHeight: 22 },
  rowLabel: { marginTop: Spacing.one },
  inputs: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  joiner: { height: 44, lineHeight: 44 },
  inputCol: { flex: 1, gap: 2 },
  inputBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.one,
    borderWidth: 1.5, borderRadius: Radius.small, paddingHorizontal: Spacing.two + 2, minHeight: 44,
  },
  input: { flex: 1, paddingVertical: Spacing.one, fontSize: 16 },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.one },
});
