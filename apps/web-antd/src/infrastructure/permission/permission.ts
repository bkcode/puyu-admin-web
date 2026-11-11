import { PermissionDataService } from '#/data/permissionDataService';
import {
  CacherManager,
  createCacher,
} from '#/infrastructure/cache/cacherManager';

import manifest from './manifest.json';

export type PermissionData = {
  labelKey: string;
  menuKey: string;
  name: string;
};

type PermissionDefinition = {
  labelKey?: string;
  menuKey?: string;
};

type PermissionChecker = {
  (showDetail?: boolean): boolean | PermissionData;
  labelKey: string;
  menuKey: string;
  methodName: string;
};

const permissionDefinitions: Record<string, PermissionDefinition | undefined> =
  Object.fromEntries(
    manifest.map((item) => [
      item.methodName,
      { menuKey: item.menuKey, labelKey: item.labelKey },
    ]),
  );

const parsedCache = new Map<string, { labelKey: string; menuKey: string }>();
const checkCachers: Record<
  string,
  ReturnType<typeof createCacher<boolean>>
> = {};

function resolve(methodName: string) {
  const cached = parsedCache.get(methodName);
  if (cached) return cached;
  const definition = permissionDefinitions[methodName];
  const parsed = {
    menuKey: definition?.menuKey ?? methodName,
    labelKey: definition?.labelKey ?? definition?.menuKey ?? methodName,
  };
  parsedCache.set(methodName, parsed);
  return parsed;
}

function createChecker(methodName: string): PermissionChecker {
  const checker = ((showDetail = false) => {
    const parsed = resolve(methodName);
    if (showDetail) {
      return {
        name: parsed.labelKey,
        menuKey: parsed.menuKey,
        labelKey: parsed.labelKey,
      };
    }
    const cacher = (checkCachers[methodName] ??= createCacher<boolean>(
      `permission-check:${methodName}`,
      { level: 'instant' },
    ));
    const cached = cacher.get();
    if (cached !== undefined) return cached;
    const result = PermissionDataService.hasMenuKey(parsed.menuKey);
    cacher.set(result);
    return result;
  }) as PermissionChecker;
  checker.methodName = methodName;
  checker.menuKey = resolve(methodName).menuKey;
  checker.labelKey = resolve(methodName).labelKey;
  return checker;
}

type PermissionFacade = {
  canEditBrand: PermissionChecker;
  canEditCategory: PermissionChecker;
  canEditProduct: PermissionChecker;
  canManageBilling: PermissionChecker;
  canManageCooperation: PermissionChecker;
  canManageCredits: PermissionChecker;
  canManageDesigners: PermissionChecker;
  canManageInventory: PermissionChecker;
  canManageMerchants: PermissionChecker;
  canManageOrders: PermissionChecker;
  canManageSettings: PermissionChecker;
  canOfflineProduct: PermissionChecker;
  canProcessWorkorder: PermissionChecker;
  canPublishProduct: PermissionChecker;
  canReviewCategory: PermissionChecker;
  canSubmitCatalog: PermissionChecker;
  canSubmitWorkorder: PermissionChecker;
  canViewPage: PermissionChecker;
  canViewProductList: PermissionChecker;
};

export const permission: PermissionFacade = {
  canManageDesigners: createChecker('canManageDesigners'),
  canManageCooperation: createChecker('canManageCooperation'),
  canManageCredits: createChecker('canManageCredits'),
  canManageBilling: createChecker('canManageBilling'),
  canManageSettings: createChecker('canManageSettings'),
  canManageInventory: createChecker('canManageInventory'),
  canManageOrders: createChecker('canManageOrders'),
  canSubmitWorkorder: createChecker('canSubmitWorkorder'),
  canManageMerchants: createChecker('canManageMerchants'),
  canEditCategory: createChecker('canEditCategory'),
  canSubmitCatalog: createChecker('canSubmitCatalog'),
  canViewPage: createChecker('canViewPage'),
  canViewProductList: createChecker('canViewProductList'),
  canEditProduct: createChecker('canEditProduct'),
  canPublishProduct: createChecker('canPublishProduct'),
  canOfflineProduct: createChecker('canOfflineProduct'),
  canReviewCategory: createChecker('canReviewCategory'),
  canEditBrand: createChecker('canEditBrand'),
  canProcessWorkorder: createChecker('canProcessWorkorder'),
};

export function resetPermissionChecks() {
  CacherManager.logoutClear();
}
