import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: {
          enabled: true,
        },
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'Zero Music - 音楽ストリーミング & 同時試聴',
          short_name: 'ZeroMusic',
          description: 'YouTube音源・同期歌詞・イコライザー・同時聴きルーム対応の次世代音楽ストリーミング',
          theme_color: '#070708',
          background_color: '#070708',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          globIgnores: ['**/assets/aistudio/**'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^https?:\/\/[^/]+\/api\/music\/audio-stream\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https?:\/\/[^/]+\/api\/podcasts\/proxy-audio.*/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/(i\.ytimg\.com|yt3\.googleusercontent\.com|lh3\.googleusercontent\.com|i\.scdn\.co)\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'artwork-images-cache',
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 250,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
                },
              },
            },
            {
              urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'unsplash-images',
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
                },
              },
            },
            {
              urlPattern: /^https?:\/\/[^/]+\/api\/shared-offline\/cover\/[^?#]+$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'shared-offline-covers-v1',
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 24 * 60 * 60, // 60 days
                },
              },
            },
            {
              urlPattern: /^https?:\/\/[^/]+\/api\/shared-offline\/file\/[^?#]+\?(?:.*&)?(?:download|dl)=1(?:&|$)/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https?:\/\/[^/]+\/api\/shared-offline\/file\/[^?#]+$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'shared-offline-audio-v2',
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 120,
                  maxAgeSeconds: 60 * 24 * 60 * 60, // 60 days
                },
              },
            },
            {
              urlPattern: /^https?:\/\/[^/]+\/api\/shared-offline$/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'shared-offline-catalog-cache',
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 30 * 24 * 60 * 60,
                },
              },
            },
            {
              urlPattern: /^https?:\/\/[^/]+\/api\/music\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-music-cache',
                cacheableResponse: {
                  statuses: [0, 200],
                },
                expiration: {
                  maxEntries: 150,
                  maxAgeSeconds: 7 * 24 * 60 * 60,
                },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
