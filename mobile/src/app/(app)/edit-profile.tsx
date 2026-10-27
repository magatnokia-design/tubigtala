import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import { formatNationalInput, normalizePhMobile } from '@/domain/phone';
import { nameError, phoneError } from '@/domain/validation';
import { useAuth } from '@/hooks/use-auth';
import { useForm } from '@/hooks/use-form';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { updateProfile } from '@/services/profile';

/** Edits one field: /edit-profile?field=name or ?field=phone. */
export default function EditProfileScreen() {
  const theme = useTheme();
  const { field } = useLocalSearchParams<{ field: 'name' | 'phone' }>();
  const editingPhone = field === 'phone';
  const { user } = useAuth();
  const profile = useProfile();
  const p = profile.status === 'ready' ? profile.data : null;

  const form = useForm(
    { value: editingPhone ? (p?.phoneE164?.slice(3) ?? '') : (p?.displayName ?? '') },
    { value: editingPhone ? phoneError : nameError },
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!form.validateAll() || !user) return;
    const value = form.values.value;
    const e164 = editingPhone ? normalizePhMobile(value) : null;
    if (editingPhone && !e164) return;
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
      <Stack.Screen options={{ title: editingPhone ? 'Mobile number' : 'Name' }} />
      {editingPhone ? (
        <TextField
          label="Mobile number" icon="phone_iphone" prefix="+63" autoFocus
          value={formatNationalInput(form.values.value)}
          onChangeText={(t) => form.set('value')(t.replace(/\D/g, '').replace(/^0/, ''))}
          onBlur={form.blur('value')} error={form.errors.value}
          keyboardType="phone-pad" placeholder="9XX XXX XXXX" maxLength={12} editable={!busy}
          returnKeyType="done" onSubmitEditing={save}
        />
      ) : (
        <TextField
          label="Full name" icon="person" autoFocus
          value={form.values.value} onChangeText={form.set('value')}
          onBlur={form.blur('value')} error={form.errors.value}
          autoCapitalize="words" autoComplete="name" editable={!busy}
          returnKeyType="done" onSubmitEditing={save}
        />
      )}
      {formError && <Notice tone="warning">{formError}</Notice>}
      <Button label="Save" icon="check_circle" onPress={save} busy={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three },
});
