// Asks for the Android notification permission the first time an account enters the app
// (after onboarding), instead of waiting for the user to find the switch in Settings.
// Asked once per account per phone; afterwards only the Settings switch asks.
import { useEffect } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { getFlag, setFlag } from '@/services/local-flags';
import { phoneNotificationsSupported, requestNotificationPermission } from '@/services/notifications';
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
        if (result === 'granted' && !pushEnabled) await updateProfile(uid, { pushEnabled: true });
      } finally {
        asking = false;
      }
    })().catch(() => undefined); // a failed prompt must never block the app; Settings can retry
  }, [uid, pushEnabled]);
}
