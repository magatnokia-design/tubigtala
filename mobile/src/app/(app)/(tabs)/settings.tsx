import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import type { AndroidSymbol } from 'expo-symbols';
import Constants from 'expo-constants';
import { router } from 'expo-router';

import { Icon } from '@/components/icon';
import { Notice } from '@/components/notice';
import { TabHeader } from '@/components/tab-header';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { formatPhMobile } from '@/domain/phone';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { signOut } from '@/services/auth';
import { notificationPermissionGranted, requestNotificationPermission } from '@/services/notifications';
import { updateProfile } from '@/services/profile';

type Pending = null | 'sms' | 'push';

function confirmSignOut() {
  Alert.alert('Sign out?', undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: () => { signOut(); } },
  ]);
}

export default function SettingsScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const profile = useProfile();
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<{ text: string; openSettings?: boolean } | null>(null);
  const [osPermission, setOsPermission] = useState<boolean | null>(null);

  const p = profile.status === 'ready' ? profile.data : null;

  // Android can revoke the permission behind the app's back; flag it if the switch is on.
  useEffect(() => {
    if (!p?.pushEnabled) return;
    let alive = true;
    notificationPermissionGranted().then((g) => alive && setOsPermission(g)).catch(() => undefined);
    return () => { alive = false; };
  }, [p?.pushEnabled]);

  if (!user || !p) {
    return <View style={[styles.fill, styles.center]}><ActivityIndicator color={theme.tint} /></View>;
  }
  const uid = user.uid;

  async function toggleSms(on: boolean) {
    setError(null);
    setPending('sms');
    try {
      await updateProfile(uid, { smsAlertsEnabled: on });
    } catch {
      setError({ text: 'Could not save. Try again.' });
    } finally {
      setPending(null);
    }
  }

  async function togglePush(on: boolean) {
    setError(null);
    setPending('push');
    try {
      if (on) {
        const result = await requestNotificationPermission();
        if (result !== 'granted') {
          setError(result === 'blocked'
            ? { text: 'Notifications are off in Android settings.', openSettings: true }
            : { text: 'Notifications were not allowed.' });
          return;
        }
        setOsPermission(true);
      }
      await updateProfile(uid, { pushEnabled: on });
    } catch {
      setError({ text: 'Could not save. Try again.' });
    } finally {
      setPending(null);
    }
  }

  const initials = p.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  const switchColors = { trackColor: { true: theme.tint, false: theme.border }, thumbColor: theme.background };

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <TabHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Account">
          <Pressable
            onPress={() => router.push({ pathname: '/edit-profile', params: { field: 'name' } })}
            accessibilityRole="button"
            accessibilityLabel="Edit name"
            style={({ pressed }) => [styles.account, pressed && { backgroundColor: theme.backgroundElement }]}>
            <View style={[styles.avatar, { backgroundColor: theme.tint }]}>
              <ThemedText style={[styles.avatarText, { color: theme.onTint }]}>{initials}</ThemedText>
            </View>
            <View style={styles.flex}>
              <ThemedText type="smallBold" style={styles.name}>{p.displayName}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{user.email ?? ''}</ThemedText>
            </View>
            <Icon name="chevron_right" color="textSecondary" />
          </Pressable>
          <Row icon="logout" label="Sign out" onPress={confirmSignOut} />
        </Section>

        <Section title="SMS">
          <Row
            icon="phone_iphone"
            label="Mobile number"
            value={p.phoneE164 ? formatPhMobile(p.phoneE164) : 'Not set'}
            onPress={() => router.push({ pathname: '/edit-profile', params: { field: 'phone' } })}
            chevron
          />
          <Row
            icon="sms"
            label="SMS alerts"
            right={pending === 'sms'
              ? <ActivityIndicator color={theme.tint} />
              : <Switch value={p.smsAlertsEnabled} onValueChange={toggleSms} disabled={pending !== null || !p.phoneE164} {...switchColors} />}
          />
        </Section>

        <Section title="Notifications">
          <Row
            icon="notifications_active"
            label="Allow notifications"
            value={p.pushEnabled && osPermission === false ? 'Off in Android settings' : undefined}
            right={pending === 'push'
              ? <ActivityIndicator color={theme.tint} />
              : <Switch value={p.pushEnabled} onValueChange={togglePush} disabled={pending !== null} {...switchColors} />}
          />
        </Section>

        {error && (
          <View style={styles.error}>
            <Notice tone="warning">{error.text}</Notice>
            {error.openSettings && <Row icon="settings" label="Open Android settings" onPress={() => Linking.openSettings()} chevron />}
          </View>
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.version}>
          {`Version ${Constants.expoConfig?.version ?? ''}`}
        </ThemedText>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>{title.toUpperCase()}</ThemedText>
      <View style={[styles.sectionBody, { borderColor: theme.border }]}>{children}</View>
    </View>
  );
}

function Row({ icon, label, value, right, onPress, chevron }: {
  icon: AndroidSymbol; label: string; value?: string; right?: ReactNode; onPress?: () => void; chevron?: boolean;
}) {
  const theme = useTheme();
  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: theme.backgroundElement }]}>
        <Icon name={icon} size={20} />
      </View>
      <View style={styles.flex}>
        <ThemedText>{label}</ThemedText>
        {value ? <ThemedText type="small" themeColor="textSecondary">{value}</ThemedText> : null}
      </View>
      {right}
      {chevron && <Icon name="chevron_right" color="textSecondary" />}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundElement }]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  sectionTitle: { letterSpacing: 1, fontSize: 12 },
  sectionBody: { borderWidth: 1, borderRadius: Radius.card, overflow: 'hidden', paddingVertical: Spacing.one },
  account: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, lineHeight: 26, fontWeight: 700 },
  name: { fontSize: 18, lineHeight: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, minHeight: 56 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  error: { gap: Spacing.two },
  version: { textAlign: 'center' },
});
