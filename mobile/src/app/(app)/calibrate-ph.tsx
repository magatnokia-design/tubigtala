import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { LevelChip } from '@/components/level-chip';
import { Notice } from '@/components/notice';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { calibrationError, mvPerPh, phFromMv, stability, STABLE_READINGS, STABLE_WITHIN_MV } from '@/domain/calibration';
import { formatDay } from '@/domain/dates';
import { formatNumber } from '@/domain/format';
import { deviceStatus } from '@/domain/status';
import { useReadingsSince } from '@/hooks/use-devices';
import { useDialog } from '@/hooks/use-dialog';
import { useNow } from '@/hooks/use-now';
import { useOnline } from '@/hooks/use-online';
import { useSelectedDevice } from '@/hooks/use-selected-device';
import { useTheme } from '@/hooks/use-theme';
import { resetCalibration, saveCalibration } from '@/services/devices';

type Step = 'ph7' | 'ph4' | 'review';
const STEPS: { key: Step; label: string }[] = [
  { key: 'ph7', label: 'pH 7' },
  { key: 'ph4', label: 'pH 4' },
  { key: 'review', label: 'Save' },
];
const WINDOW_MS = 30 * 60_000;

/**
 * Two-point pH calibration. The board sends its raw probe voltage (phMv) with every reading;
 * this screen waits for that voltage to settle in each buffer, then saves both voltages to the
 * device record. The board applies them (firmware phFromMv) - nothing is re-flashed.
 */
export default function CalibratePhScreen() {
  const theme = useTheme();
  const now = useNow();
  const online = useOnline();
  const dialog = useDialog();
  const { device } = useSelectedDevice();
  const history = useReadingsSince(device?.id ?? null, WINDOW_MS);
  const [step, setStep] = useState<Step>('ph7');
  // Server time of the newest reading when the step began; only later readings count, so the
  // previous buffer cannot leak in. Both sides use the server clock, never the phone's.
  // null until the first readings load.
  const [stepAfter, setStepAfter] = useState<number | null>(null);
  const [ph7Mv, setPh7Mv] = useState<number | null>(null);
  const [ph4Mv, setPh4Mv] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const readings = useMemo(() => (history.status === 'ready' ? history.data.readings : []), [history]);
  const latest = readings.length ? readings[readings.length - 1] : null;
  const live = latest && device ? deviceStatus(latest.serverTimeMs, device.readingIntervalSec, now) === 'live' : false;
  // First load: remember where step 1 starts (React's "adjust state while rendering" pattern).
  if (stepAfter === null && history.status === 'ready') setStepAfter(latest?.serverTimeMs ?? 0);
  const stepMvs = stepAfter === null ? [] : readings.filter((r) => r.serverTimeMs > stepAfter).map((r) => r.phMv);
  const s = stability(stepMvs);
  const cal = device?.phCalibration;
  const intervalText = device ? `${device.readingIntervalSec >= 60 ? `${Math.round(device.readingIntervalSec / 60)} min` : `${device.readingIntervalSec} s`}` : '';

  function goTo(next: Step) {
    setStep(next);
    setStepAfter(latest?.serverTimeMs ?? 0);
  }

  async function savePoint() {
    if (s.value === null) return;
    if (!s.stable) {
      const ok = await dialog.confirm({
        tone: 'warning',
        title: 'Not settled yet',
        message: `The voltage has not been steady for ${STABLE_READINGS} readings. Save ${s.value} mV anyway?`,
        confirmLabel: 'Save anyway',
      });
      if (!ok) return;
    }
    if (step === 'ph7') {
      setPh7Mv(s.value);
      goTo('ph4');
    } else {
      setPh4Mv(s.value);
      goTo('review');
    }
  }

  async function save() {
    if (!device || ph7Mv === null || ph4Mv === null) return;
    setBusy(true);
    try {
      await saveCalibration(device.id, ph7Mv, ph4Mv);
      await dialog.notify({ tone: 'success', title: 'pH calibrated', message: 'The device applies it within about 10 minutes.' });
      router.back();
    } catch {
      await dialog.notify({ tone: 'danger', title: 'Could not save', message: 'Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!device) return;
    const ok = await dialog.confirm({ tone: 'warning', title: 'Remove calibration?', message: 'pH will use default values and be marked uncalibrated.', confirmLabel: 'Remove' });
    if (!ok) return;
    await resetCalibration(device.id).catch(() => dialog.notify({ tone: 'danger', title: 'Could not reset', message: 'Try again.' }));
  }

  if (!device) {
    return <View style={styles.pad}><Notice tone="warning">No device connected. Calibration needs a device sending readings.</Notice></View>;
  }

  const stepIndex = STEPS.findIndex((x) => x.key === step);
  const reviewError = ph7Mv !== null && ph4Mv !== null ? calibrationError(ph7Mv, ph4Mv) : undefined;

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <View style={styles.progress}>
        {STEPS.map((x, i) => (
          <View key={x.key} style={styles.progressItem}>
            <View style={[styles.progressBar, { backgroundColor: i <= stepIndex ? theme.tint : theme.border }]} />
            <ThemedText type="small" style={{ color: i <= stepIndex ? theme.tint : theme.textSecondary, fontWeight: i === stepIndex ? 700 : 500 }}>{x.label}</ThemedText>
          </View>
        ))}
      </View>

      <View style={[styles.current, { backgroundColor: theme.backgroundElement }]}>
        <Icon name="water_ph" />
        <ThemedText type="small" style={styles.flex}>
          {cal?.status === 'calibrated' && cal.calibratedAtMs ? `Calibrated ${formatDay(cal.calibratedAtMs)}` : 'Not calibrated yet'}
        </ThemedText>
        {cal?.status === 'calibrated' && step === 'ph7' && <Button label="Remove" variant="text" onPress={reset} />}
      </View>

      {!online && <Notice tone="warning">You are offline. Calibration needs a connection.</Notice>}
      {online && !live && <Notice tone="warning">{`${device.name} is not sending readings right now. Connect it first.`}</Notice>}

      {step !== 'review' ? (
        <>
          <View style={[styles.card, { borderColor: theme.border }]}>
            <ThemedText style={styles.title}>{step === 'ph7' ? 'Put the probe in pH 7.00 buffer' : 'Rinse, then pH 4.00 buffer'}</ThemedText>
            <ThemedText themeColor="textSecondary">
              {step === 'ph7'
                ? 'Rinse the probe with clean water, place it in the pH 7 solution and keep it still.'
                : 'Rinse the probe again, place it in the pH 4 solution and keep it still.'}
            </ThemedText>

            <View style={styles.readout}>
              <ThemedText style={styles.mv}>{s.value === null ? '—' : s.value.toLocaleString()}</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.mvUnit}>mV</ThemedText>
            </View>
            <LevelChip
              level={s.value === null ? 'unknown' : s.stable ? 'normal' : 'warning'}
              label={s.value === null ? 'Waiting for readings' : s.stable ? 'Stable' : 'Settling…'}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {`New reading every ${intervalText}. Stable = ${STABLE_READINGS} readings within ${STABLE_WITHIN_MV} mV.`}
            </ThemedText>
          </View>

          <Button
            label={step === 'ph7' ? 'Save pH 7 point' : 'Save pH 4 point'}
            icon="check_circle"
            onPress={savePoint}
            disabled={s.value === null || !live || !online}
          />
          {step === 'ph4' && <Button label="Back to pH 7" variant="text" onPress={() => goTo('ph7')} />}
        </>
      ) : (
        <>
          <View style={[styles.card, { borderColor: theme.border }]}>
            <ThemedText style={styles.title}>Review</ThemedText>
            <Row label="pH 7 buffer" value={`${ph7Mv?.toLocaleString()} mV`} />
            <Row label="pH 4 buffer" value={`${ph4Mv?.toLocaleString()} mV`} />
            {ph7Mv !== null && ph4Mv !== null && !reviewError && (
              <>
                <Row label="Sensitivity" value={`${formatNumber(mvPerPh(ph7Mv, ph4Mv), 0)} mV per pH`} />
                {latest?.phMv != null && (
                  <Row label="Probe now reads" value={`pH ${formatNumber(phFromMv(latest.phMv, ph7Mv, ph4Mv), 2)}`} />
                )}
              </>
            )}
          </View>
          {reviewError && <Notice tone="warning">{reviewError}</Notice>}
          <Button label="Save calibration" icon="check_circle" onPress={save} busy={busy} disabled={!!reviewError || !online} />
          <Button label="Start over" variant="text" onPress={() => { setPh7Mv(null); setPh4Mv(null); goTo('ph7'); }} />
        </>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText themeColor="textSecondary">{label}</ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { padding: Spacing.four },
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  progress: { flexDirection: 'row', gap: Spacing.two },
  progressItem: { flex: 1, gap: Spacing.one },
  progressBar: { height: 4, borderRadius: 2 },
  current: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: Radius.small, minHeight: 44 },
  card: { borderWidth: 1, borderRadius: Radius.card, padding: Spacing.four, gap: Spacing.two },
  title: { fontSize: 20, lineHeight: 26, fontWeight: 700 },
  readout: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two, marginTop: Spacing.two },
  mv: { fontSize: 48, lineHeight: 54, fontWeight: 700 },
  mvUnit: { fontSize: 18 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.one },
});
