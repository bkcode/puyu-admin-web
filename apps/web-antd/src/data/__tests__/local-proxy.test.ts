import { describe, expect, it } from 'vitest';

import { allowLocalProxyRequest } from '../../../../../tools/local-proxy-origin';

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
