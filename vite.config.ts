import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const workerSecret = env.WHATSAPP_WORKER_API_SECRET?.trim();
  const workerUrl = env.WHATSAPP_WORKER_URL?.trim();
  if (!workerUrl) {
    throw new Error("WHATSAPP_WORKER_URL must point to the production VPS worker");
  }
  if (/trycloudflare\.com|localhost|127\.0\.0\.1/i.test(workerUrl)) {
    throw new Error("WHATSAPP_WORKER_URL must be the current production VPS worker URL, not a local address or tunnel");
  }
  if (!workerSecret) {
    throw new Error("WHATSAPP_WORKER_API_SECRET is required for the server-side WhatsApp worker proxy");
  }
  console.info(`[Vite] WhatsApp worker proxy target: ${new URL(workerUrl).origin}`);

  return {
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
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
      manifest: {
        name: "EcomOS",
        short_name: "EcomOS",
        description: "Modern CRM for E-commerce",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        icons: [
          { src: "/icon-72.png", sizes: "72x72", type: "image/png" },
          { src: "/icon-96.png", sizes: "96x96", type: "image/png" },
          { src: "/icon-128.png", sizes: "128x128", type: "image/png" },
          { src: "/icon-144.png", sizes: "144x144", type: "image/png" },
          { src: "/icon-152.png", sizes: "152x152", type: "image/png" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-384.png", sizes: "384x384", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/maskable-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable any" }
        ]
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        maximumFileSizeToCacheInBytes: 4000000,
      },
    }),
  ],
  build: {
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
          if (moduleId.includes('/node_modules/recharts/')) return 'vendor-charts';
          if (moduleId.includes('/node_modules/lucide-react/')) return 'vendor-icons';
          if (
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
