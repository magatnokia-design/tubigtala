import { useEffect } from 'react';
import { DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { LoadingScreen } from '@/components/loading-screen';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
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
      <OnboardingProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </OnboardingProvider>
    </ThemeProvider>
  );
}

/**
 * Which part of the app is reachable, in order:
 * onboarding (first launch) -> sign in / sign up -> complete profile (no phone yet) -> app.
 */
function RootNavigator() {
  const { user, initializing } = useAuth();
  const { seen } = useOnboarding();
  const profile = useProfile();

  const deciding = initializing || seen === null;
  useEffect(() => {
    if (!deciding) SplashScreen.hideAsync();
  }, [deciding]);

  if (deciding) return null; // native splash stays up

  if (seen && user && profile.status === 'loading') {
    return <LoadingScreen message="Loading your account…" action={{ label: 'Sign out', onPress: () => signOut() }} />;
  }
  if (seen && user && profile.status === 'error') {
    return <LoadingScreen error={profile.message} action={{ label: 'Sign out', onPress: () => signOut() }} />;
  }

  const ready = profile.status === 'ready' && isProfileComplete(profile.data);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!seen}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!!seen && !user}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
      <Stack.Protected guard={!!seen && !!user && !ready}>
        <Stack.Screen name="complete-profile" />
      </Stack.Protected>
      <Stack.Protected guard={!!seen && !!user && ready}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}
