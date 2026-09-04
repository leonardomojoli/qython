/**
 * Firebase configuration for React Native.
 *
 * IMPORTANT: This file requires google-services.json to be placed at:
 *   packages/mobile/android/app/google-services.json
 *
 * Download it from: Firebase Console → Project qython-ai → Project Settings → Android app
 *
 * Google Sign-In also requires:
 * 1. SHA-1 fingerprint registered in Firebase Console
 * 2. Web client ID from Firebase Console → Authentication → Sign-in method → Google
 */

import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Web Client ID from Firebase Console (qython-ai project)
// Firebase Console → Authentication → Sign-in method → Google → Web client ID
const WEB_CLIENT_ID = ''; // TODO: Set from Firebase Console

export function configureGoogleSignIn() {
  if (!WEB_CLIENT_ID) {
    console.warn(
      '[Firebase] WEB_CLIENT_ID not configured. Google Sign-In will not work. ' +
      'Set it in src/services/firebase.ts from Firebase Console.',
    );
    return;
  }

  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    offlineAccess: true,
  });
}

export { WEB_CLIENT_ID };
