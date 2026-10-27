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
import { emailError } from '@/domain/validation';
import { useTheme } from '@/hooks/use-theme';
import { authErrorMessage, signIn, signInWithGoogle } from '@/services/auth';
import { usingEmulator } from '@/services/firebase';

// Emulator-only demo account created by `npm run seed` in devtools/.
const DEMO = { email: 'demo@tubigtala.test', password: 'demo-pass-123' };

type Busy = null | 'password' | 'google';

export default function SignInScreen() {
  const theme = useTheme();
  const passwordRef = useRef<TextInputInstance>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  async function run(kind: Exclude<Busy, null>, action: () => Promise<unknown>) {
    setFormError(null);
    setBusy(kind);
    try {
      await action(); // the root layout moves on when auth state changes
    } catch (e) {
      setFormError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function submit() {
    const next = { email: emailError(email), password: password ? undefined : 'Enter your password.' };
    setErrors(next);
    if (next.email || next.password) return;
    run('password', () => signIn(email, password));
  }

  return (
    <AuthScaffold title="Welcome back" subtitle="Sign in to check on your water.">
      <TextField
        label="Email"
        icon="mail"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="you@example.com"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={busy === null}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        icon="lock"
        password
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        autoComplete="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        editable={busy === null}
      />

      {formError && <Notice tone="warning">{formError}</Notice>}

      <Button label="Sign in" onPress={submit} busy={busy === 'password'} disabled={busy !== null} />

      <View style={styles.switchRow}>
        <ThemedText type="small" themeColor="textSecondary">New to TubigTala?</ThemedText>
        <Button label="Create an account" variant="text" onPress={() => router.push('/sign-up')} disabled={busy !== null} />
      </View>

      <View style={styles.dividerRow}>
        <View style={[styles.line, { backgroundColor: theme.border }]} />
        <ThemedText type="small" themeColor="textSecondary">or</ThemedText>
        <View style={[styles.line, { backgroundColor: theme.border }]} />
      </View>

      <GoogleButton onPress={() => run('google', signInWithGoogle)} busy={busy === 'google'} disabled={busy !== null} />

      {usingEmulator && (
        <View style={styles.demo}>
          <Notice>Local emulator mode: test accounts and simulated data, reset when the emulators restart.</Notice>
          <Button
            label="Fill in the demo account"
            variant="text"
            onPress={() => { setEmail(DEMO.email); setPassword(DEMO.password); }}
            disabled={busy !== null}
          />
        </View>
      )}
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  line: { flex: 1, height: 1 },
  demo: { gap: Spacing.one, marginTop: Spacing.two },
});
