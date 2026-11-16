// Push addresses (Firebase Cloud Messaging registration tokens) are stored per phone under
// users/{uid}/pushTokens/{id}. The ID is a short hash of the token so the token itself is not
// part of the document path, and so the same phone always maps to the same document (no
// duplicates when it registers again). firestore.rules accepts ^[a-z0-9]{1,32}$.

/** cyrb53 (public-domain 53-bit string hash) in base 36: stable, fast, not cryptographic. */
export function pushTokenId(token: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < token.length; i++) {
    const c = token.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
