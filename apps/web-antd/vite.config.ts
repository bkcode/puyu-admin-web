import { Buffer } from 'node:buffer';
import process from 'node:process';

import { defineConfig } from '@vben/vite-config';

import {
  allowLocalTokenRequest,
  localGatewayTarget,
} from '../../tools/local-gateway-target.ts';
import { allowLocalProxyRequest } from '../../tools/local-proxy-origin.ts';

export default defineConfig(async () => {
  const realMode = process.env.VITE_PUYU_DATA_MODE === 'real';
  // Trusted startup environment only; never expose the target through VITE_*.
  const gatewayTarget = localGatewayTarget(
    realMode ? process.env.PUYU_GATEWAY_URL : undefined,
  );
  return {
    application: realMode ? { nitroMock: false } : {},
    vite: {
      server: {
        proxy: {
          '/admin-api': {
            target: gatewayTarget,
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
            target: gatewayTarget,
            changeOrigin: true,
            // Vite matches proxy keys by prefix; reject before creating an upstream request.
            bypass(incoming) {
              return allowLocalTokenRequest(incoming) ? undefined : false;
            },
            configure(proxy) {
              // Development-only confidential client bridge. Never expose this value through VITE_*.
              proxy.on('proxyReq', (request, incoming) => {
                if (!allowLocalTokenRequest(incoming)) {
                  request.destroy(
                    new Error('Local token proxy request rejected'),
                  );
                  return;
                }
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
