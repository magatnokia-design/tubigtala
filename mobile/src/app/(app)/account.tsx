import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';

import { Icon } from '@/components/icon';
import { ChangeLabel, Row, Section } from '@/components/settings-list';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { hasPasswordSignIn } from '@/services/auth';

/**
 * The account, opened from the single Account row in Settings. Email + password accounts can
 * change their password here; Google accounts have no password in Firebase, so they cannot.
 */
export default function AccountScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const profile = useProfile();
  const p = profile.status === 'ready' ? profile.data : null;

  if (!user || !p) {
    return <View style={[styles.fill, styles.center, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.tint} /></View>;
  }
  const passwordAccount = hasPasswordSignIn(user);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Account' }} />
      <Section title="Profile">
        <Row
          icon="person"
          label="Name"
          value={p.displayName}
          right={<ChangeLabel />}
          onPress={() => router.push({ pathname: '/edit-profile', params: { field: 'name' } })}
        />
        <Row icon="mail" label="Email" value={user.email ?? '—'} />
      </Section>

      <Section title="Sign-in">
        {passwordAccount ? (
          <Row icon="lock" label="Password" value="Email and password account" right={<ChangeLabel />} onPress={() => router.push('/change-password')} />
        ) : (
          <Row
            icon="account_circle"
            label="Signed in with Google"
            value="No password to change. Google manages this account's sign-in."
            right={<Icon name="verified_user" size={20} color="textSecondary" />}
          />
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three },
});
