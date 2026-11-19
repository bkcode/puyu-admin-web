import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  adminRequest,
  configureRealTokenProvider,
  realAuthApi,
} from '../realAdminApi';
import { requireValue } from './testAssertions';

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () =>
    Response.json({
      code: 0,
      data: { access_token: 'test-access', scope: 'profile' },
    }),
  );
  configureRealTokenProvider(() => 'test-access');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  configureRealTokenProvider(() => undefined);
});

describe('public production Gateway request construction', () => {
  it.each([
    'https://api.zyyfdesign.top',
    'https://api.zyyfdesign.top/',
    'https://api.zyyfdesign.top///',
  ])(
    'sends real business requests to the normalized production origin %s',
    async (origin) => {
      vi.stubEnv('PROD', true);
      vi.stubEnv('VITE_GLOB_API_URL', origin);
      await adminRequest('/business/dashboard');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.zyyfdesign.top/admin-api/v1/business/dashboard',
        expect.objectContaining({
          method: 'GET',
          headers: { Authorization: 'Bearer test-access' },
        }),
      );
    },
  );

  it('keeps development business traffic on the same-origin Vite proxy', async () => {
    vi.stubEnv('PROD', false);
    vi.stubEnv('VITE_GLOB_API_URL', 'https://api.zyyfdesign.top/');
    await adminRequest('/catalog/actor');
    expect(fetchMock).toHaveBeenCalledWith(
      '/admin-api/v1/catalog/actor',
      expect.any(Object),
    );
  });

  it.each([
    undefined,
    '',
    '/api',
    'http://api.zyyfdesign.top',
    'https://user:secret@api.zyyfdesign.top',
    'https://api.zyyfdesign.top/admin-api',
    'https://api.zyyfdesign.top/?target=other',
    'https://api.zyyfdesign.top/?',
    'https://api.zyyfdesign.top/#section',
    'https://api.zyyfdesign.top/#',
    String.raw`https://api.zyyfdesign.top\other`,
    'javascript:alert(1)',
    'https:api.zyyfdesign.top',
    'https://api.zyyfdesign.top/other/..',
    'https://api.zyy\tfdesign.top',
  ])(
    'rejects invalid production origin %s before sending bearer credentials',
    async (origin) => {
      vi.stubEnv('PROD', true);
      vi.stubEnv('VITE_GLOB_API_URL', origin);
      await expect(adminRequest('/business/dashboard')).rejects.toThrow(
        'HTTPS根origin',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('retains the same-origin server authentication bridge in production without browser credentials', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_GLOB_API_URL', 'https://api.zyyfdesign.top/');
    await realAuthApi.login('13900000001', 'test-password');
    const [url, request] = requireValue(fetchMock.mock.calls[0]);
    expect(url).toBe('/auth-api/v1/oauth2/token');
    expect(request.headers).toBeUndefined();
    expect([...request.body.keys()]).toEqual([
      'grant_type',
      'username',
      'password',
      'scope',
    ]);
    expect(request.body.has('client_secret')).toBe(false);
    expect(request.body.has('client_id')).toBe(false);
  });
});
