import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';
import { router } from 'expo-router';

import { AuthScaffold } from '@/components/auth-scaffold';
import { Button } from '@/components/button';
import { GoogleButton } from '@/components/google-button';
import { Notice } from '@/components/notice';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatNationalInput, normalizePhMobile } from '@/domain/phone';
import {
  confirmPasswordError, emailError, nameError, newPasswordError, PASSWORD_MIN, phoneError,
} from '@/domain/validation';
import { useTheme } from '@/hooks/use-theme';
import { authErrorMessage, signInWithGoogle, signUp } from '@/services/auth';

type Field = 'name' | 'email' | 'phone' | 'password' | 'confirm';
type Busy = null | 'email' | 'google';

export default function SignUpScreen() {
  const theme = useTheme();
  const emailRef = useRef<TextInputInstance>(null);
  const phoneRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);
  const [values, setValues] = useState<Record<Field, string>>({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  const set = (field: Field) => (text: string) => setValues((v) => ({ ...v, [field]: text }));

  async function run(kind: Exclude<Busy, null>, action: () => Promise<unknown>) {
    setFormError(null);
    setBusy(kind);
    try {
      await action();
    } catch (e) {
      setFormError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function submit() {
    const next: Partial<Record<Field, string>> = {
      name: nameError(values.name),
      email: emailError(values.email),
      phone: phoneError(values.phone),
      password: newPasswordError(values.password),
      confirm: confirmPasswordError(values.password, values.confirm),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const phone = normalizePhMobile(values.phone);
    if (!phone) return; // unreachable: phoneError passed
    run('email', () => signUp(values.name, values.email, values.password, phone));
  }

  const editable = busy === null;

  return (
    <AuthScaffold title="Create your account" subtitle="It takes a minute. Your number is used for SMS alerts.">
      <TextField
        label="Full name" icon="person" value={values.name} onChangeText={set('name')} error={errors.name}
        autoComplete="name" autoCapitalize="words" placeholder="Juan Dela Cruz"
        returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} editable={editable}
      />
      <TextField
        ref={emailRef} label="Email" icon="mail" value={values.email} onChangeText={set('email')} error={errors.email}
        autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com"
        returnKeyType="next" onSubmitEditing={() => phoneRef.current?.focus()} editable={editable}
      />
      <TextField
        ref={phoneRef} label="Mobile number" icon="phone_iphone" prefix="+63"
        value={formatNationalInput(values.phone)} onChangeText={(t) => set('phone')(t.replace(/\D/g, '').replace(/^0/, ''))}
        error={errors.phone} hint="10-digit PH mobile number starting with 9"
        keyboardType="phone-pad" autoComplete="tel" placeholder="9XX XXX XXXX" maxLength={12}
        returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} editable={editable}
      />
      <TextField
        ref={passwordRef} label="Password" icon="lock" password value={values.password} onChangeText={set('password')}
        error={errors.password} hint={`At least ${PASSWORD_MIN} characters, with letters and numbers`}
        autoComplete="new-password" returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()} editable={editable}
      />
      <TextField
        ref={confirmRef} label="Confirm password" icon="lock" password value={values.confirm} onChangeText={set('confirm')}
        error={errors.confirm} autoComplete="new-password" returnKeyType="go" onSubmitEditing={submit} editable={editable}
      />

      {formError && <Notice tone="warning">{formError}</Notice>}

      <Button label="Create account" onPress={submit} busy={busy === 'email'} disabled={!editable} />

      <View style={styles.switchRow}>
        <ThemedText type="small" themeColor="textSecondary">Already have an account?</ThemedText>
        <Button label="Sign in" variant="text" onPress={() => router.back()} disabled={!editable} />
      </View>

      <View style={styles.dividerRow}>
        <View style={[styles.line, { backgroundColor: theme.border }]} />
        <ThemedText type="small" themeColor="textSecondary">or</ThemedText>
        <View style={[styles.line, { backgroundColor: theme.border }]} />
      </View>

      <GoogleButton onPress={() => run('google', signInWithGoogle)} busy={busy === 'google'} disabled={!editable} />
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  line: { flex: 1, height: 1 },
});
