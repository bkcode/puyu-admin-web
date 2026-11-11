import type { AdminPageDefinition } from '#/application/adminPageService';

export type AdminPageData = {
  metrics: Array<[string, string]>;
  rows: string[][];
};

export type AdminApiAdapter = {
  execute: (pageId: string, action: string) => Promise<unknown>;
  getPage: (page: AdminPageDefinition) => Promise<AdminPageData>;
};

const pageRows: Record<string, string[][]> = {
  'platform-merchant-list': [
    [
      '华美瓷砖',
      'M-1001',
      '经销商',
      '陈经理',
      '杭州',
      '2026-01-01 ~ 2026-12-31',
      '启用',
    ],
    [
      '锦程建材',
      'M-1002',
      '经销商',
      '周经理',
      '上海',
      '2026-02-15 ~ 2026-11-30',
      '启用',
    ],
  ],
  'platform-designer-list': [
    [
      '林予安',
      '主案',
      '138****9021',
      '杭州',
      '现代简约 / 奶油风',
      '锦程建材',
      '合作中',
    ],
    [
      '周若晴',
      '资深',
      '136****1108',
      '上海',
      '中古 / 轻法式',
      '华美瓷砖',
      '待审核',
    ],
    [
      '陈立',
      '资深',
      '139****7720',
      '苏州',
      '商业空间 / 轻奢',
      '森木家居',
      '合作中',
    ],
  ],
  'platform-product-management': [
    ['柔光大理石砖 800×800', '华美瓷砖', '待审核', '待处理'],
    ['智能恒温花洒套装', '锦程建材', '已发布', '已上架'],
  ],
  'platform-brand-management': [
    ['华美', '华美瓷砖', '待审核', '待处理'],
    ['锦程', '锦程建材', '已发布', '已发布'],
  ],
  'platform-category-review': [
    ['瓷砖 / 大理石砖', '华美瓷砖', '待审核', '待处理'],
    ['卫浴 / 智能马桶', '锦程建材', '已通过', '已展示'],
  ],
  'product-list': [
    ['柔光大理石砖 800×800', '瓷砖', '华美', '12', '待审核'],
    ['智能恒温花洒套装', '卫浴', '锦程', '6', '已发布'],
  ],
  'brand-list': [
    ['华美', '品牌-华美', '平台', '68', '已发布'],
    ['森木', '品牌-森木', '私有', '12', '待审核'],
  ],
  'inventory-list': [
    ['柔光大理石砖 800×800', 'SKU-800-W', '420', '充足'],
    ['智能恒温花洒套装', 'SKU-SH-001', '8', '低库存'],
  ],
  'order-management': [
    ['ORD-20260829-001', '华美瓷砖', '待确认', '¥12,800'],
    ['ORD-20260828-006', '锦程建材', '已核销', '¥4,280'],
  ],
  'merchant-workorder-list': [
    ['WO-20260829-001', '3D 模型制作', '柔光大理石砖', '处理中'],
    ['WO-20260827-008', '图片优化', '花洒套装', '待商户确认'],
  ],
  'platform-ticket-list': [
    ['WO-20260829-001', '3D 模型制作', '华美瓷砖', '待受理'],
    ['WO-20260827-008', '图片优化', '锦程建材', '处理中'],
  ],
};

const mockRows: Record<string, string[][]> = structuredClone(pageRows);

function pageMetrics(page: AdminPageDefinition): Array<[string, string]> {
  if (page.id === 'platform-dashboard')
    return [
      ['商户数量', '128'],
      ['设计师数量', '364'],
      ['商品数量', '1,248'],
      ['工单数量', '18'],
    ];
  if (page.kind === 'dashboard')
    return [
      ['商品数', '86'],
      ['订单数', '1,236'],
      ['客户数', '428'],
      ['模型文件使用', '3,860'],
    ];
  return [];
}

/**
 * Local adapter for the prototype. Replace this object with a Gateway/Admin
 * BFF adapter when puyu-bff-admin is implemented; callers do not change.
 */
export const localAdminApiAdapter: AdminApiAdapter = {
  async getPage(page) {
    return {
      rows: mockRows[page.id] ?? [],
      metrics: pageMetrics(page),
    };
  },
  async execute(pageId, action) {
    const rows = mockRows[pageId];
    const firstRow = rows?.[0];
    if (!firstRow) return { action, pageId, success: true };
    if (rows && action.startsWith('status:')) {
      const [, status] = action.split(':');
      const statusIndex =
        pageId === 'order-management' ? 2 : firstRow.length - 1;
      rows.forEach((row) => {
        row[statusIndex] = status ?? row[statusIndex] ?? '';
      });
    }
    if (rows && action.startsWith('offline:')) {
      const statusIndex =
        pageId === 'platform-product-management' ? 3 : firstRow.length - 1;
      rows.forEach((row) => (row[statusIndex] = '已下架'));
    }
    if (rows && action === 'publish') {
      const statusIndex =
        pageId === 'platform-product-management' ? 3 : firstRow.length - 1;
      rows.forEach((row) => (row[statusIndex] = '已发布'));
    }
    return { action, pageId, success: true };
  },
};
