import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';

import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import { formatNationalInput, normalizePhMobile } from '@/domain/phone';
import { nameError, phoneError } from '@/domain/validation';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { updateProfile } from '@/services/profile';

export default function EditProfileScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const profile = useProfile();
  const p = profile.status === 'ready' ? profile.data : null;

  const [name, setName] = useState(p?.displayName ?? '');
  const [phone, setPhone] = useState(p?.phoneE164 ? p.phoneE164.slice(3) : '');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const next = { name: nameError(name), phone: phoneError(phone) };
    setErrors(next);
    const e164 = normalizePhMobile(phone);
    if (next.name || next.phone || !e164 || !user) return;
    setBusy(true);
    setFormError(null);
    try {
      await updateProfile(user.uid, { displayName: name, phoneE164: e164 });
      router.back();
    } catch {
      setFormError('Could not save. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TextField label="Full name" icon="person" value={name} onChangeText={setName} error={errors.name} autoCapitalize="words" editable={!busy} />
      <TextField
        label="Mobile number" icon="phone_iphone" prefix="+63"
        value={formatNationalInput(phone)} onChangeText={(t) => setPhone(t.replace(/\D/g, '').replace(/^0/, ''))}
        error={errors.phone} hint="Philippine mobile number for SMS alerts" keyboardType="phone-pad" maxLength={12} editable={!busy}
      />
      {formError && <Notice tone="warning">{formError}</Notice>}
      <Button label="Save" icon="check_circle" onPress={save} busy={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three },
});
