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
        // Code-splitting configuration
        rollupOptions: {
            output: {
                manualChunks: {
                    // Vendor chunks - libraries that rarely change
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    'vendor-firebase': ['firebase/app', 'firebase/auth'],
                    'vendor-ui': [
                        '@fortawesome/fontawesome-svg-core',
                        '@fortawesome/free-solid-svg-icons',
                        '@fortawesome/free-brands-svg-icons',
                        '@fortawesome/react-fontawesome'
                    ],
                    'vendor-utils': ['axios', 'i18next', 'react-i18next', 'marked'],
                    // Heavy libraries in separate chunks for lazy loading
                    'vendor-reactflow': ['reactflow'],
                    'vendor-pdf': ['react-pdf', 'pdfjs-dist'],
                    'vendor-charts': ['recharts'],
                    'vendor-audio': ['wavesurfer.js'],
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
    // Allow JSX in .js files (CRA compatibility)
    esbuild: {
        loader: 'jsx',
        include: /src\/.*\.js$/,
        exclude: [],
    },
    optimizeDeps: {
        esbuildOptions: {
            loader: {
                '.js': 'jsx',
            },
        },
    },
    };
});
