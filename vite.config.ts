import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

// Use the same install metadata in development and production.
const appManifest = JSON.parse(readFileSync(new URL("./public/manifest.webmanifest", import.meta.url), "utf8"));

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const workerSecret = env.WHATSAPP_WORKER_API_SECRET?.trim();
  const workerUrl = env.WHATSAPP_WORKER_URL?.trim() || "http://127.0.0.1:5000";
  const confirmationSupabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").trim();
  if (command === "serve" && !workerSecret) {
    throw new Error("WHATSAPP_WORKER_API_SECRET is required for the server-side WhatsApp worker proxy");
  }
  if (command === "serve") {
    console.info(`[Vite] WhatsApp worker proxy target: ${new URL(workerUrl).origin}`);
  }

  return {
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: null,
      devOptions: {
        enabled: false, // Disabled in development to prevent API caching issues
        type: "module",
      },
      includeAssets: [
        "favicon.png",
        "apple-touch-icon.png",
        "maskable-icon-512.png",
        "offline.html"
      ],
      manifest: appManifest,
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        // These large, route-only bundles are cached on first use by the
        // runtime StaleWhileRevalidate route below. Keeping them out of the
        // install precache prevents a service-worker update from downloading
        // several megabytes while the user is actively using another page.
        globIgnores: [
          "**/LiveGlobe-*.js",
          "**/vendor-charts-*.js",
          "**/vendor-utils-*.js",
          "**/html2canvas-*.js",
        ],
        maximumFileSizeToCacheInBytes: 4000000,
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replace(/\\/g, '/');

          if (
            moduleId.includes('/node_modules/react/') ||
            moduleId.includes('/node_modules/react-dom/') ||
            moduleId.includes('/node_modules/react-router/') ||
            moduleId.includes('/node_modules/react-router-dom/')
          ) return 'vendor-react';
          if (moduleId.includes('/node_modules/@supabase/')) return 'vendor-supabase';
          if (moduleId.includes('/node_modules/framer-motion/')) return 'vendor-motion';
          if (moduleId.includes('/node_modules/lucide-react/')) return 'vendor-icons';
          if (
            moduleId.includes('/node_modules/recharts/') ||
            moduleId.includes('/node_modules/echarts/')
          ) return 'vendor-charts';
          if (
            moduleId.includes('/node_modules/three/') ||
            moduleId.includes('/node_modules/react-globe.gl/') ||
            moduleId.includes('/node_modules/three-stdlib/')
          ) return 'vendor-3d';
          if (
            moduleId.includes('/node_modules/html2canvas/') ||
            moduleId.includes('/node_modules/write-excel-file/') ||
            moduleId.includes('/node_modules/jszip/') ||
            moduleId.includes('/node_modules/jspdf/')
          ) return 'vendor-utils';
          return undefined;
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
    proxy: {
      ...(confirmationSupabaseUrl ? {
        '/api/confirmation/save-items': {
          target: new URL(confirmationSupabaseUrl).origin,
          changeOrigin: true,
          secure: true,
          proxyTimeout: 12000,
          timeout: 12000,
          rewrite: () => '/rest/v1/rpc/save_confirmation_order_with_items_v1',
        },
        '/api/confirmation/save': {
          target: new URL(confirmationSupabaseUrl).origin,
          changeOrigin: true,
          secure: true,
          proxyTimeout: 12000,
          timeout: 12000,
          rewrite: () => '/rest/v1/rpc/save_confirmation_order_with_lease_v1',
        },
      } : {}),
      '/api/whatsapp-worker': {
        target: workerUrl,
        changeOrigin: true,
        proxyTimeout: 30000,
        timeout: 30000,
        rewrite: (path) => path.replace(/^\/api\/whatsapp-worker/, ''),
        headers: { Authorization: `Bearer ${workerSecret}` },
        configure: (proxy) => {
          proxy.on('proxyReq', (_proxyReq, req) => {
            console.info(`[WhatsApp worker proxy] ${req.method} ${req.url} -> ${workerUrl}`);
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.info(`[WhatsApp worker proxy] upstream ${proxyRes.statusCode} ${req.method} ${req.url}`);
          });
          proxy.on('error', (error, req) => {
            console.error(`[WhatsApp worker proxy] upstream error ${req.method} ${req.url}: ${error.message}`);
          });
        },
      },
      '/api-ozon': {
        target: 'https://api.ozonexpress.ma',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-ozon/, '')
      }
    }
  },
  };
});
