// frontend/src/firebaseConfig.js
/**
 * Firebase Configuration for Phone Authentication
 * 
 * This initializes the Firebase SDK for SMS verification.
 * Get these values from: Firebase Console → Project Settings → General → Your Apps
 */

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Firebase é opcional: só existe login com Google e verificação por SMS quando
// o projeto tem as chaves VITE_FIREBASE_*. Inicializar sem elas lança
// auth/invalid-api-key no import, e como Login e Register são importados no
// carregamento do app, a página inteira ficava em branco.
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;

// null quando o Firebase não está configurado; quem usa deve checar
// isFirebaseConfigured antes.
export const auth = app ? getAuth(app) : null;

// Configure language to user's device language for SMS messages
if (auth) auth.useDeviceLanguage();

export default app;
