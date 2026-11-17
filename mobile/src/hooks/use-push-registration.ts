// Keeps this phone's push address registered with the backend while phone notifications are on
// (Settings), so alerts arrive while the app is closed; removes it when they are switched off.
// Sign-out removes it too (services/auth.ts). Failures are silent: the in-app Notifications list
// still works.
//
// It checks at start, again whenever FCM replaces the token, and again every time the app comes
// back to the foreground. That last one matters (found 17 Nov 2026): after a fresh install the
// first check runs right after sign-in, BEFORE Android has asked for the notification permission,
// so it found none and stopped - and allowing it in the prompt (or in Android settings) changed
// nothing the check watched, so the phone stayed unregistered until a full restart and the next
// alert's push went to the old install's dead address. Leaving for the permission dialog or for
// Android settings and returning brings the app back to the foreground, which now re-checks.
// Repeats are free: services/notifications.ts skips a registration this session already made.
import { useEffect } from 'react';

import { useAppActive } from '@/hooks/use-app-active';
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
  const active = useAppActive();

  useEffect(() => {
    if (!uid || !ready || !active) return;
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
  }, [uid, ready, pushEnabled, active]);
}
