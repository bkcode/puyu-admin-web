import type { AdminPageDefinition } from '#/application/adminPageService';

const rows: Array<
  [string, string, AdminPageDefinition['group'], AdminPageDefinition['kind']]
> = [
  ['platform-dashboard', '平台首页', '平台后台', 'dashboard'],
  ['platform-merchant-list', '商户列表', '平台后台', 'list'],
  ['platform-merchant-detail', '商户详情', '平台后台', 'detail'],
  ['platform-merchant-form', '商户入驻', '平台后台', 'form'],
  ['platform-designer-list', '设计师列表', '平台后台', 'list'],
  ['platform-designer-detail', '设计师详情', '平台后台', 'detail'],
  ['platform-designer-onboarding', '设计师入驻', '平台后台', 'form'],
  ['platform-category-review', '分类审核', '平台后台', 'list'],
  ['platform-category-form', '分类处理', '平台后台', 'form'],
  ['platform-product-management', '平台商品管理', '平台后台', 'list'],
  ['platform-brand-management', '平台品牌管理', '平台后台', 'list'],
  ['platform-ticket-list', '平台工单列表', '平台后台', 'list'],
  ['platform-ticket-detail', '平台工单详情', '平台后台', 'detail'],
  ['platform-credit-management', '积分管理', '平台后台', 'list'],
  ['platform-credit-recharge', '积分充值', '平台后台', 'form'],
  ['platform-billing-management', '入账管理 / 月账目统计', '平台后台', 'list'],
  ['platform-system-settings', '系统设置', '平台后台', 'config'],
  ['cooperation-list', '合作关系列表', '商家后台', 'list'],
  ['merchant-dashboard', '商户首页', '商家后台', 'dashboard'],
  ['cooperation-detail', '合作关系详情', '商家后台', 'detail'],
  ['cooperation-qrcode', '合作二维码管理', '商家后台', 'config'],
  ['product-category-list', '商品分类管理', '商家后台', 'list'],
  ['brand-list', '品牌管理', '商家后台', 'list'],
  ['brand-form', '品牌新建 / 编辑', '商家后台', 'form'],
  ['product-list', '商品列表', '商家后台', 'list'],
  ['product-detail', '商品详情', '商家后台', 'detail'],
  ['product-form', '商品新建 / 编辑', '商家后台', 'form'],
  ['inventory-list', '库存列表', '商家后台', 'list'],
  ['order-management', '订单管理', '商家后台', 'list'],
  ['merchant-workorder-list', '商户工单列表', '商家后台', 'list'],
  ['merchant-workorder-detail', '商户工单详情', '商家后台', 'detail'],
  ['merchant-workorder-form', '新建工单', '商家后台', 'form'],
];

export const PuyuAdminPageDefinitions: AdminPageDefinition[] = rows.map(
  ([id, title, group, kind]) => ({ id, title, group, kind, path: id }),
);
