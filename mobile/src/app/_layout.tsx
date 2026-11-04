import { useEffect } from 'react';
import { DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { LoadingScreen } from '@/components/loading-screen';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { DialogProvider } from '@/hooks/use-dialog';
import { OnboardingProvider, useOnboarding } from '@/hooks/use-onboarding';
import { isProfileComplete, useProfile } from '@/hooks/use-profile';
import { signOut } from '@/services/auth';

SplashScreen.preventAutoHideAsync();

// Light-only water theme for the navigators (headers, backgrounds).
const navTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.light.tint,
    background: Colors.light.background,
    card: Colors.light.tint,
    text: Colors.light.onTint,
    border: Colors.light.tint,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={navTheme}>
      <DialogProvider>
        <AuthProvider>
          <OnboardingProvider>
            <RootNavigator />
          </OnboardingProvider>
        </AuthProvider>
      </DialogProvider>
    </ThemeProvider>
  );
}

/**
 * Which part of the app is reachable, in order:
 * sign in / sign up -> complete profile (no phone yet) -> onboarding (once per account) -> app.
 */
function RootNavigator() {
  const { user, initializing } = useAuth();
  const profile = useProfile();
  const { seen } = useOnboarding();

  useEffect(() => {
    if (!initializing) SplashScreen.hideAsync();
  }, [initializing]);

  if (initializing) return null; // native splash stays up while the saved session is restored

  const signOutAction = { label: 'Sign out', onPress: () => signOut() };
  if (user && profile.status === 'loading') return <LoadingScreen message="Loading your account…" action={signOutAction} />;
  if (user && profile.status === 'error') return <LoadingScreen error={profile.message} action={signOutAction} />;

  const ready = profile.status === 'ready' && isProfileComplete(profile.data);
  if (user && ready && seen === null) return <LoadingScreen action={signOutAction} />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
      <Stack.Protected guard={!!user && !ready}>
        <Stack.Screen name="complete-profile" />
      </Stack.Protected>
      <Stack.Protected guard={!!user && ready && seen === false}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!!user && ready && seen === true}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}
