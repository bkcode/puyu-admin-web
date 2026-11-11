import type {
  Bill,
  BillInput,
  CreditDraft,
  CreditInput,
  DesignerInput,
  Relation,
  Settings,
} from '../adminBusinessApi';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminBusinessService as service } from '../../application/adminBusinessService';
import { createOperationRequest } from '../../application/operationsService';
import { CacherManager } from '../../infrastructure/cache/cacherManager';
import { permission } from '../../infrastructure/permission/permission';
import {
  getAdminMenusByRole,
  realPageIds,
} from '../../router/routes/modules/puyu-admin';
import { adminBusinessRepository as api } from '../adminBusinessApi';
import { PermissionDataService } from '../permissionDataService';
import { configureRealTokenProvider } from '../realAdminApi';
import { requireValue } from './testAssertions';

const fetchMock = vi.fn();
const ok = (data: unknown) => Response.json({ code: 0, data, msg: 'ok' });
const designer: DesignerInput = {
  name: '设计师',
  loginPhone: '13900000008',
  level: 'SENIOR',
  avatarFileId: '9007199254740993',
  city: '上海',
  styles: '现代',
  phone: '13900000008',
  wechatFileId: null,
  introduction: '简介',
  certificationFileIds: ['9'],
  status: 'COOPERATING',
  cooperatingMerchantId: '22',
};
const credit: CreditInput = {
  accountId: '9007199254740993',
  type: 'RECHARGE',
  amount: '100',
  reason: '本机验证',
  voucherFileId: null,
  receivedAmount: '12345678901234.56',
};
const billInput: BillInput = {
  merchantId: '22',
  type: 'CREDIT',
  amount: '12345678901234.56',
  method: 'BANK_TRANSFER',
  remark: '线下入账',
  voucherFileId: null,
  newServiceEnd: null,
  creditAmount: '100',
};
const bill: Bill = {
  id: '7',
  code: 'BILL-7',
  content: billInput,
  oldServiceEnd: '2026-10-23',
  status: 'PENDING',
  receivedAt: null,
  creditLedgerId: null,
  version: 3,
  operatorId: '1',
  createdAt: '',
  updatedAt: '',
};
const body = () =>
  JSON.parse(requireValue(fetchMock.mock.calls.at(-1))[1].body);
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  configureRealTokenProvider(() => 'test');
  CacherManager.logoutClear();
  fetchMock.mockImplementation(async () => ok({}));
});
describe('admin business adapter and contract', () => {
  it('projects designer fields without accepting account or tenant overrides', async () => {
    await service.saveDesigner({
      ...designer,
      accountId: 'other',
      merchantId: 'other',
    } as DesignerInput);
    expect(requireValue(fetchMock.mock.calls[0])[0]).toBe(
      '/admin-api/v1/business/designers',
    );
    expect(body()).toEqual(designer);
    await service.saveDesigner(designer, { id: '8', version: 4 } as any);
    expect(requireValue(fetchMock.mock.calls[1])[1].method).toBe('PUT');
    expect(body()).toEqual({ version: 4, content: designer });
  });
  it('uses real server-side designer search and existing overview/relationships routes', async () => {
    await api.designers({ keyword: '上海', designerLevel: 'SENIOR' }, 3);
    expect(body()).toEqual({
      page: 3,
      pageSize: 20,
      query: { keyword: '上海', designerLevel: 'SENIOR' },
    });
    await api.designerOverview('8');
    expect(requireValue(fetchMock.mock.calls.at(-1))[0]).toContain(
      '/designers/8/overview',
    );
    await api.designerRelations('8');
    expect(requireValue(fetchMock.mock.calls.at(-1))[0]).toContain(
      '/designers/8/relationships',
    );
  });
  it('keeps relationship changes versioned and strips injected actor IDs', async () => {
    const old = { id: '3', version: 7 } as Relation;
    await service.updateRelation(old, {
      enabled: false,
      partnerPriceVisible: true,
      modelPermission: false,
      remark: '停用',
      merchantId: 'other',
    } as any);
    expect(body()).toEqual({
      version: 7,
      enabled: false,
      partnerPriceVisible: true,
      modelPermission: false,
      remark: '停用',
    });
    expect(requireValue(fetchMock.mock.calls.at(-1))[0]).toBe(
      '/admin-api/v1/business/cooperation/3',
    );
  });
  it('lookup and bind never pass tenant or invented role values', async () => {
    await service.lookup('13900000008');
    expect(body()).toEqual({ phone: '13900000008' });
    await service.bind('9007199254740993');
    expect(body()).toEqual({ accountId: '9007199254740993' });
    await service.createPartner('合作商', '13900000009');
    expect(body()).toEqual({ name: '合作商', phone: '13900000009' });
  });
  it('keeps QR types fixed and reads logs without generating or downloading codes', async () => {
    await api.qrs();
    await api.qrScans('9');
    await api.qrHistory('9', 2);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/admin-api/v1/business/cooperation-qrs',
      '/admin-api/v1/business/cooperation-qrs/9/scans',
      '/admin-api/v1/business/cooperation-qrs/9/history',
    ]);
    expect(body()).toEqual({ page: 2, pageSize: 20, query: {} });
  });
  it('only downloads QR PNG when explicitly called and has no unrelated body', async () => {
    await api.qrImage('9');
    expect(requireValue(fetchMock.mock.calls[0])[0]).toContain(
      '/cooperation-qrs/9/download',
    );
    expect(body()).toEqual({});
    await api.setQr('9', false);
    expect(body()).toEqual({ enabled: false });
    expect(requireValue(fetchMock.mock.calls.at(-1))[1].method).toBe('PUT');
  });
  it('does not change credits when merely saving a draft and preserves integer/decimal strings', async () => {
    await service.saveDraft('retry-key', credit);
    expect(requireValue(fetchMock.mock.calls[0])[0]).toBe(
      '/admin-api/v1/business/credits/drafts',
    );
    expect(body()).toEqual({ requestId: 'retry-key', content: credit });
    const old = {
      id: '8',
      version: 2,
      status: 'DRAFT',
      content: credit,
    } as CreditDraft;
    await service.draftAction(old, 'submit', 'submit-key');
    expect(body()).toEqual({ requestId: 'submit-key', version: 2 });
    expect(requireValue(fetchMock.mock.calls.at(-1))[0]).toContain('/8/submit');
  });
  it('allows incomplete drafts but not incomplete submits or already submitted records', () => {
    const empty = {
      accountId: null,
      type: null,
      amount: null,
      reason: '',
      voucherFileId: null,
      receivedAmount: null,
    };
    expect(() =>
      service.draftAction(
        { id: '1', version: 0, status: 'DRAFT', content: empty } as CreditDraft,
        'submit',
        'k',
      ),
    ).toThrow('请选择');
    expect(() =>
      service.draftAction(
        {
          id: '1',
          version: 0,
          status: 'SUBMITTED',
          content: credit,
        } as CreditDraft,
        'cancel',
        'k',
      ),
    ).toThrow('仅草稿');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '1000000001', '1.5'])(
    'rejects invalid recharge amount %s before request',
    (amount) => {
      expect(() => service.saveDraft('k', { ...credit, amount })).toThrow(
        '额度须为非零整数',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('allows a negative manual adjustment only with a reason when submitted', async () => {
    const adjustment = {
      ...credit,
      type: 'ADJUSTMENT' as const,
      amount: '-2',
      reason: '盘点',
    };
    await service.saveDraft('k', adjustment);
    expect(body().content.amount).toBe('-2');
    expect(() =>
      service.draftAction(
        {
          id: '1',
          version: 0,
          status: 'DRAFT',
          content: { ...adjustment, reason: '' },
        } as CreditDraft,
        'submit',
        'k',
      ),
    ).toThrow('原因');
  });
  it('keeps filtered ledger exports separate from writes and no payment endpoint exists', async () => {
    const query = {
      accountId: '9007199254740993',
      type: 'MODEL_DOWNLOAD' as const,
      from: '2026-10-01T00:00',
      to: '2026-10-23T12:00',
    };
    await api.ledger(query, 2);
    expect(body()).toEqual({ page: 2, pageSize: 20, query });
    await api.exportLedger(query);
    expect(body()).toEqual(query);
    expect(
      fetchMock.mock.calls.every((c) =>
        String(c[0]).startsWith('/admin-api/v1/business/credits/'),
      ),
    ).toBe(true);
  });
  it('clears empty ledger date inputs and rejects inverted or impossible ranges', async () => {
    await service.ledger({ from: '', to: '' });
    expect(body()).toEqual({ page: 1, pageSize: 20, query: {} });
    expect(() =>
      service.ledger({ from: '2026-10-24T00:00', to: '2026-10-23T00:00' }),
    ).toThrow('开始时间');
    expect(() => service.exportLedger({ from: '2026-02-30T12:00' })).toThrow(
      '日期',
    );
  });
  it('batch-loads designer credit summaries without coercing profile IDs', async () => {
    await api.designerCreditSummaries(['8', '9007199254740993']);
    expect(body()).toEqual({ profileIds: ['8', '9007199254740993'] });
  });
  it('preserves bill money and credits without JS float conversion and normalizes local dates', async () => {
    fetchMock.mockResolvedValue(
      ok({
        ...bill,
        oldServiceEnd: String(Date.parse('2026-10-22T16:00:00Z')),
        content: {
          ...billInput,
          newServiceEnd: String(Date.parse('2027-10-22T16:00:00Z')),
        },
      }),
    );
    const saved = await service.saveBill('retry', billInput, bill);
    expect(body()).toEqual({
      requestId: 'retry',
      version: 3,
      content: billInput,
    });
    expect(saved.oldServiceEnd).toBe('2026-10-23');
    expect(saved.content.newServiceEnd).toBe('2027-10-23');
  });
  it('restricts confirm and void to pending bills and sends version and explicit action', async () => {
    fetchMock.mockResolvedValue(ok(bill));
    await service.billAction(
      bill,
      'VOID',
      '错误记录',
      '2026-10-01T00:00',
      'void-key',
    );
    expect(body()).toEqual({
      requestId: 'void-key',
      version: 3,
      action: 'VOID',
      reason: '错误记录',
      receivedAt: null,
    });
    expect(() =>
      service.billAction(
        { ...bill, status: 'CONFIRMED' },
        'VOID',
        '不能抹账',
        null,
        'k',
      ),
    ).toThrow('仅待入账');
    expect(() =>
      service.billAction(bill, 'CONFIRM', '确认', null, 'k'),
    ).toThrow('上海入账时间');
  });
  it.each(['BANK_TRANSFER', 'OFFLINE_OTHER'] as const)(
    'requires a voucher only on nonzero confirmation for %s',
    async (method) => {
      fetchMock.mockImplementation(async () => ok(bill));
      const pending = {
        ...bill,
        content: { ...billInput, method, amount: '0.01', voucherFileId: null },
      };
      await service.saveBill('pending', pending.content);
      fetchMock.mockClear();
      await expect(
        Promise.resolve().then(() =>
          service.billAction(
            pending,
            'CONFIRM',
            '核对',
            '2026-10-01T09:00',
            'confirm',
          ),
        ),
      ).rejects.toThrow('凭证');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('allows zero confirmation and void without voucher but preserves confirmation metadata', async () => {
    fetchMock.mockImplementation(async () => ok(bill));
    const zero = {
      ...bill,
      content: { ...billInput, amount: '0.00', voucherFileId: null },
    };
    await service.billAction(
      zero,
      'CONFIRM',
      '零元确认',
      '2026-10-01T09:00',
      'zero',
    );
    expect(body()).toMatchObject({
      action: 'CONFIRM',
      receivedAt: '2026-10-01T09:00',
    });
    await service.billAction(bill, 'VOID', '作废未入账', null, 'void');
    expect(body()).toMatchObject({ action: 'VOID', receivedAt: null });
  });
  it('allows a supplied voucher ID without adding it to the transition contract or coercing money', async () => {
    fetchMock.mockResolvedValue(ok(bill));
    const pending = {
      ...bill,
      content: { ...billInput, voucherFileId: '9007199254740993' },
    };
    await service.billAction(
      pending,
      'CONFIRM',
      '核对',
      '2026-10-01T09:00',
      'confirm',
    );
    expect(body()).toEqual({
      requestId: 'confirm',
      version: 3,
      action: 'CONFIRM',
      reason: '核对',
      receivedAt: '2026-10-01T09:00',
    });
  });
  it('requires proper date and zero-amount adjustment semantics', () => {
    expect(() =>
      service.saveBill('k', {
        ...billInput,
        type: 'SERVICE',
        newServiceEnd: '2026-02-30',
      }),
    ).toThrow('日期');
    expect(() =>
      service.saveBill('k', { ...billInput, method: 'FREE_ADJUSTMENT' }),
    ).toThrow('金额必须为零');
    expect(() => api.monthly('2026-13')).toThrow('月份');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('only sends allowed versioned settings, never rule sources, menu or Nacos data', async () => {
    await service.saveSettings({
      version: 5,
      expiryReminderDays: 30,
      productReviewRequired: true,
      modelNamingInstructions: '按项目命名',
      creditRulesSource: 'evil',
      menuMode: 'evil',
    });
    expect(requireValue(fetchMock.mock.calls[0])[1].method).toBe('PATCH');
    expect(body()).toEqual({
      version: 5,
      expiryReminderDays: 30,
      productReviewRequired: true,
      modelNamingInstructions: '按项目命名',
    });
    expect(() =>
      service.saveSettings({
        version: 5,
        expiryReminderDays: 3651,
      } as Settings),
    ).toThrow('提醒天数');
  });
  it('does not allow ambiguous paths, invalid phones, dates or QR types', () => {
    expect(() => api.designer('../x')).toThrow('标识');
    expect(() => service.lookup('123')).toThrow('手机号');
    expect(() => service.createQr('WHOLESALE' as any, null)).toThrow('选项');
    expect(() => service.createQr('DESIGNER', 'bad')).toThrow('有效期');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps a command on retry but rotates when record version or payload changes', () => {
    const command = createOperationRequest();
    const a = command({ id: '1', version: 1, amount: '10' });
    expect(command({ id: '1', version: 1, amount: '10' }).requestId).toBe(
      a.requestId,
    );
    expect(command({ id: '1', version: 2, amount: '10' }).requestId).not.toBe(
      a.requestId,
    );
  });
});
describe('fixed-role UI boundaries', () => {
  it('platform has new governance actions but not merchant relationships', async () => {
    fetchMock.mockResolvedValue(
      ok({ userId: '1', role: 'PLATFORM', merchantId: null }),
    );
    await PermissionDataService.loadCurrentUserPermissions();
    expect(permission.canManageDesigners()).toBe(true);
    expect(permission.canManageCredits()).toBe(true);
    expect(permission.canManageBilling()).toBe(true);
    expect(permission.canManageSettings()).toBe(true);
    expect(permission.canManageCooperation()).toBe(false);
  });
  it('merchant sees own relationships, not platform credits/settings or designer maintenance', async () => {
    fetchMock.mockResolvedValue(
      ok({ userId: '23', role: 'MERCHANT', merchantId: '22' }),
    );
    await PermissionDataService.loadCurrentUserPermissions();
    expect(permission.canManageCooperation()).toBe(true);
    for (const fn of [
      permission.canManageDesigners,
      permission.canManageCredits,
      permission.canManageBilling,
      permission.canManageSettings,
    ])
      expect(fn()).toBe(false);
  });
  it('real page registry includes the ten business pages and one merchant home', () => {
    for (const id of [
      'platform-designer-list',
      'platform-designer-detail',
      'platform-designer-onboarding',
      'cooperation-list',
      'cooperation-detail',
      'cooperation-qrcode',
      'platform-credit-management',
      'platform-credit-recharge',
      'platform-billing-management',
      'platform-system-settings',
      'merchant-dashboard',
    ])
      expect(realPageIds.has(id)).toBe(true);
    const platform = getAdminMenusByRole('platform');
    const merchant = getAdminMenusByRole('merchant');
    expect(
      platform.find((m) => m.name === '首页统计')?.children,
    ).toBeUndefined();
    expect(
      merchant.find((m) => m.name === '首页统计')?.children,
    ).toBeUndefined();
    expect(JSON.stringify(merchant)).not.toContain('platform-designers');
  });
});
