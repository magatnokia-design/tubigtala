// users/{uid} profile access (docs/data-model.md). The rules require createdAt only on create
// and updatedAt == request time on every write, so creates and updates are separate calls.
import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc, type FirestoreError, type Unsubscribe } from 'firebase/firestore';

import type { Profile } from '@/domain/types';
import { db } from '@/services/firebase';

const profileRef = (uid: string) => doc(db, 'users', uid);

/** null = no profile document yet (new Google account). */
export function subscribeProfile(
  uid: string, onData: (profile: Profile | null) => void, onError: (e: FirestoreError) => void,
): Unsubscribe {
  return onSnapshot(profileRef(uid), (snap) => {
    if (!snap.exists()) {
      // Offline, the local cache reports "missing" for profiles it never fetched. Treating that
      // as "no profile" would send existing users to Complete your profile, so wait for the server.
      if (snap.metadata.fromCache) return;
      return onData(null);
    }
    const d = snap.data();
    onData({
      displayName: typeof d.displayName === 'string' ? d.displayName : '',
      phoneE164: typeof d.phoneE164 === 'string' ? d.phoneE164 : null,
      smsAlertsEnabled: d.smsAlertsEnabled === true,
      pushEnabled: d.pushEnabled === true,
    });
  }, onError);
}

export function createProfile(uid: string, displayName: string, phoneE164: string | null): Promise<void> {
  return setDoc(profileRef(uid), {
    displayName: displayName.trim(),
    phoneE164,
    // Entering a number opts the user in to SMS alerts; they can switch it off in Settings.
    smsAlertsEnabled: phoneE164 !== null,
    pushEnabled: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function updateProfile(
  uid: string, changes: Partial<Pick<Profile, 'displayName' | 'phoneE164' | 'smsAlertsEnabled' | 'pushEnabled'>>,
): Promise<void> {
  const cleaned = changes.displayName === undefined ? changes : { ...changes, displayName: changes.displayName.trim() };
  return updateDoc(profileRef(uid), { ...cleaned, updatedAt: serverTimestamp() });
}
