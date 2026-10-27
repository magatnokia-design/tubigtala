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
import { useForm } from '@/hooks/use-form';
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

  const form = useForm({ name: existing?.displayName || user?.displayName || '', phone: '' }, { name: nameError, phone: phoneError });
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const e164 = normalizePhMobile(form.values.phone);
    if (!form.validateAll() || !e164 || !user) return;
    setFormError(null);
    setBusy(true);
    try {
      // Entering a number opts the user in to SMS alerts (switchable in Settings).
      if (existing) await updateProfile(user.uid, { displayName: form.values.name, phoneE164: e164, smsAlertsEnabled: true });
      else await createProfile(user.uid, form.values.name, e164);
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
        label="Full name" icon="person" value={form.values.name} onChangeText={form.set('name')} onBlur={form.blur('name')}
        error={form.errors.name} autoComplete="name" autoCapitalize="words" editable={!busy}
      />
      <TextField
        label="Mobile number" icon="phone_iphone" prefix="+63"
        value={formatNationalInput(form.values.phone)} onChangeText={(t) => form.set('phone')(t.replace(/\D/g, '').replace(/^0/, ''))}
        onBlur={form.blur('phone')} error={form.errors.phone} hint="Used for SMS alerts"
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
