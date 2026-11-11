import { Buffer } from 'node:buffer';
import process from 'node:process';

import { defineConfig } from '@vben/vite-config';

import { allowLocalProxyRequest } from '../../tools/local-proxy-origin.ts';

export default defineConfig(async () => {
  return {
    application:
      process.env.VITE_PUYU_DATA_MODE === 'real' ? { nitroMock: false } : {},
    vite: {
      server: {
        proxy: {
          '/admin-api': {
            target: 'http://127.0.0.1:9988',
            changeOrigin: true,
            configure(proxy) {
              proxy.on('proxyReq', (request, incoming) => {
                if (!allowLocalProxyRequest(incoming.headers)) {
                  request.destroy(new Error('Local proxy origin rejected'));
                  return;
                }
                // Browser calls this same-origin Vite server; upstream sees a server-to-server request.
                request.removeHeader('Origin');
              });
            },
          },
          '/auth-api/v1/oauth2/token': {
            target: 'http://127.0.0.1:9988',
            changeOrigin: true,
            configure(proxy) {
              // Development-only confidential client bridge. Never expose this value through VITE_*.
              proxy.on('proxyReq', (request, incoming) => {
                if (!allowLocalProxyRequest(incoming.headers)) {
                  request.destroy(new Error('Local proxy origin rejected'));
                  return;
                }
                if (!process.env.PUYU_ADMIN_CLIENT_SECRET) {
                  request.destroy(
                    new Error('Local OAuth client secret is not configured'),
                  );
                  return;
                }
                request.removeHeader('Origin');
                request.setHeader(
                  'Authorization',
                  `Basic ${Buffer.from(`puyu-admin:${process.env.PUYU_ADMIN_CLIENT_SECRET}`).toString('base64')}`,
                );
              });
            },
          },
          '/api': {
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, ''),
            // mock代理目标地址
            target: 'http://localhost:5320/api',
            ws: true,
          },
        },
      },
    },
  };
});
