import type { RouteRecordRaw } from 'vue-router';

import type { MenuRecordRaw } from '@vben/types';

import { isRealAdmin } from '#/data/realAdminApi';
import { PuyuAdminPageDefinitions } from '#/ui/pc-web-a/routes/pageDefinitions';

const PuyuAdminPage = isRealAdmin
  ? () => import('#/views/puyu-admin/real-page.vue')
  : () => import('#/views/puyu-admin/page.vue');
export const realPageIds = new Set([
  'brand-form',
  'brand-list',
  'cooperation-detail',
  'cooperation-list',
  'cooperation-qrcode',
  'inventory-list',
  'merchant-dashboard',
  'merchant-workorder-detail',
  'merchant-workorder-form',
  'merchant-workorder-list',
  'order-management',
  'platform-billing-management',
  'platform-brand-management',
  'platform-category-form',
  'platform-category-review',
  'platform-credit-management',
  'platform-credit-recharge',
  'platform-dashboard',
  'platform-designer-detail',
  'platform-designer-list',
  'platform-designer-onboarding',
  'platform-merchant-detail',
  'platform-merchant-form',
  'platform-merchant-list',
  'platform-product-management',
  'platform-system-settings',
  'platform-ticket-detail',
  'platform-ticket-list',
  'product-category-list',
  'product-detail',
  'product-form',
  'product-list',
]);

export type AdminRole = 'merchant' | 'platform';

function pageRoute(page: (typeof PuyuAdminPageDefinitions)[number]) {
  return {
    name: `PuyuAdmin_${page.id}`,
    path: page.path,
    component: PuyuAdminPage,
    meta: {
      page,
      title: page.title,
      permissionMethod: 'canViewPage',
      ...(isRealAdmin
        ? { authority: [page.group === '平台后台' ? 'platform' : 'merchant'] }
        : {}),
    },
  };
}

function menuGroup(
  name: string,
  path: string,
  title: string,
  pageIds: string[],
) {
  return {
    name,
    path,
    meta: { title },
    children: pageIds
      .map((id) => PuyuAdminPageDefinitions.find((page) => page.id === id))
      .filter((page): page is (typeof PuyuAdminPageDefinitions)[number] =>
        Boolean(page),
      )
      .map((page) => pageRoute(page)),
  };
}

function requiredPage(id: string) {
  const page = PuyuAdminPageDefinitions.find((entry) => entry.id === id);
  if (!page) throw new Error(`Missing puyu-admin page definition: ${id}`);
  return page;
}

const platformDashboardPage = requiredPage('platform-dashboard');
const merchantDashboardPage = requiredPage('merchant-dashboard');

const platformMenu = [
  {
    ...pageRoute(platformDashboardPage),
    name: 'PuyuAdminPlatformOverview',
    path: 'platform/overview/platform-dashboard',
    meta: {
      icon: 'lucide:layout-dashboard',
      page: platformDashboardPage,
      permissionMethod: 'canViewPage',
      title: '首页统计',
    },
  },
  menuGroup('PuyuAdminPlatformMerchants', 'platform/merchants', '商户管理', [
    'platform-merchant-list',
    'platform-merchant-detail',
    'platform-merchant-form',
  ]),
  menuGroup('PuyuAdminPlatformDesigners', 'platform/designers', '设计师管理', [
    'platform-designer-list',
    'platform-designer-detail',
    'platform-designer-onboarding',
  ]),
  menuGroup('PuyuAdminPlatformCategories', 'platform/categories', '分类管理', [
    'platform-category-review',
    'platform-category-form',
  ]),
  menuGroup('PuyuAdminPlatformProducts', 'platform/products', '商品管理', [
    'platform-product-management',
  ]),
  menuGroup('PuyuAdminPlatformBrands', 'platform/brands', '品牌管理', [
    'platform-brand-management',
  ]),
  menuGroup('PuyuAdminPlatformWorkorders', 'platform/workorders', '工单管理', [
    'platform-ticket-list',
    'platform-ticket-detail',
  ]),
  menuGroup('PuyuAdminPlatformCredits', 'platform/credits', '积分 / 代币管理', [
    'platform-credit-management',
    'platform-credit-recharge',
    'platform-billing-management',
  ]),
  menuGroup('PuyuAdminPlatformSettings', 'platform/settings', '系统设置', [
    'platform-system-settings',
  ]),
];

const merchantMenu = [
  {
    ...pageRoute(merchantDashboardPage),
    name: 'PuyuAdminMerchantOverview',
    path: 'merchant/overview/merchant-dashboard',
    meta: {
      title: '首页统计',
      icon: 'lucide:layout-dashboard',
      page: merchantDashboardPage,
      permissionMethod: 'canViewPage',
      ...(isRealAdmin ? { authority: ['merchant'] } : {}),
    },
  },
  menuGroup(
    'PuyuAdminMerchantCooperation',
    'merchant/cooperation',
    '合作关系',
    ['cooperation-list', 'cooperation-detail', 'cooperation-qrcode'],
  ),
  menuGroup('PuyuAdminMerchantCatalog', 'merchant/catalog', '商品与品牌', [
    'product-category-list',
    'brand-list',
    'brand-form',
    'product-list',
    'product-detail',
    'product-form',
  ]),
  menuGroup('PuyuAdminMerchantInventory', 'merchant/inventory', '库存管理', [
    'inventory-list',
  ]),
  menuGroup('PuyuAdminMerchantOrders', 'merchant/orders', '订单管理', [
    'order-management',
  ]),
  menuGroup('PuyuAdminMerchantWorkorders', 'merchant/workorders', '工单管理', [
    'merchant-workorder-list',
    'merchant-workorder-detail',
    'merchant-workorder-form',
  ]),
];

function toMenuRecord(
  route: RouteRecordRaw,
  parentPath = '/admin',
): MenuRecordRaw {
  const routePath = String(route.path);
  const path = routePath.startsWith('/')
    ? routePath
    : `${parentPath}/${routePath}`.replaceAll('//', '/');
  const title = String(route.meta?.title ?? route.name ?? path);
  return {
    children: route.children?.map((child) => toMenuRecord(child, path)),
    name: title,
    path,
  };
}

export function getAdminMenusByRole(role: AdminRole): MenuRecordRaw[] {
  const routes = role === 'platform' ? platformMenu : merchantMenu;
  if (!isRealAdmin) return routes.map((route) => toMenuRecord(route));
  return routes
    .map((route) =>
      'children' in route
        ? {
            ...route,
            children: route.children.filter((child) =>
              realPageIds.has(child.meta.page.id),
            ),
          }
        : route,
    )
    .filter((route) => !('children' in route) || route.children.length > 0)
    .map((route) => toMenuRecord(route));
}

const routes: RouteRecordRaw[] = [
  {
    name: 'PuyuAdmin',
    path: '/admin',
    redirect: '/admin/platform/overview/platform-dashboard',
    meta: {
      icon: 'lucide:layout-dashboard',
      order: -20,
      title: '琢玉壹方后台',
    },
    children: [...platformMenu, ...merchantMenu],
  },
];

export default routes;
