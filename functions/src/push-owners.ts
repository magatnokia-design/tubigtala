// A phone belongs to the account that registered it LAST (docs/data-model.md, pushTokens).
//
// The app removes this phone's push address when the user signs out (mobile/src/services/auth.ts),
// but a sign-out right after the app opens can lose a race with the background registration, and
// the phone then stays registered on the old account too (seen 16 Nov 2026 when switching from the
// station's login to a personal account). Every account a phone is left on would push its alerts
// to that phone. So when a phone registers, the server removes the same phone from the account it
// was registered on before.
//
// "Last wins" is safe because an account can only write while signed in, and the next account only
// signs in after the previous one signed out - so for one phone, the server sees registrations in
// the order the accounts were used. The document ID is a hash of the token (mobile/src/domain/push.ts),
// so the same phone has the same ID under every account.
//
// Server-only map pushTokenOwners/{tokenId} = { uid, updatedAt } (closed to the app by the rules'
// default deny). Cost: one function run per registration (app start), 1-2 reads, 1-2 writes.
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

/** A phone registered for `uid`: remove it from the previous account. True if one was removed. */
export async function claimPushToken(db: Firestore, uid: string, tokenId: string, token: string): Promise<boolean> {
  const ownerRef = db.doc(`pushTokenOwners/${tokenId}`);
  return db.runTransaction(async (tx) => {
    const prevUid = (await tx.get(ownerRef)).get('uid');
    let removed = false;
    if (typeof prevUid === 'string' && prevUid !== uid) {
      const oldRef = db.doc(`users/${prevUid}/pushTokens/${tokenId}`);
      const old = await tx.get(oldRef);
      // Same ID and the same token (not a hash collision): the same phone.
      if (old.exists && old.get('token') === token) {
        tx.delete(oldRef);
        removed = true;
      }
    }
    if (prevUid !== uid) tx.set(ownerRef, { uid, updatedAt: FieldValue.serverTimestamp() });
    return removed;
  });
}

/** A phone's registration for `uid` was deleted (sign-out, switched off, dead token): forget the owner. */
export async function releasePushToken(db: Firestore, uid: string, tokenId: string): Promise<void> {
  const ownerRef = db.doc(`pushTokenOwners/${tokenId}`);
  await db.runTransaction(async (tx) => {
    if ((await tx.get(ownerRef)).get('uid') === uid) tx.delete(ownerRef);
  });
}
