import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { formatNationalInput, formatPhMobile, normalizePhMobile } from '@/domain/phone';
import { nameError, phoneError } from '@/domain/validation';
import { useAuth } from '@/hooks/use-auth';
import { useForm } from '@/hooks/use-form';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { updateProfile } from '@/services/profile';

/**
 * Changes one field: /edit-profile?field=name or ?field=phone. The current value is shown on its
 * own and the field starts empty, so nothing is filled in or changed until the user types a new one.
 */
export default function EditProfileScreen() {
  const theme = useTheme();
  const { field } = useLocalSearchParams<{ field: 'name' | 'phone' }>();
  const editingPhone = field === 'phone';
  const { user } = useAuth();
  const profile = useProfile();
  const p = profile.status === 'ready' ? profile.data : null;
  const current = editingPhone ? (p?.phoneE164 ? formatPhMobile(p.phoneE164) : null) : (p?.displayName || null);

  const form = useForm({ value: '' }, { value: editingPhone ? phoneError : nameError });
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!form.validateAll() || !user) return;
    const value = form.values.value.trim();
    const e164 = editingPhone ? normalizePhMobile(value) : null;
    if (editingPhone && !e164) return;
    // Same as now: nothing to save.
    if ((editingPhone && e164 === p?.phoneE164) || (!editingPhone && value === p?.displayName)) {
      router.back();
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      // A saved number turns SMS alerts on; the switch in Settings can turn them off.
      await updateProfile(user.uid, editingPhone ? { phoneE164: e164, smsAlertsEnabled: true } : { displayName: value });
      router.back();
    } catch {
      setFormError('Could not save. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: editingPhone ? 'Change mobile number' : 'Change name' }} />
      <View style={[styles.current, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="small" themeColor="textSecondary">{editingPhone ? 'Current mobile number' : 'Current name'}</ThemedText>
        <ThemedText type="smallBold" style={styles.currentValue}>{current ?? 'Not set'}</ThemedText>
      </View>
      {editingPhone ? (
        <TextField
          label="New mobile number" icon="phone_iphone" prefix="+63" autoFocus
          value={formatNationalInput(form.values.value)}
          onChangeText={(t) => form.set('value')(t.replace(/\D/g, '').replace(/^0/, ''))}
          onBlur={form.blur('value')} error={form.errors.value}
          keyboardType="phone-pad" placeholder="9XX XXX XXXX" maxLength={12} editable={!busy}
          returnKeyType="done" onSubmitEditing={save}
        />
      ) : (
        <TextField
          label="New name" icon="person" autoFocus
          value={form.values.value} onChangeText={form.set('value')}
          onBlur={form.blur('value')} error={form.errors.value}
          autoCapitalize="words" autoComplete="name" editable={!busy}
          returnKeyType="done" onSubmitEditing={save}
        />
      )}
      {formError && <Notice tone="warning">{formError}</Notice>}
      <Button label="Save" icon="check_circle" onPress={save} busy={busy} />
      <Button label="Cancel" variant="text" onPress={() => router.back()} disabled={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three },
  current: { borderRadius: Radius.small, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: 2 },
  currentValue: { fontSize: 18, lineHeight: 24 },
});
