// packages/mobile/src/config/env.ts
// Server URL configuration for the mobile app.
//
// There is no central server: each install talks to the doctor's own Qython
// backend, usually on the local network. The address is chosen at runtime on
// the login screen and persisted in MMKV. Always read it through the getters
// at the moment of use; a value copied into a module-level constant would
// keep pointing at the old server until the app restarts.

import { storage, STORAGE_KEYS } from '../services/storage';

// Dev builds fall back to the backend on the host machine (Android emulator →
// host is 10.0.2.2). Release builds start empty and ask for the address.
const DEV_DEFAULT_SERVER = 'http://10.0.2.2:8000';

// Public project site, used in share footers. Not the user's server: a LAN
// address means nothing to whoever receives the text, and shouldn't leak.
export const QYTHON_SITE_URL = 'https://qython.ai';

type ServerUrlListener = (url: string) => void;
const listeners = new Set<ServerUrlListener>();

/**
 * Turns what the user typed ("192.168.0.10:8080", "http://host/",
 * "https://host/api") into "scheme://host[:port][/path]" with no trailing
 * slash and no /api suffix. No scheme means http, the common case on a LAN.
 */
export function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!url) {
    return '';
  }
  const scheme = /^https?:\/\//i.exec(url);
  url = scheme ? scheme[0].toLowerCase() + url.slice(scheme[0].length) : `http://${url}`;
  return url.replace(/\/+$/, '').replace(/\/api$/i, '');
}

/** The configured server, or '' when none was set yet. */
export function getServerUrl(): string {
  return storage.getString(STORAGE_KEYS.SERVER_URL) ?? (__DEV__ ? DEV_DEFAULT_SERVER : '');
}

/** Saves the server (normalized) and notifies listeners if it changed. */
export function setServerUrl(input: string): string {
  const url = normalizeServerUrl(input);
  if (url === getServerUrl()) {
    return url;
  }
  if (url) {
    storage.set(STORAGE_KEYS.SERVER_URL, url);
  } else {
    storage.remove(STORAGE_KEYS.SERVER_URL);
  }
  listeners.forEach((listener) => listener(url));
  return url;
}

export function onServerUrlChange(listener: ServerUrlListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getApiBaseUrl(): string {
  return `${getServerUrl()}/api`;
}

// http → ws, https → wss
export function getWsBaseUrl(): string {
  return getServerUrl().replace(/^http/, 'ws');
}

export type ServerHealth = 'ok' | 'unreachable' | 'not-qython';

/**
 * GET <server>/api/health, which the backend answers with {"status":"ok"}.
 * Tells "nothing answered" apart from "something answered, but it isn't a
 * Qython server" (wrong port, router page, captive portal...).
 */
export async function checkServerHealth(input: string, timeoutMs = 8000): Promise<ServerHealth> {
  const url = normalizeServerUrl(input);
  if (!url) {
    return 'unreachable';
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let resp: Response;
  try {
    resp = await fetch(`${url}/api/health`, { signal: controller.signal });
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
  try {
    const data = await resp.json();
    return resp.ok && data?.status === 'ok' ? 'ok' : 'not-qython';
  } catch {
    return 'not-qython';
  }
}

// Cloudflare Turnstile public site key (same value as web VITE_CLOUDFLARE_SITE_KEY).
// Public by design — rendered client-side. The widget validates the document
// origin against this key's allowed domains, so the WebView always loads the
// challenge with baseUrl = TURNSTILE_ORIGIN (the canonical allowed domain),
// regardless of which API host the build points at.
export const CLOUDFLARE_TURNSTILE_SITE_KEY = '0x4AAAAAACJGbI2x2Yd9UICp';
export const TURNSTILE_ORIGIN = 'https://qython.ai';
