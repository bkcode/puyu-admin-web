import type { PageResult } from './realAdminApi';

import { shanghaiDate } from '#/infrastructure/time/shanghaiTime';

import { adminRequest } from './realAdminApi';

export type DesignerInput = {
  avatarFileId: null | string;
  certificationFileIds: string[];
  city: string;
  cooperatingMerchantId: null | string;
  introduction: string;
  level: 'LEAD' | 'NORMAL' | 'SENIOR';
  loginPhone: string;
  name: string;
  phone: string;
  status: 'COOPERATING' | 'DISABLED' | 'PENDING';
  styles: string;
  wechatFileId: null | string;
};
export type Designer = {
  accountId: string;
  content: DesignerInput;
  createdAt: string;
  id: string;
  updatedAt: string;
  version: number;
};
export type Relation = {
  accountId: string;
  boundAt: string;
  enabled: boolean;
  id: string;
  lastVisitedAt: null | string;
  merchantId: string;
  modelPermission: boolean;
  name: string;
  partnerPriceVisible: boolean;
  phone: string;
  remark: string;
  type: 'DESIGNER' | 'PARTNER';
  version: number;
};
export type RelationInput = Pick<
  Relation,
  'enabled' | 'modelPermission' | 'partnerPriceVisible' | 'remark'
>;
export type Candidate = {
  accountId: string;
  existingRelationId: null | string;
  name: string;
  phone: string;
  type: Relation['type'];
};
export type Qr = {
  code: string;
  createdAt: string;
  enabled: boolean;
  expiresAt: null | string;
  id: string;
  merchantId: string;
  type: Relation['type'];
};
export type Event = {
  action: string;
  createdAt: string;
  id: string;
  operatorId: string;
  reason: string;
};
export type Visit = {
  createdAt: string;
  event: string;
  id: string;
  productId: null | string;
};
export type Scan = {
  accountId: string;
  boundAt: string;
  id: string;
  qrId: string;
  relationId: string;
  source: string;
};
export type ExportFile = {
  content: string;
  contentType: string;
  name: string;
  rowCount?: number;
};
export type CreditAccount = {
  accountId: string;
  balance: string;
  kind: 'DESIGNER' | 'MERCHANT';
  name: string;
};
export type CreditType = 'ADJUSTMENT' | 'GIFT' | 'MODEL_DOWNLOAD' | 'RECHARGE';
export type Ledger = {
  accountId: string;
  amount: string;
  balance: string;
  businessRef: string;
  createdAt: string;
  id: string;
  operatorId: string;
  reason: string;
  receivedAmount: null | string;
  type: CreditType;
  voucherFileId: null | string;
};
export type CreditInput = {
  accountId: null | string;
  amount: null | string;
  reason: string;
  receivedAmount: null | string;
  type: Exclude<CreditType, 'MODEL_DOWNLOAD'> | null;
  voucherFileId: null | string;
};
export type CreditDraft = {
  content: CreditInput;
  createdAt: string;
  id: string;
  ledgerId: null | string;
  status: 'CANCELLED' | 'DRAFT' | 'SUBMITTED';
  updatedAt: string;
  version: number;
};
export type CreditQuery = {
  accountId?: string;
  from?: string;
  to?: string;
  type?: CreditType;
};
export type BillInput = {
  amount: string;
  creditAmount: string;
  merchantId: string;
  method: 'BANK_TRANSFER' | 'FREE_ADJUSTMENT' | 'OFFLINE_OTHER';
  newServiceEnd: null | string;
  remark: string;
  type: 'CREDIT' | 'OTHER' | 'SERVICE';
  voucherFileId: null | string;
};
export type Bill = {
  code: string;
  content: BillInput;
  createdAt: string;
  creditLedgerId: null | string;
  id: string;
  oldServiceEnd: string;
  operatorId: string;
  receivedAt: null | string;
  status: 'CONFIRMED' | 'PENDING' | 'VOID';
  updatedAt: string;
  version: number;
};
export type Monthly = {
  confirmedAmount: string;
  confirmedCount: string;
  month: string;
  pendingAmount: string;
  pendingCount: string;
  voidAmount: string;
  voidCount: string;
};
export type Settings = {
  creditRulesSource: string;
  expiryReminderDays: number;
  menuMode: string;
  modelNamingInstructions: string;
  productReviewRequired: boolean;
  version: number;
};
export type DesignerOverview = {
  credits: {
    accountId: string;
    balance: string;
    totalAdjustment: string;
    totalConsumed: string;
    totalGift: string;
    totalRecharge: string;
  };
  designerId: string;
  merchants: {
    enabled: boolean;
    merchantAvailable: boolean;
    merchantId: string;
    modelPermission: boolean;
    name: string;
    partnerPriceVisible: boolean;
    relationId: string;
  }[];
  recentOperations: {
    action: string;
    createdAt: string;
    detail: string;
    id: string;
  }[];
  worksCount: null | string;
  worksCountStatus: string;
};
export type Todo = {
  dueDate: null | string;
  kind: string;
  merchantId: string;
  priority: string;
  referenceId: string;
  status: string;
  title: string;
};
export type ModelUsage = {
  confirmedAt: string;
  consumedCredits: string;
  fileId: string;
  freeUntil: string;
  freeUsed: number;
  merchantId: string;
  productId: string;
  totalDownloads: string;
};

export function businessId(value: string) {
  if (!/^[1-9]\d*$/.test(value)) throw new Error('记录标识无效');
  return value;
}
function page<T>(resource: string, query: object = {}, current = 1) {
  if (!Number.isInteger(current) || current < 1 || current > 1_000_000)
    throw new Error('分页无效');
  return adminRequest<PageResult<T>>(`/business/${resource}/page`, {
    page: current,
    pageSize: 20,
    query,
  });
}
const draft = (row: CreditDraft): CreditDraft => ({
  ...row,
  content: { ...row.content },
});
const bill = (row: Bill): Bill => ({
  ...row,
  oldServiceEnd: shanghaiDate(row.oldServiceEnd),
  content: {
    ...row.content,
    newServiceEnd: row.content.newServiceEnd
      ? shanghaiDate(row.content.newServiceEnd)
      : null,
  },
});
export const adminBusinessRepository = {
  designers: (query: object = {}, current = 1) =>
    page<Designer>('designers', query, current),
  designer: (id: string) =>
    adminRequest<Designer>(`/business/designers/${businessId(id)}`),
  saveDesigner: (content: DesignerInput, old?: Designer) =>
    old
      ? adminRequest<Designer>(
          `/business/designers/${businessId(old.id)}`,
          { version: old.version, content },
          'PUT',
        )
      : adminRequest<Designer>('/business/designers', content),
  designerOverview: (id: string) =>
    adminRequest<DesignerOverview>(
      `/business/designers/${businessId(id)}/overview`,
    ),
  designerRelations: (id: string) =>
    adminRequest<Relation[]>(
      `/business/designers/${businessId(id)}/relationships`,
    ),
  designerCreditSummaries: (profileIds: string[]) =>
    adminRequest<{ accountId: string; balance: string }[]>(
      '/business/designers/credit-summaries',
      { profileIds: profileIds.map((id) => businessId(id)) },
    ),
  relations: (query: object = {}, current = 1) =>
    page<Relation>('cooperation', query, current),
  relation: (id: string) =>
    adminRequest<Relation>(`/business/cooperation/${businessId(id)}`),
  lookup: (phone: string) =>
    adminRequest<Candidate | null>('/business/cooperation/lookup', { phone }),
  bind: (accountId: string) =>
    adminRequest<Relation>('/business/cooperation/bind', {
      accountId: businessId(accountId),
    }),
  createPartner: (name: string, phone: string) =>
    adminRequest<Relation>('/business/partners', { name, phone }),
  updateRelation: (old: Relation, content: RelationInput) =>
    adminRequest<Relation>(
      `/business/cooperation/${businessId(old.id)}`,
      { version: old.version, ...content },
      'PUT',
    ),
  visits: (id: string, current = 1) =>
    adminRequest<PageResult<Visit>>(
      `/business/cooperation/${businessId(id)}/visits`,
      { page: current, pageSize: 20, query: {} },
    ),
  qrs: () => adminRequest<Qr[]>('/business/cooperation-qrs'),
  createQr: (type: Qr['type'], expiresAt: null | string) =>
    adminRequest<Qr>('/business/cooperation-qrs', { type, expiresAt }),
  setQr: (id: string, enabled: boolean) =>
    adminRequest<Qr>(
      `/business/cooperation-qrs/${businessId(id)}`,
      { enabled },
      'PUT',
    ),
  qrImage: (id: string) =>
    adminRequest<ExportFile>(
      `/business/cooperation-qrs/${businessId(id)}/download`,
      {},
    ),
  qrScans: (id: string) =>
    adminRequest<Scan[]>(`/business/cooperation-qrs/${businessId(id)}/scans`),
  qrHistory: (id: string, current = 1) =>
    adminRequest<PageResult<Event>>(
      `/business/cooperation-qrs/${businessId(id)}/history`,
      { page: current, pageSize: 20, query: {} },
    ),
  creditAccounts: (query: object = {}, current = 1) =>
    page<CreditAccount>('credits/accounts', query, current),
  creditBalance: (accountId: string) =>
    adminRequest<CreditAccount>(
      `/business/credits/accounts/${businessId(accountId)}`,
    ),
  creditStatistics: () =>
    adminRequest<{
      date: string;
      todayRechargeCount: string;
      todayRechargedCredits: string;
      totalBalance: string;
    }>('/business/credits/statistics'),
  ledger: (query: CreditQuery = {}, current = 1) =>
    adminRequest<PageResult<Ledger>>('/business/credits/history', {
      page: current,
      pageSize: 20,
      query,
    }),
  exportLedger: (query: CreditQuery) =>
    adminRequest<ExportFile>('/business/credits/export', query),
  drafts: (query: object = {}, current = 1) =>
    page<CreditDraft>('credits/drafts', query, current),
  draft: async (id: string) =>
    draft(
      await adminRequest<CreditDraft>(
        `/business/credits/drafts/${businessId(id)}`,
      ),
    ),
  saveDraft: (requestId: string, content: CreditInput, old?: CreditDraft) =>
    adminRequest<CreditDraft>(
      old
        ? `/business/credits/drafts/${businessId(old.id)}`
        : '/business/credits/drafts',
      { requestId, content, ...(old ? { version: old.version } : {}) },
      old ? 'PUT' : 'POST',
    ),
  draftAction: (
    old: CreditDraft,
    action: 'cancel' | 'submit',
    requestId: string,
  ) =>
    adminRequest<CreditDraft>(
      `/business/credits/drafts/${businessId(old.id)}/${action}`,
      { requestId, version: old.version },
    ),
  bills: async (query: object = {}, current = 1) => {
    const result = await page<Bill>('bills', query, current);
    return { ...result, items: result.items.map(bill) };
  },
  bill: async (id: string) =>
    bill(await adminRequest<Bill>(`/business/bills/${businessId(id)}`)),
  saveBill: async (requestId: string, content: BillInput, old?: Bill) =>
    bill(
      await adminRequest<Bill>(
        old ? `/business/bills/${businessId(old.id)}` : '/business/bills',
        { requestId, content, ...(old ? { version: old.version } : {}) },
        old ? 'PUT' : 'POST',
      ),
    ),
  billAction: async (
    old: Bill,
    action: 'CONFIRM' | 'VOID',
    reason: string,
    receivedAt: null | string,
    requestId: string,
  ) =>
    bill(
      await adminRequest<Bill>(
        `/business/bills/${businessId(old.id)}/transition`,
        { requestId, version: old.version, action, reason, receivedAt },
      ),
    ),
  monthly: (month: string) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new Error('月份应为YYYY-MM');
    return adminRequest<Monthly>(`/business/bills/monthly/${month}`);
  },
  billHistory: (id: string) =>
    adminRequest<Event[]>(`/business/bills/${businessId(id)}/history`),
  settings: () => adminRequest<Settings>('/business/settings'),
  saveSettings: (
    value: Pick<
      Settings,
      | 'expiryReminderDays'
      | 'modelNamingInstructions'
      | 'productReviewRequired'
      | 'version'
    >,
  ) => adminRequest<Settings>('/business/settings', value, 'PATCH'),
  todos: (query: object = {}, current = 1) =>
    adminRequest<PageResult<Todo>>('/business/dashboard/todos', {
      page: current,
      pageSize: 20,
      query,
    }),
  models: (query: object = {}, current = 1) =>
    adminRequest<PageResult<ModelUsage>>('/business/models/usage', {
      page: current,
      pageSize: 20,
      query,
    }),
};
