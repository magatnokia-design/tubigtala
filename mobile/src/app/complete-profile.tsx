import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthScaffold } from '@/components/auth-scaffold';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Notice } from '@/components/notice';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { formatNationalInput, normalizePhMobile } from '@/domain/phone';
import { nameError, phoneError } from '@/domain/validation';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { authErrorMessage, signOut } from '@/services/auth';
import { createProfile, updateProfile } from '@/services/profile';

/**
 * Shown after sign-in whenever the account has no phone number yet - mainly new Google users,
 * since Google does not share one. The number is required to continue (SMS alerts need it).
 */
export default function CompleteProfileScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const profile = useProfile();
  const existing = profile.status === 'ready' ? profile.data : null;

  const [name, setName] = useState(existing?.displayName || user?.displayName || '');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const next = { name: nameError(name), phone: phoneError(phone) };
    setErrors(next);
    const e164 = normalizePhMobile(phone);
    if (next.name || next.phone || !e164 || !user) return;
    setFormError(null);
    setBusy(true);
    try {
      if (existing) await updateProfile(user.uid, { displayName: name, phoneE164: e164 });
      else await createProfile(user.uid, name, e164);
      // The root layout opens the app once the saved profile arrives.
    } catch (e) {
      setFormError(authErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <AuthScaffold title="One more step" subtitle="Add your mobile number so TubigTala can reach you about your water.">
      <View style={[styles.account, { backgroundColor: theme.backgroundElement }]}>
        <Icon name="account_circle" size={36} />
        <View style={styles.accountText}>
          <ThemedText type="smallBold">{user?.displayName || 'Signed in'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{user?.email ?? ''}</ThemedText>
        </View>
      </View>

      <TextField
        label="Full name" icon="person" value={name} onChangeText={setName} error={errors.name}
        autoComplete="name" autoCapitalize="words" editable={!busy}
      />
      <TextField
        label="Mobile number" icon="phone_iphone" prefix="+63"
        value={formatNationalInput(phone)} onChangeText={(t) => setPhone(t.replace(/\D/g, '').replace(/^0/, ''))}
        error={errors.phone} hint="10-digit PH mobile number starting with 9. Used only for your alerts."
        keyboardType="phone-pad" autoComplete="tel" placeholder="9XX XXX XXXX" maxLength={12}
        returnKeyType="done" onSubmitEditing={submit} editable={!busy} autoFocus
      />

      {formError && <Notice tone="warning">{formError}</Notice>}

      <Button label="Continue" icon="arrow_forward" onPress={submit} busy={busy} />
      <Button label="Use a different account" variant="text" onPress={() => signOut()} disabled={busy} />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  account: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: Radius.card },
  accountText: { flex: 1 },
});
