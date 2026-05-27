import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function getDefaultGatewayHost() {
  try {
    const routeTable = readFileSync('/proc/net/route', 'utf-8');
    const defaultRoute = routeTable
      .split('\n')
      .slice(1)
      .map((line) => line.trim().split(/\s+/))
      .find((columns) => columns[1] === '00000000');

    if (!defaultRoute?.[2]) return 'localhost';

    const gatewayHex = defaultRoute[2];
    const octets = gatewayHex.match(/../g);
    if (!octets) return 'localhost';

    return octets.reverse().map((octet) => Number.parseInt(octet, 16)).join('.');
  } catch {
    return 'localhost';
  }
}

const ocrProxyTarget = process.env.OCR_API_PROXY_TARGET ?? `http://${getDefaultGatewayHost()}:8080`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    allowedHosts: ['firecloud64.synology.me', '.synology.me'],

    hmr: {
      protocol: 'wss',
      host: 'firecloud64.synology.me',
      clientPort: 5173
    },

    proxy: {
      '/ocr-api': {
        target: ocrProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ocr-api/, '')
      }
    },

    watch: {
      usePolling: true,
      interval: 500
    }
  }
});
