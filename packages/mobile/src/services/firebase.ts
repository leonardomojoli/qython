/**
 * Firebase configuration for React Native.
 *
 * Firebase is OPTIONAL. google-services.json (Android) and
 * GoogleService-Info.plist (iOS) are not in the repo, so a build from source
 * has no Firebase app: Google Sign-In and push notifications are simply
 * unavailable and everything else works. To enable them, place:
 *   packages/mobile/android/app/google-services.json
 *   packages/mobile/ios/QythonMobile/GoogleService-Info.plist
 *
 * Google Sign-In also requires:
 * 1. SHA-1 fingerprint registered in Firebase Console
 * 2. Web client ID from Firebase Console → Authentication → Sign-in method → Google
 */

import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Web Client ID from Firebase Console
// Firebase Console → Authentication → Sign-in method → Google → Web client ID
const WEB_CLIENT_ID = ''; // TODO: Set from Firebase Console

let firebaseConfigured: boolean | null = null;

/**
 * True when the native side initialized a default Firebase app, i.e. the
 * build shipped with google-services.json / GoogleService-Info.plist.
 * Without it every firebase module throws "No Firebase App '[DEFAULT]'".
 */
export function isFirebaseConfigured(): boolean {
  if (firebaseConfigured === null) {
    try {
      const { getApps } = require('@react-native-firebase/app');
      firebaseConfigured = getApps().length > 0;
    } catch {
      firebaseConfigured = false;
    }
  }
  return firebaseConfigured;
}

export function isGoogleSignInAvailable(): boolean {
  return !!WEB_CLIENT_ID && isFirebaseConfigured();
}

export function configureGoogleSignIn() {
  if (!isGoogleSignInAvailable()) {
    return;
  }

  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    offlineAccess: true,
  });
}

export { WEB_CLIENT_ID };
