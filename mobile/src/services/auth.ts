// Firebase Authentication access. Maps Firebase error codes to messages a user can act on.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, signInWithCredential,
  signInWithEmailAndPassword, signOut as fbSignOut, updateProfile as updateAuthProfile, type User,
} from 'firebase/auth';

import { auth, usingEmulator } from '@/services/firebase';
import { createProfile } from '@/services/profile';

export type { User };

/** Test Google account the Auth emulator creates on first use (emulator only). */
export const DEMO_GOOGLE_EMAIL = 'demo.google@tubigtala.test';

export function subscribeAuth(onChange: (user: User | null) => void) {
  return onAuthStateChanged(auth, onChange);
}

export async function signIn(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

/**
 * Creates the Auth account, then the users/{uid} profile with the phone number. If the
 * profile write fails after the account exists, the app routes to "Complete your profile",
 * so the account is never left unusable.
 */
export async function signUp(name: string, email: string, password: string, phoneE164: string): Promise<void> {
  const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateAuthProfile(user, { displayName: name.trim() }).catch(() => undefined);
  await createProfile(user.uid, name, phoneE164);
}

export class GoogleSignInUnavailableError extends Error {
  code = 'tubigtala/google-unavailable';
}

// Web OAuth client ID from Firebase console > Authentication > Google > Web SDK configuration.
// Public value; needed for the native library to return an ID token Firebase accepts.
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

/** The native Google library exists only in an APK built with google-services.json, never in Expo Go. */
const nativeGoogleAvailable =
  !usingEmulator && !!googleWebClientId && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

/**
 * Google sign-in. Returns false if the user cancelled.
 * - Emulator: the Auth emulator accepts an unsigned JSON "ID token", so this works in Expo Go.
 * - Real project: @react-native-google-signin (native), loaded lazily so Expo Go never
 *   evaluates it (importing it there crashes because the native module is absent).
 */
export async function signInWithGoogle(): Promise<boolean> {
  if (usingEmulator) {
    const fakeIdToken = JSON.stringify({
      sub: 'demo-google', email: DEMO_GOOGLE_EMAIL, email_verified: true, name: 'Demo Google User',
    });
    await signInWithCredential(auth, GoogleAuthProvider.credential(fakeIdToken));
    return true;
  }
  if (!nativeGoogleAvailable) {
    throw new GoogleSignInUnavailableError('Google sign-in is not set up in this build yet.');
  }
  const { GoogleSignin, isSuccessResponse } = await import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId: googleWebClientId });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return false;
  const idToken = response.data.idToken;
  if (!idToken) throw new GoogleSignInUnavailableError('Google did not return an ID token (check the web client ID).');
  await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  return true;
}

export async function signOut(): Promise<void> {
  if (nativeGoogleAvailable) {
    // Also forget the Google account on the phone, so the next sign-in shows the account chooser.
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
    await GoogleSignin.signOut().catch(() => undefined);
  }
  await fbSignOut(auth);
}

export function authErrorMessage(e: unknown): string {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead.';
    case 'auth/weak-password':
      return 'That password is too weak. Use at least 8 characters with letters and numbers.';
    case 'permission-denied':
      return 'Your details could not be saved. Check the mobile number and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.';
    case 'auth/network-request-failed':
      return 'Could not reach the server. Check your connection (and that the emulators are running).';
    case 'auth/account-exists-with-different-credential':
      return 'This email already uses a password sign-in. Sign in with your password instead.';
    case 'tubigtala/google-unavailable':
      return 'Google sign-in is not available in this version of the app yet. Use email and password.';
    case 'PLAY_SERVICES_NOT_AVAILABLE':
      return 'Google Play services is missing or out of date on this phone.';
    case 'IN_PROGRESS':
      return 'Google sign-in is already in progress.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}
