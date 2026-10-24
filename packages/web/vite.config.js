// frontend/vite.config.js
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');

    // Resolve API origin for Service Worker cache patterns and dev proxy.
    // Defaults to canonical (qython.ai). qython.app/qython.com are Nginx 301 redirects.
    const apiUrl = env.VITE_API_URL || 'https://qython.ai/api';

    // VITE_API_URL aceita duas formas: absoluta (https://host/api) ou relativa
    // (/api), usada quando o front e a API compartilham a mesma origem — o caso
    // do docker-compose, em que o nginx faz o proxy. new URL() lança
    // "Invalid URL" na forma relativa, então o formato decide cada derivação.
    const apiIsAbsolute = /^https?:\/\//i.test(apiUrl);

    // Alvo do proxy do servidor de desenvolvimento. Com API relativa não há
    // host a derivar, então aponta para o backend local.
    const backendOrigin = env.VITE_API_URL_FOR_STATIC_FILES
        || (apiIsAbsolute ? apiUrl.replace(/\/api\/?$/, '') : 'http://localhost:8000');

    // Padrão de host para o runtime caching do Service Worker. Na mesma origem
    // qualquer host serve: o SW só intercepta requests da própria origem.
    const apiHostPattern = apiIsAbsolute
        ? `^https?://${new URL(apiUrl).host.replace(/\./g, '\\.')}/api`
        : '^https?://[^/]+/api';

    return {
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,svg,woff,woff2}'],
                globIgnores: ['**/achievements/**'],
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
                skipWaiting: true,
                clientsClaim: true,
                runtimeCaching: [
                    {
                        urlPattern: new RegExp(`${apiHostPattern}/(?:medications|pharmacy/medications)`),
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'medications-cache',
                            expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
                        },
                    },
                    {
                        urlPattern: new RegExp(`${apiHostPattern}/(?:medications/check-interactions|pharmacy/medications/check-interactions)`),
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'interactions-cache',
                            expiration: { maxEntries: 20, maxAgeSeconds: 86400 },
                        },
                    },
                    {
                        urlPattern: new RegExp(`${apiHostPattern}/`),
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'api-cache',
                            expiration: { maxEntries: 100, maxAgeSeconds: 3600 },
                            networkTimeoutSeconds: 10,
                        },
                    },
                ],
                // SPA fallback: every client-side route (e.g. /encarregado,
                // /privacy-policy) must resolve to the app shell so React
                // Router can render it. Serving /offline.html here broke all
                // deep-links whenever the SW was active. index.html is in the
                // precache, so the app shell still loads when offline — the
                // app then shows its own "Modo offline" banner via navigator.onLine.
                navigateFallback: '/index.html',
                // Don't hijack navigations to backend-served paths.
                navigateFallbackDenylist: [/^\/api\//, /^\/static\//],
            },
            manifest: {
                id: '/',
                name: 'Qython — Copiloto Clínico',
                short_name: 'Qython',
                description: 'Copiloto clínico com IA para médicos',
                theme_color: '#1a1a2e',
                background_color: '#1a1a2e',
                display: 'standalone',
                scope: '/',
                start_url: '/',
                icons: [
                    { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
                    { src: '/assets/images/branding/qython-isotipo.png', sizes: '1024x1024', type: 'image/png', purpose: 'any maskable' },
                ],
            },
        }),
    ],
    build: {
        outDir: 'build',
        // Code-splitting. O Vite 8 (Rolldown) removeu o manualChunks em forma de
        // objeto; os mesmos grupos viram codeSplitting.groups, casados pelo caminho
        // em node_modules. Prioridade maior é avaliada antes.
        rolldownOptions: {
            output: {
                codeSplitting: {
                    groups: [
                        // Vendor chunks - libraries that rarely change
                        { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/, priority: 30 },
                        { name: 'vendor-firebase', test: /node_modules[\\/](firebase|@firebase)[\\/]/, priority: 20 },
                        { name: 'vendor-ui', test: /node_modules[\\/]@fortawesome[\\/]/, priority: 20 },
                        { name: 'vendor-utils', test: /node_modules[\\/](axios|i18next|react-i18next|marked)[\\/]/, priority: 20 },
                        // Heavy libraries in separate chunks for lazy loading
                        { name: 'vendor-reactflow', test: /node_modules[\\/](reactflow|@reactflow)[\\/]/, priority: 20 },
                        { name: 'vendor-pdf', test: /node_modules[\\/](react-pdf|pdfjs-dist)[\\/]/, priority: 20 },
                        { name: 'vendor-charts', test: /node_modules[\\/]recharts[\\/]/, priority: 20 },
                        { name: 'vendor-audio', test: /node_modules[\\/]wavesurfer\\.js[\\/]/, priority: 20 },
                    ],
                },
            },
        },
        // Increase chunk size warning limit
        chunkSizeWarningLimit: 600,
    },
    server: {
        port: 3000,
        host: 'localhost',
        proxy: {
            '/api': {
                target: backendOrigin,
                changeOrigin: true,
                secure: true,
            },
        },
    },
    // Os componentes usam .jsx. Até o Vite 7 o projeto mantinha JSX em .js
    // (herança do CRA) com loader do esbuild; o Vite 8 transforma com Oxc, que
    // decide a linguagem pela extensão, e esse arranjo deixou de funcionar.
    };
});
