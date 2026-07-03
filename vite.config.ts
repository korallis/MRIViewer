import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { aiProxyPlugin } from './src/server/aiProxy';

// Production-only strict CSP: blocks every external origin at runtime.
// Not applied in dev — the HMR websocket needs looser rules (PLAN §9).
const csp = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

const strictCsp: PluginOption = {
  name: 'strict-csp',
  apply: 'build',
  transformIndexHtml(html: string) {
    return {
      html,
      tags: [
        {
          tag: 'meta',
          injectTo: 'head-prepend' as const,
          attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
        },
      ],
    };
  },
};

export default defineConfig({
  base: './',
  plugins: [react(), strictCsp, aiProxyPlugin()],
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
