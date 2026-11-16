// Keeps this phone's push address registered with the backend while phone notifications are on
// (Settings), so alerts arrive while the app is closed; removes it when they are switched off.
// Sign-out removes it too (services/auth.ts). Runs once per signed-in session and again whenever
// FCM replaces the token. Failures are silent: the in-app Notifications list still works.
import { useEffect } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import {
  notificationPermissionGranted, onPushTokenChanged, registerPushToken, unregisterPushToken,
} from '@/services/notifications';

export function usePushRegistration() {
  const uid = useAuth().user?.uid ?? null;
  const profile = useProfile();
  const ready = profile.status === 'ready';
  const pushEnabled = ready && profile.data?.pushEnabled === true;

  useEffect(() => {
    if (!uid || !ready) return;
    let alive = true;
    let stop: (() => void) | undefined;
    (async () => {
      if (!pushEnabled) {
        await unregisterPushToken(uid).catch(() => undefined);
        return;
      }
      // Android can revoke the permission behind the app's back; without it nothing would show.
      if (!(await notificationPermissionGranted().catch(() => false))) return;
      await registerPushToken(uid).catch(() => undefined);
      const unsubscribe = await onPushTokenChanged((token) => {
        registerPushToken(uid, token).catch(() => undefined);
      }).catch(() => undefined);
      if (alive) stop = unsubscribe;
      else unsubscribe?.();
    })();
    return () => {
      alive = false;
      stop?.();
    };
  }, [uid, ready, pushEnabled]);
}
