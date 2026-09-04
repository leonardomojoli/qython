// src/config.js
// Centralized URL configuration for the web package.
// Reads from VITE_* environment variables at build/dev time.
// Falls back to qython.ai (canonical) when env vars are not set.
// qython.app and qython.com are Nginx 301 redirects to qython.ai.

const stripTrailingSlash = (url) => (url || '').replace(/\/$/, '');

// API base URL — e.g. "https://qython.ai/api" in prod, "http://localhost:3000/api" in dev.
export const API_URL = stripTrailingSlash(
  import.meta.env.VITE_API_URL || 'https://qython.ai/api'
);

// Canonical web origin (no /api suffix) — share links, deep links, static asset URLs.
// Backward-compat: prefers VITE_API_URL_FOR_STATIC_FILES (legacy name) over derivation.
export const WEB_URL = stripTrailingSlash(
  import.meta.env.VITE_API_URL_FOR_STATIC_FILES
  || API_URL.replace(/\/api\/?$/, '')
);

// Alias kept for backward compatibility with older imports.
export const API_STATIC_URL = WEB_URL;

// Latreo medical-verification SDK (drop-in widget loaded as an external <script>).
// Override with VITE_LATREO_SDK_URL if Latreo moves domains.
export const LATREO_SDK_URL = (
  import.meta.env.VITE_LATREO_SDK_URL
  || 'https://lastreo.com/dashboard/sdk/lastreo.js'
);
