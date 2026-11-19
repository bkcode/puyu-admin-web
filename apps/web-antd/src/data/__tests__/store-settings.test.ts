import { beforeEach, expect, it, vi } from 'vitest';

import { merchantStoreSettingsService as service } from '../../application/merchantStoreSettingsService';
import { CacherManager } from '../../infrastructure/cache/cacherManager';
import { permission } from '../../infrastructure/permission/permission';
import { getAdminMenusByRole } from '../../router/routes/modules/puyu-admin';
import { PermissionDataService } from '../permissionDataService';
import { configureRealTokenProvider } from '../realAdminApi';
const fetchMock = vi.fn();
const ok = (data: unknown) => Response.json({ code: 0, data, msg: 'ok' });
beforeEach(() => {
  CacherManager.logoutClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  configureRealTokenProvider(() => 'isolated-token');
});
it('sends only frozen own-store boolean version and request ID and verifies ACK', async () => {
  fetchMock.mockResolvedValueOnce(
    ok({ requestId: 'command-1', appliedVersion: 5 }),
  );
  await service.save({
    requestId: 'command-1',
    version: 4,
    bannerDisplayEnabled: false,
    merchantId: '999',
  } as any);
  expect(fetchMock.mock.calls[0]?.[0]).toBe(
    '/admin-api/v1/business/merchant-store-settings',
  );
  expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({
    requestId: 'command-1',
    version: 4,
    bannerDisplayEnabled: false,
  });
  fetchMock.mockResolvedValueOnce(
    ok({ requestId: 'wrong', appliedVersion: 5 }),
  );
  await expect(
    service.save({
      requestId: 'command-1',
      version: 4,
      bannerDisplayEnabled: false,
    }),
  ).rejects.toThrow('回执不一致');
});
it('rejects malformed settings and boolean input before sending writes', async () => {
  for (const value of ['false', null, 0])
    await expect(
      service.save({
        requestId: 'x',
        version: 0,
        bannerDisplayEnabled: value,
      } as any),
    ).rejects.toThrow('参数无效');
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValueOnce(
    ok({ merchantId: '9', version: 0, bannerDisplayEnabled: 'false' }),
  );
  await expect(service.get()).rejects.toThrow('返回格式无效');
});
it('only persisted merchant receives the fixed settings permission and menu', async () => {
  fetchMock.mockResolvedValueOnce(
    ok({ userId: '17', role: 'MERCHANT', merchantId: '9' }),
  );
  await PermissionDataService.loadCurrentUserPermissions();
  expect(permission.canManageStoreSettings()).toBe(true);
  expect(JSON.stringify(getAdminMenusByRole('merchant'))).toContain(
    'merchant-store-settings',
  );
  CacherManager.logoutClear();
  fetchMock.mockResolvedValueOnce(
    ok({ userId: '1', role: 'PLATFORM', merchantId: null }),
  );
  await PermissionDataService.loadCurrentUserPermissions();
  expect(permission.canManageStoreSettings()).toBe(false);
  expect(JSON.stringify(getAdminMenusByRole('platform'))).not.toContain(
    'merchant-store-settings',
  );
});
