import { useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Notice } from '@/components/notice';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { authErrorMessage, signIn, signInWithGoogle } from '@/services/auth';
import { emulatorHost, usingEmulator } from '@/services/firebase';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Emulator-only demo account created by `npm run seed` in devtools/.
const DEMO = { email: 'demo@tubigtala.test', password: 'demo-pass-123' };

type FieldErrors = { email?: string; password?: string };
type Busy = null | 'password' | 'google';

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = 'Enter your email.';
  else if (!EMAIL_RE.test(email.trim())) errors.email = 'That email address is not valid.';
  if (!password) errors.password = 'Enter your password.';
  return errors;
}

export default function SignInScreen() {
  const theme = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  async function run(kind: Exclude<Busy, null>, action: () => Promise<unknown>) {
    setFormError(null);
    setBusy(kind);
    try {
      await action(); // the root layout switches to the app when auth state changes
    } catch (e) {
      setFormError(authErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function submitPassword() {
    const errors = validate(email, password);
    setFieldErrors(errors);
    if (errors.email || errors.password) return;
    run('password', () => signIn(email, password));
  }

  function submitGoogle() {
    setFieldErrors({});
    run('google', signInWithGoogle);
  }

  return (
    <View style={[styles.fill, { backgroundColor: theme.tint }]}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.fill} edges={['top']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.fill}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.hero}>
              <View style={styles.logo}>
                <Icon name="water_drop" size={44} color="tint" />
              </View>
              <ThemedText type="subtitle" style={{ color: theme.onTint }}>TubigTala</ThemedText>
              <ThemedText style={{ color: theme.onTint, opacity: 0.85 }}>Water quality monitoring</ThemedText>
            </View>

            <View style={[styles.sheet, { backgroundColor: theme.background }]}>
              <ThemedText type="smallBold" style={styles.sheetTitle}>Sign in</ThemedText>

              <Pressable
                onPress={submitGoogle}
                disabled={busy !== null}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.googleButton,
                  { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundElement : theme.background },
                ]}>
                {busy === 'google' ? (
                  <ActivityIndicator color={theme.tint} />
                ) : (
                  <>
                    <Image source={require('@/assets/images/google-g.svg')} style={styles.googleLogo} contentFit="contain" />
                    <ThemedText type="smallBold">Continue with Google</ThemedText>
                  </>
                )}
              </Pressable>

              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
                <ThemedText type="small" themeColor="textSecondary">or use email</ThemedText>
                <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              </View>

              <Field label="Email" icon="mail" error={fieldErrors.email}>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  placeholderTextColor={theme.textSecondary}
                  editable={busy === null}
                />
              </Field>

              <Field label="Password" icon="lock" error={fieldErrors.password}>
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  placeholderTextColor={theme.textSecondary}
                  editable={busy === null}
                  onSubmitEditing={submitPassword}
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={8}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                  <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={20} color="textSecondary" />
                </Pressable>
              </Field>

              {formError && <Notice tone="warning">{formError}</Notice>}

              <Pressable
                onPress={submitPassword}
                disabled={busy !== null}
                accessibilityRole="button"
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: pressed ? theme.tintDeep : theme.tint }]}>
                {busy === 'password' ? (
                  <ActivityIndicator color={theme.onTint} />
                ) : (
                  <ThemedText type="smallBold" style={{ color: theme.onTint }}>Sign in</ThemedText>
                )}
              </Pressable>

              {usingEmulator && (
                <View style={styles.demo}>
                  <Notice>{`Local emulator mode (${emulatorHost}). Accounts and data here are for testing and reset when the emulators restart.`}</Notice>
                  <Pressable onPress={() => { setEmail(DEMO.email); setPassword(DEMO.password); }} disabled={busy !== null}>
                    <ThemedText type="linkPrimary" style={{ color: theme.tint }}>Fill in the demo account</ThemedText>
                  </Pressable>
                </View>
              )}

              <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>
                Prototype. Not a certified drinking-water test.
              </ThemedText>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function Field({
  label, icon, error, children,
}: { label: string; icon: 'mail' | 'lock'; error?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View
        style={[
          styles.inputRow,
          { borderColor: error ? theme.offline : theme.border, backgroundColor: theme.backgroundElement },
        ]}>
        <Icon name={icon} size={20} color="textSecondary" />
        {children}
      </View>
      {error && <ThemedText type="small" style={{ color: theme.offline }}>{error}</ThemedText>}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1 },
  hero: { alignItems: 'center', gap: Spacing.one, paddingTop: Spacing.five, paddingBottom: Spacing.five },
  logo: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.two,
  },
  sheet: {
    flexGrow: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: Spacing.four, gap: Spacing.three,
  },
  sheetTitle: { fontSize: 20, lineHeight: 28 },
  googleButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two,
    borderWidth: 1, borderRadius: Radius.small, minHeight: 50,
  },
  googleLogo: { width: 20, height: 20 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dividerLine: { flex: 1, height: 1 },
  field: { gap: Spacing.one },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    borderWidth: 1, borderRadius: Radius.small, paddingHorizontal: Spacing.three,
  },
  input: { flex: 1, paddingVertical: Spacing.two + 4, fontSize: 16 },
  primaryButton: { borderRadius: Radius.small, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  demo: { gap: Spacing.two },
  footer: { textAlign: 'center', marginTop: 'auto', paddingTop: Spacing.three },
});
