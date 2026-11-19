import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ProxyOptions } from 'vite';

import { Buffer } from 'node:buffer';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { localGatewayTarget } from '../../../../../tools/local-gateway-target';
import { allowLocalProxyRequest } from '../../../../../tools/local-proxy-origin';

// Exercise the real application callback without loading Vben plugins or starting a server.
vi.mock('@vben/vite-config', () => ({
  defineConfig: (factory: unknown) => factory,
}));

async function developmentConfig() {
  // Keep the Node config outside the web composite TypeScript project's static imports.
  const configFile = '../../../vite.config.ts';
  const { default: viteConfig } = await import(configFile);
  if (typeof viteConfig !== 'function')
    throw new Error('Expected Vite factory');
  return (await viteConfig({ command: 'serve', mode: 'development' })) as {
    application: { nitroMock?: boolean };
    vite: { server: { proxy: Record<string, ProxyOptions> } };
  };
}

afterEach(() => vi.unstubAllEnvs());

function proxyHarness(options: ProxyOptions) {
  const events = new EventTarget();
  const proxy = {
    on(name: string, listener: (...args: unknown[]) => void) {
      events.addEventListener(name, (event) => {
        listener(...(event as CustomEvent<unknown[]>).detail);
      });
    },
  };
  options.configure?.(
    proxy as unknown as Parameters<NonNullable<ProxyOptions['configure']>>[0],
    options,
  );
  const request = {
    destroy: vi.fn(),
    removeHeader: vi.fn(),
    setHeader: vi.fn(),
  };
  return {
    request,
    forward: (incoming: IncomingMessage) =>
      events.dispatchEvent(
        new CustomEvent('proxyReq', { detail: [request, incoming] }),
      ),
  };
}

function tokenRequest(method: string, url: string): IncomingMessage {
  return {
    method,
    url,
    headers: {
      host: '127.0.0.1:5666',
      origin: 'http://127.0.0.1:5666',
      'sec-fetch-site': 'same-origin',
    },
  } as IncomingMessage;
}

async function tokenProxyFor(incoming: IncomingMessage) {
  vi.stubEnv('VITE_PUYU_DATA_MODE', 'real');
  vi.stubEnv('PUYU_GATEWAY_URL', 'https://gateway.example.test');
  vi.stubEnv('PUYU_ADMIN_CLIENT_SECRET', 'isolated-test-only-client-secret');
  const config = await developmentConfig();
  // Vite 8 matches plain proxy contexts with raw url.startsWith(context), not exact paths.
  const match = Object.entries(config.vite.server.proxy).find(([context]) =>
    incoming.url?.startsWith(context),
  );
  if (!match)
    throw new Error('Expected request to match the token proxy prefix');
  expect(match[0]).toBe('/auth-api/v1/oauth2/token');
  return match[1];
}

describe('fixed confidential token proxy boundary', () => {
  const invalidRequests = [
    ['POST', '/auth-api/v1/oauth2/token/other'],
    ['POST', '/auth-api/v1/oauth2/token-extra'],
    ['POST', '/auth-api/v1/oauth2/token?audience=other'],
    ['POST', '/auth-api/v1/oauth2/token?'],
    ['POST', '/auth-api/v1/oauth2/token%2fother'],
    ['POST', '/auth-api/v1/oauth2/token%3faudience=other'],
    ['POST', '/auth-api/v1/oauth2/token/'],
    ['GET', '/auth-api/v1/oauth2/token'],
    ['HEAD', '/auth-api/v1/oauth2/token'],
    ['OPTIONS', '/auth-api/v1/oauth2/token'],
    ['PUT', '/auth-api/v1/oauth2/token'],
    ['DELETE', '/auth-api/v1/oauth2/token'],
  ] as const;

  it.each(invalidRequests)(
    'bypasses %s %s before creating an upstream request',
    async (method, url) => {
      const incoming = tokenRequest(method, url);
      const options = await tokenProxyFor(incoming);
      const harness = proxyHarness(options);
      const bypass = await options.bypass?.(
        incoming,
        {} as ServerResponse,
        options,
      );
      if (bypass !== false) harness.forward(incoming);
      expect(bypass).toBe(false);
      expect(harness.request.setHeader).not.toHaveBeenCalled();
    },
  );

  it.each(invalidRequests)(
    'defensively rejects %s %s without injecting credentials',
    async (method, url) => {
      const incoming = tokenRequest(method, url);
      const options = await tokenProxyFor(incoming);
      const harness = proxyHarness(options);
      harness.forward(incoming);
      expect(harness.request.destroy).toHaveBeenCalledOnce();
      expect(harness.request.setHeader).not.toHaveBeenCalled();
      expect(harness.request.removeHeader).not.toHaveBeenCalled();
    },
  );

  it('still forwards an exact same-origin POST and injects only the server client credentials', async () => {
    const incoming = tokenRequest('POST', '/auth-api/v1/oauth2/token');
    const options = await tokenProxyFor(incoming);
    const harness = proxyHarness(options);
    expect(
      await options.bypass?.(incoming, {} as ServerResponse, options),
    ).toBeUndefined();
    harness.forward(incoming);
    expect(harness.request.destroy).not.toHaveBeenCalled();
    expect(harness.request.removeHeader).toHaveBeenCalledWith('Origin');
    expect(harness.request.setHeader).toHaveBeenCalledExactlyOnceWith(
      'Authorization',
      `Basic ${Buffer.from('puyu-admin:isolated-test-only-client-secret').toString('base64')}`,
    );
  });

  it('preserves the same-origin rejection for exact POST requests', async () => {
    const incoming = tokenRequest('POST', '/auth-api/v1/oauth2/token');
    const options = await tokenProxyFor(incoming);
    incoming.headers.origin = 'https://evil.example.test';
    const harness = proxyHarness(options);
    harness.forward(incoming);
    expect(harness.request.destroy).toHaveBeenCalledWith(
      new Error('Local proxy origin rejected'),
    );
    expect(harness.request.setHeader).not.toHaveBeenCalled();
  });

  it('still fails closed when the server client secret is absent', async () => {
    const incoming = tokenRequest('POST', '/auth-api/v1/oauth2/token');
    const options = await tokenProxyFor(incoming);
    vi.stubEnv('PUYU_ADMIN_CLIENT_SECRET', undefined);
    const harness = proxyHarness(options);
    harness.forward(incoming);
    expect(harness.request.destroy).toHaveBeenCalledWith(
      new Error('Local OAuth client secret is not configured'),
    );
    expect(harness.request.setHeader).not.toHaveBeenCalled();
  });
});

describe('trusted development Gateway target', () => {
  it('retains the local default and accepts explicit HTTP(S) origins', () => {
    expect(localGatewayTarget(undefined)).toBe('http://127.0.0.1:9988');
    expect(localGatewayTarget('http://192.0.2.45:9988/')).toBe(
      'http://192.0.2.45:9988',
    );
    expect(localGatewayTarget('https://gateway.example.test')).toBe(
      'https://gateway.example.test',
    );
  });
  it('rejects malformed, non-HTTP, credential-bearing and path targets', () => {
    for (const value of [
      '',
      'invalid',
      'file:///tmp/target',
      'ftp://example.test',
      'http://user:password@example.test',
      'http://@example.test',
      'http://example.test/api',
      'http://example.test/api/..',
      'http://example.test/./',
      'http://example.test//',
      'http://example.test/?target=other',
      'http://example.test/?',
      'http://example.test/#other',
      'http://example.test/#',
      String.raw`http:\example.test`,
      ' http://example.test',
    ])
      expect(() => localGatewayTarget(value)).toThrow(/PUYU_GATEWAY_URL/);
  });
});

describe('development proxy Gateway configuration', () => {
  it('keeps both real-mode Gateway proxies on the old loopback by default', async () => {
    vi.stubEnv('VITE_PUYU_DATA_MODE', 'real');
    vi.stubEnv('PUYU_GATEWAY_URL', undefined);
    const config = await developmentConfig();
    expect(config.application.nitroMock).toBe(false);
    expect(config.vite.server.proxy['/admin-api']?.target).toBe(
      'http://127.0.0.1:9988',
    );
    expect(config.vite.server.proxy['/auth-api/v1/oauth2/token']?.target).toBe(
      'http://127.0.0.1:9988',
    );
  });

  it.each(['http://192.0.2.45:9988', 'https://gateway.example.test'])(
    'maps both fixed real-mode Gateway proxies to %s',
    async (target) => {
      vi.stubEnv('VITE_PUYU_DATA_MODE', 'real');
      vi.stubEnv('PUYU_GATEWAY_URL', `${target}/`);
      const config = await developmentConfig();
      expect(config.vite.server.proxy['/admin-api']?.target).toBe(target);
      expect(
        config.vite.server.proxy['/auth-api/v1/oauth2/token']?.target,
      ).toBe(target);
      expect(Object.keys(config.vite.server.proxy)).toEqual([
        '/admin-api',
        '/auth-api/v1/oauth2/token',
        '/api',
      ]);
      expect(config.vite.server.proxy['/api']?.target).toBe(
        'http://localhost:5320/api',
      );
    },
  );

  it('rejects invalid real-mode configuration instead of silently using loopback', async () => {
    vi.stubEnv('VITE_PUYU_DATA_MODE', 'real');
    vi.stubEnv('PUYU_GATEWAY_URL', 'https://gateway.example.test/admin-api');
    await expect(developmentConfig()).rejects.toThrow(/PUYU_GATEWAY_URL/);
  });

  it('ignores the server override outside real mode and leaves Mock unchanged', async () => {
    vi.stubEnv('VITE_PUYU_DATA_MODE', 'mock');
    vi.stubEnv('PUYU_GATEWAY_URL', 'not-a-valid-origin');
    const config = await developmentConfig();
    expect(config.application).toEqual({});
    expect(config.vite.server.proxy['/admin-api']?.target).toBe(
      'http://127.0.0.1:9988',
    );
    expect(config.vite.server.proxy['/auth-api/v1/oauth2/token']?.target).toBe(
      'http://127.0.0.1:9988',
    );
    expect(config.vite.server.proxy['/api']?.target).toBe(
      'http://localhost:5320/api',
    );
  });
});

describe('local-only development proxy origin', () => {
  it('accepts exactly the loopback app and operator CLI', () => {
    expect(
      allowLocalProxyRequest({
        host: '127.0.0.1:5666',
        origin: 'http://127.0.0.1:5666',
        'sec-fetch-site': 'same-origin',
      }),
    ).toBe(true);
    expect(
      allowLocalProxyRequest({
        host: 'localhost:5666',
        origin: 'http://localhost:5666',
      }),
    ).toBe(true);
    expect(allowLocalProxyRequest({ host: '127.0.0.1:5666' })).toBe(true);
  });
  it('rejects other sites, ports, null origins and DNS rebinding hosts', () => {
    for (const origin of [
      'https://evil.test',
      'http://127.0.0.1:8082',
      'null',
      'http://127.0.0.1:5666.evil.test',
    ])
      expect(allowLocalProxyRequest({ host: '127.0.0.1:5666', origin })).toBe(
        false,
      );
    expect(allowLocalProxyRequest({ host: 'evil.test:5666' })).toBe(false);
    expect(
      allowLocalProxyRequest({
        host: '127.0.0.1:5666',
        'sec-fetch-site': 'cross-site',
      }),
    ).toBe(false);
  });
});
