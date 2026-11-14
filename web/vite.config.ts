import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'InovInfo',
        short_name: 'InovInfo',
        description: 'Registro de visitas técnicas — Electroinova',
        start_url: '/',
        display: 'standalone',
        background_color: '#0F1722',
        theme_color: '#0F1722',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // iOS Safari necesita denylist explícito para no interceptar /api
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        globPatterns: ['**/*.{js,css,html,svg,woff2,json}'],
        // Incluir manifest.webmanifest en el precache
        additionalManifestEntries: [],
        runtimeCaching: [
          {
            // Cache catálogos — funciona offline
            urlPattern: /\/api\/catalogos\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'catalogos-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 7 * 24 * 60 * 60,
              },
            },
          },
          {
            // Cache estado de unidades — para NuevaVisita offline
            urlPattern: /\/api\/unidades\/estado/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'unidades-cache',
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 24 * 60 * 60,
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
