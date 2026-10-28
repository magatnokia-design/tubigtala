import { useCallback } from 'react';

import type { AppNotification, Profile } from '@/domain/types';
import { useAuth } from '@/hooks/use-auth';
import { useCached } from '@/hooks/use-cached';
import { useSubscription, type LoadState, type Subscribe } from '@/hooks/use-subscription';
import { subscribeNotifications } from '@/services/notifications';
import { subscribeProfile } from '@/services/profile';

/** ready + null = signed in but no users/{uid} document yet. */
export function useProfile(): LoadState<Profile | null> {
  const uid = useAuth().user?.uid ?? null;
  const subscribe = useCallback<Subscribe<Profile | null>>(
    (onData, onError) => subscribeProfile(uid ?? '', onData, onError),
    [uid],
  );
  return useCached(uid && `profile.${uid}`, useSubscription(uid, subscribe));
}

export function useNotifications(): LoadState<AppNotification[]> {
  const uid = useAuth().user?.uid ?? null;
  const subscribe = useCallback<Subscribe<AppNotification[]>>(
    (onData, onError) => subscribeNotifications(uid ?? '', onData, onError),
    [uid],
  );
  return useSubscription(uid, subscribe);
}

/** An account can use the app once its profile exists with a phone number. */
export function isProfileComplete(profile: Profile | null): boolean {
  return profile !== null && profile.phoneE164 !== null && profile.displayName.trim() !== '';
}
