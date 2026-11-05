import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, type TextInputInstance } from 'react-native';
import { router, Stack } from 'expo-router';

import { Button } from '@/components/button';
import { Notice } from '@/components/notice';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import { changedPasswordError, confirmPasswordError, PASSWORD_MIN } from '@/domain/validation';
import { useDialog } from '@/hooks/use-dialog';
import { useForm } from '@/hooks/use-form';
import { useTheme } from '@/hooks/use-theme';
import { authErrorMessage, changePassword } from '@/services/auth';

/**
 * Change password for email + password accounts (Account screen only offers it to them). Firebase
 * needs a recent sign-in, so the current password is checked first. The new one follows the same
 * rules as sign-up (domain/validation.ts).
 */
export default function ChangePasswordScreen() {
  const theme = useTheme();
  const dialog = useDialog();
  const newRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);
  const form = useForm(
    { current: '', next: '', confirm: '' },
    {
      current: (v) => (v ? undefined : 'Enter your current password.'),
      next: (v, all) => changedPasswordError(all.current, v),
      confirm: (v, all) => confirmPasswordError(all.next, v),
    },
  );
  const [currentError, setCurrentError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setCurrentError(undefined);
    setFormError(null);
    if (!form.validateAll()) return;
    setBusy(true);
    try {
      await changePassword(form.values.current, form.values.next);
      await dialog.notify({ tone: 'success', title: 'Password changed', message: 'Use the new password next time you sign in.' });
      router.back();
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      // A wrong current password belongs next to that field, not in a general message.
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') setCurrentError('That is not your current password.');
      else setFormError(authErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Change password' }} />
      <TextField
        label="Current password" icon="lock" password autoFocus
        value={form.values.current} onChangeText={form.set('current')} onBlur={form.blur('current')}
        error={currentError ?? form.errors.current} autoComplete="current-password" editable={!busy}
        returnKeyType="next" onSubmitEditing={() => newRef.current?.focus()}
      />
      <TextField
        ref={newRef} label="New password" icon="lock" password
        value={form.values.next} onChangeText={form.set('next')} onBlur={form.blur('next')}
        error={form.errors.next} hint={`At least ${PASSWORD_MIN} characters, with letters and numbers`}
        autoComplete="new-password" editable={!busy} returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <TextField
        ref={confirmRef} label="Confirm new password" icon="lock" password
        value={form.values.confirm} onChangeText={form.set('confirm')} onBlur={form.blur('confirm')}
        error={form.errors.confirm} autoComplete="new-password" editable={!busy} returnKeyType="done" onSubmitEditing={save}
      />
      {formError && <Notice tone="warning">{formError}</Notice>}
      <Button label="Change password" icon="check_circle" onPress={save} busy={busy} />
      <Button label="Cancel" variant="text" onPress={() => router.back()} disabled={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three },
});
