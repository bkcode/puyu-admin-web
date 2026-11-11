import {
  CacherManager,
  createCacher,
} from '#/infrastructure/cache/cacherManager';

import { isRealAdmin, realAuthApi } from './realAdminApi';

export type PermissionSnapshot = {
  appKey: string;
  menuKeys: string[];
  orgId?: string;
  userId: string;
};

const permissionSnapshot = createCacher<PermissionSnapshot>(
  `permission-snapshot-${isRealAdmin ? 'real' : 'mock'}`,
  { level: isRealAdmin ? 'instant' : 'local' },
);

const localPermissionSnapshot: PermissionSnapshot = {
  appKey: 'puyu-admin',
  userId: 'demo-admin',
  orgId: 'demo-merchant',
  menuKeys: ['*'],
};

export const PermissionDataService = {
  async loadCurrentUserPermissions() {
    if (isRealAdmin) {
      const actor = await realAuthApi.actor();
      const shared = ['page:view', 'product:list:view'];
      const menuKeys =
        actor.role === 'PLATFORM'
          ? [
              ...shared,
              'merchant:manage',
              'designer:manage',
              'credits:manage',
              'billing:manage',
              'settings:manage',
              'product:publish',
              'product:offline',
              'category:review',
              'workorder:process',
            ]
          : [
              ...shared,
              'cooperation:manage',
              'product:edit',
              'brand:edit',
              'category:edit',
              'catalog:submit',
              'inventory:manage',
              'order:manage',
              'workorder:submit',
            ];
      const snapshot: PermissionSnapshot = {
        appKey: 'puyu-admin',
        userId: actor.userId,
        orgId: actor.merchantId ?? undefined,
        menuKeys,
      };
      permissionSnapshot.set(snapshot);
      return snapshot;
    }
    const cached = permissionSnapshot.get();
    if (cached) return cached;
    permissionSnapshot.set(localPermissionSnapshot);
    return localPermissionSnapshot;
  },
  async refreshCurrentUserPermissions() {
    if (isRealAdmin) return this.loadCurrentUserPermissions();
    permissionSnapshot.set(localPermissionSnapshot);
    return localPermissionSnapshot;
  },
  hasMenuKey(menuKey: string) {
    const snapshot =
      permissionSnapshot.get() ??
      (isRealAdmin ? undefined : localPermissionSnapshot);
    return Boolean(
      snapshot?.menuKeys.includes('*') || snapshot?.menuKeys.includes(menuKey),
    );
  },
  clearCurrentUserPermissions() {
    CacherManager.logoutClear();
  },
};
