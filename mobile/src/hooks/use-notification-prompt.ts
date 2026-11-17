// Asks for the Android notification permission the first time an account enters the app
// (after onboarding), instead of waiting for the user to find the switch in Settings.
// Asked once per account per phone; afterwards only the Settings switch asks.
import { useEffect } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { getFlag, setFlag } from '@/services/local-flags';
import { phoneNotificationsSupported, registerPushToken, requestNotificationPermission } from '@/services/notifications';
import { updateProfile } from '@/services/profile';

// Guards against the effect re-running (profile updates) while a request is already open.
let asking = false;

export function useNotificationPrompt() {
  const uid = useAuth().user?.uid ?? null;
  const profile = useProfile();
  const pushEnabled = profile.status === 'ready' ? profile.data?.pushEnabled ?? false : null;

  useEffect(() => {
    if (!uid || pushEnabled === null || !phoneNotificationsSupported) return;
    (async () => {
      if (asking || (await getFlag('notificationPrompt', uid))) return;
      asking = true;
      try {
        await setFlag('notificationPrompt', uid);
        const result = await requestNotificationPermission();
        if (result === 'granted') {
          // Switching notifications on registers this phone (use-push-registration). If they were
          // already on (an existing account on a fresh install), nothing would change - so register
          // here, or the phone stays unregistered until the app is restarted (found 17 Nov 2026).
          if (!pushEnabled) await updateProfile(uid, { pushEnabled: true });
          else await registerPushToken(uid).catch(() => undefined);
        }
      } finally {
        asking = false;
      }
    })().catch(() => undefined); // a failed prompt must never block the app; Settings can retry
  }, [uid, pushEnabled]);
}
