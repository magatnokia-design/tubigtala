import { useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, Stack } from 'expo-router';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Notice } from '@/components/notice';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import {
  normalizeCode, pairingCodeError, parsePairingPayload, STATION_NAME, stationIdError, type PairingInfo,
} from '@/domain/pairing';
import { useAuth } from '@/hooks/use-auth';
import { useDialog } from '@/hooks/use-dialog';
import { useForm } from '@/hooks/use-form';
import { useOnline } from '@/hooks/use-online';
import { useTheme } from '@/hooks/use-theme';
import { pairDevice } from '@/services/devices';

type Mode = 'scan' | 'type';

/**
 * Adds a TubigTala Station to this account: scan the QR sticker on the station, or type the ID
 * and code printed under it. The rules accept the code only for a station with no owner yet.
 */
export default function PairDeviceScreen() {
  const theme = useTheme();
  const dialog = useDialog();
  const online = useOnline();
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('scan');
  const [busy, setBusy] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  // The camera reports the same QR many times a second; handle one at a time.
  const handling = useRef(false);
  const form = useForm({ id: '', code: '' }, { id: stationIdError, code: pairingCodeError });

  async function pair(info: PairingInfo) {
    if (!user) return;
    setBusy(true);
    try {
      await pairDevice(user.uid, info);
      await dialog.notify({
        tone: 'success',
        title: `${STATION_NAME} added`,
        message: 'Readings show on the Water tab once the station is powered on and connected to Wi-Fi.',
      });
      router.back();
    } catch (e) {
      const denied = (e as { code?: string }).code === 'permission-denied';
      await dialog.notify({
        tone: 'danger',
        title: 'Could not add the station',
        message: denied
          ? 'The code does not match, or this station is already paired to another account. Check the sticker, or ask the current owner to remove it first.'
          : 'Check your connection and try again.',
      });
      setBusy(false);
      handling.current = false;
    }
  }

  function onScanned({ data }: BarcodeScanningResult) {
    if (handling.current || busy) return;
    const info = parsePairingPayload(data);
    if (!info) {
      setScanMessage('That QR code is not a TubigTala Station code. Scan the sticker on the station.');
      return;
    }
    handling.current = true;
    setScanMessage(null);
    void pair(info);
  }

  function submitTyped() {
    if (!form.validateAll()) return;
    void pair({ deviceId: form.values.id.trim(), code: normalizeCode(form.values.code) });
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `Add ${STATION_NAME}` }} />

      <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
        {(['scan', 'type'] as const).map((m) => {
          const selected = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.segmentItem, selected && { backgroundColor: theme.tint }]}>
              <Icon name={m === 'scan' ? 'qr_code_scanner' : 'keyboard'} size={18} color={selected ? 'onTint' : 'text'} />
              <ThemedText type="smallBold" style={{ color: selected ? theme.onTint : theme.text }}>{m === 'scan' ? 'Scan QR code' : 'Type the code'}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      {!online && <Notice tone="warning">You are offline. Adding a station needs a connection.</Notice>}

      {mode === 'scan' ? (
        <>
          <ThemedText themeColor="textSecondary">Point the camera at the QR sticker on your {STATION_NAME}.</ThemedText>
          {!permission ? null : permission.granted ? (
            <View style={[styles.cameraBox, { borderColor: theme.border }]}>
              {online && !busy ? (
                <CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScanned} />
              ) : (
                <View style={[styles.camera, styles.center, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText themeColor="textSecondary">{busy ? 'Adding the station…' : 'Connect to the internet to scan.'}</ThemedText>
                </View>
              )}
            </View>
          ) : permission.canAskAgain ? (
            <Button label="Allow camera" icon="photo_camera" onPress={requestPermission} />
          ) : (
            <>
              <Notice tone="warning">Camera access is off for TubigTala. Turn it on in Android settings, or type the code instead.</Notice>
              <Button label="Open Android settings" icon="settings" variant="outline" onPress={() => Linking.openSettings()} />
            </>
          )}
          {scanMessage && <Notice tone="warning">{scanMessage}</Notice>}
        </>
      ) : (
        <>
          <ThemedText themeColor="textSecondary">Type the ID and pairing code printed under the QR code.</ThemedText>
          <TextField
            label="Station ID" icon="sensors" placeholder="tank-01"
            value={form.values.id} onChangeText={form.set('id')} onBlur={form.blur('id')} error={form.errors.id}
            autoCapitalize="none" autoCorrect={false} editable={!busy} returnKeyType="next"
          />
          <TextField
            label="Pairing code" icon="key" placeholder="ABCD-EFGH-JKMN"
            value={form.values.code} onChangeText={form.set('code')} onBlur={form.blur('code')} error={form.errors.code}
            autoCapitalize="characters" autoCorrect={false} editable={!busy} returnKeyType="done" onSubmitEditing={submitTyped}
          />
          <Button label={`Add ${STATION_NAME}`} icon="check_circle" onPress={submitTyped} busy={busy} disabled={!online} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three },
  center: { alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', borderRadius: Radius.pill, padding: 3 },
  segmentItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one, paddingVertical: Spacing.two, borderRadius: Radius.pill, minHeight: 40 },
  cameraBox: { borderWidth: 1, borderRadius: Radius.card, overflow: 'hidden', aspectRatio: 1 },
  camera: { flex: 1 },
});
