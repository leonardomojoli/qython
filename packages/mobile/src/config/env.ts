// packages/mobile/src/config/env.ts
// Centralized URL configuration for the mobile app.
//
// Constants are baked into the JS bundle at build time. To change the
// production URL after release you need to ship a new build (or wire up
// a runtime config service later — react-native-config is the standard
// option but adds native build setup, so we keep this lightweight for now).

const PROD_WEB_BASE = 'https://qython.ai';

// Android emulator → host machine. iOS simulator uses localhost.
// Switch this constant if you need to point the dev build elsewhere.
const DEV_WEB_BASE = 'http://10.0.2.2:8000';

const webBase = __DEV__ ? DEV_WEB_BASE : PROD_WEB_BASE;

export const WEB_BASE_URL = webBase;
export const API_BASE_URL = `${webBase}/api`;
export const WS_BASE_URL = webBase.replace(/^https?:\/\//, (m) =>
  m === 'https://' ? 'wss://' : 'ws://',
);

// Cloudflare Turnstile public site key (same value as web VITE_CLOUDFLARE_SITE_KEY).
// Public by design — rendered client-side. The widget validates the document
// origin against this key's allowed domains, so the WebView always loads the
// challenge with baseUrl = TURNSTILE_ORIGIN (the canonical allowed domain),
// regardless of which API host the build points at.
export const CLOUDFLARE_TURNSTILE_SITE_KEY = '0x4AAAAAACJGbI2x2Yd9UICp';
export const TURNSTILE_ORIGIN = 'https://qython.ai';
