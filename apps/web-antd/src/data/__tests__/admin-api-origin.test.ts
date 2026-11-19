import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CacherManager } from '../../infrastructure/cache/cacherManager';
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
  CacherManager.logoutClear();
  fetchMock.mockImplementation(async () =>
    Response.json({
      code: 0,
      data: {
        access_token: 'test-access',
        refresh_token: 'test-refresh',
        scope: 'profile',
      },
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

  it('keeps business requests independent of the Auth origin', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_GLOB_API_URL', 'https://api.zyyfdesign.top');
    vi.stubEnv('VITE_AUTH_API_URL', 'invalid');
    await adminRequest('/catalog/actor');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.zyyfdesign.top/admin-api/v1/catalog/actor',
      expect.any(Object),
    );
  });
});

describe('independent production Auth password and refresh requests', () => {
  it.each([
    'https://auth.zyyfdesign.top',
    'https://auth.zyyfdesign.top/',
    'https://auth.zyyfdesign.top///',
  ])('uses normalized Auth origin %s for both grants', async (origin) => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_GLOB_API_URL', 'https://api.zyyfdesign.top/');
    vi.stubEnv('VITE_AUTH_API_URL', origin);
    expect(await realAuthApi.login('13900000001', 'test-password')).toEqual({
      accessToken: 'test-access',
    });
    const [url, request] = requireValue(fetchMock.mock.calls[0]);
    expect(url).toBe('https://auth.zyyfdesign.top/oauth2/token');
    expect(request.method).toBe('POST');
    expect(request.headers).toBeUndefined();
    expect(request.credentials).toBe('omit');
    expect(Object.fromEntries(request.body)).toEqual({
      grant_type: 'password',
      username: '13900000001',
      password: 'test-password',
      scope: 'profile',
    });

    fetchMock.mockResolvedValueOnce(
      Response.json({
        code: 0,
        data: {
          access_token: 'renewed-access',
          refresh_token: 'rotated-refresh',
        },
      }),
    );
    expect(await realAuthApi.refresh()).toEqual({
      data: 'renewed-access',
      status: 200,
    });
    const [refreshUrl, refreshRequest] = requireValue(fetchMock.mock.calls[1]);
    expect(refreshUrl).toBe('https://auth.zyyfdesign.top/oauth2/token');
    expect(refreshRequest.method).toBe('POST');
    expect(refreshRequest.headers).toBeUndefined();
    expect(refreshRequest.credentials).toBe('omit');
    expect(Object.fromEntries(refreshRequest.body)).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'test-refresh',
    });
    await realAuthApi.refresh();
    expect(
      Object.fromEntries(requireValue(fetchMock.mock.calls[2])[1].body),
    ).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'rotated-refresh',
    });
  });

  it('keeps development password and refresh on the Vite proxy despite invalid public origins', async () => {
    vi.stubEnv('PROD', false);
    vi.stubEnv('VITE_GLOB_API_URL', 'invalid');
    vi.stubEnv('VITE_AUTH_API_URL', 'invalid');
    await realAuthApi.login('13900000001', 'test-password');
    await realAuthApi.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, request] of fetchMock.mock.calls) {
      expect(url).toBe('/auth-api/v1/oauth2/token');
      expect(request.method).toBe('POST');
      expect(request.headers).toBeUndefined();
      expect(request.credentials).toBe('omit');
    }
  });

  it.each([
    undefined,
    '',
    '/auth-api',
    'http://auth.zyyfdesign.top',
    'https://user:secret@auth.zyyfdesign.top',
    'https://auth.zyyfdesign.top/oauth2/token',
    'https://auth.zyyfdesign.top/?target=other',
    'https://auth.zyyfdesign.top/?',
    'https://auth.zyyfdesign.top/#section',
    'https://auth.zyyfdesign.top/#',
    String.raw`https://auth.zyyfdesign.top\other`,
    'javascript:alert(1)',
    'https:auth.zyyfdesign.top',
    'https://auth.zyyfdesign.top/other/..',
    'https://auth.zyy\tfdesign.top',
  ])(
    'rejects invalid Auth origin %s before sending passwords or refresh tokens',
    async (origin) => {
      vi.stubEnv('PROD', true);
      vi.stubEnv('VITE_GLOB_API_URL', 'https://api.zyyfdesign.top');
      vi.stubEnv('VITE_AUTH_API_URL', origin);
      await expect(
        realAuthApi.login('13900000001', 'test-password'),
      ).rejects.toThrow('正式Auth地址');
      expect(fetchMock).not.toHaveBeenCalled();
      vi.stubEnv('VITE_AUTH_API_URL', 'https://auth.zyyfdesign.top');
      await realAuthApi.login('13900000001', 'test-password');
      fetchMock.mockClear();
      vi.stubEnv('VITE_AUTH_API_URL', origin);
      await expect(realAuthApi.refresh()).rejects.toThrow('正式Auth地址');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('does not fall back to the API origin and does not require it for Auth', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_GLOB_API_URL', undefined);
    vi.stubEnv('VITE_AUTH_API_URL', 'https://auth.zyyfdesign.top');
    await realAuthApi.login('13900000001', 'test-password');
    await realAuthApi.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(
        ([url]) => url === 'https://auth.zyyfdesign.top/oauth2/token',
      ),
    ).toBe(true);
    await expect(adminRequest('/catalog/actor')).rejects.toThrow('正式API地址');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
