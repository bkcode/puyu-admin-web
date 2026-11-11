import type { TicketAction, TicketInput, TicketStatus } from '../operationsApi';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  canTransitionOrder,
  canTransitionTicket,
  createOperationRequest,
  OperationsService,
  validateAdjustment,
  validateOrder,
  validateTicket,
} from '../../application/operationsService';
import { CacherManager } from '../../infrastructure/cache/cacherManager';
import { permission } from '../../infrastructure/permission/permission';
import {
  formatShanghaiTime,
  shanghaiDate,
} from '../../infrastructure/time/shanghaiTime';
import { operationsRepository } from '../operationsApi';
import { PermissionDataService } from '../permissionDataService';
import { configureRealTokenProvider } from '../realAdminApi';
import { requireValue } from './testAssertions';

const fetchMock = vi.fn();
const success = (data: unknown) =>
  Response.json({ code: 0, data, msg: 'success' });
const ticket: TicketInput = {
  type: 'PRODUCT_ASSISTANCE',
  description: '协助商品资料',
  contact: '验收联系人',
  phone: '13900000001',
  productId: null,
  skuId: null,
  attachmentIds: [],
};
describe('shanghai time contract', () => {
  it('normalizes epochs and offset or bare ISO without UTC compensation', () => {
    const instant = '2026-10-23T01:00:00Z';
    for (const value of [
      instant,
      '2026-10-23T09:00:00+08:00',
      '2026-10-23T09:00:00',
      String(Date.parse(instant)),
      String(Date.parse(instant) / 1000),
    ]) {
      expect(formatShanghaiTime(value)).toBe('2026/10/23 09:00:00');
    }
    expect(formatShanghaiTime('bad')).toBe('—');
    expect(formatShanghaiTime(null)).toBe('—');
  });
  it('preserves Shanghai dates at the UTC day boundary', () => {
    expect(shanghaiDate(new Date('2026-10-22T16:00:00Z'))).toBe('2026-10-23');
    expect(shanghaiDate('2026-10-23')).toBe('2026-10-23');
    expect(shanghaiDate('bad')).toBe('');
    expect(formatShanghaiTime('2026-10-22T16:00:00Z')).toBe(
      '2026/10/23 00:00:00',
    );
  });
});
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  configureRealTokenProvider(() => 'test');
  CacherManager.logoutClear();
});
describe('operations request contracts', () => {
  it('creates a BFF order with decimal string quantities and strips client price and identity fields', async () => {
    fetchMock.mockResolvedValue(
      success({ id: '9', status: 'PENDING_CONFIRMATION' }),
    );
    await OperationsService.createOrder({
      requestId: 'same-key',
      contact: '验收',
      phone: '13900000001',
      remark: '本机',
      items: [{ skuId: '9007199254740993', quantity: '2.1250', price: '0' }],
      merchantId: 'other',
      amount: '0',
    } as any);
    expect(requireValue(fetchMock.mock.calls[0])[0]).toBe(
      '/admin-api/v1/business/orders',
    );
    expect(JSON.parse(requireValue(fetchMock.mock.calls[0])[1].body)).toEqual({
      requestId: 'same-key',
      contact: '验收',
      phone: '13900000001',
      remark: '本机',
      items: [{ skuId: '9007199254740993', quantity: '2.1250' }],
    });
  });
  it('loads only published approved enabled product choices and enabled SKU in product scope', async () => {
    fetchMock
      .mockResolvedValueOnce(
        success({
          total: '2',
          items: [
            {
              id: '27',
              enabled: true,
              reviewStatus: 'APPROVED',
              displayStatus: 'PUBLISHED',
            },
            {
              id: '28',
              enabled: true,
              reviewStatus: 'PENDING',
              displayStatus: 'DRAFT',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        success([
          { id: '9', enabled: true },
          { id: '10', enabled: false },
        ]),
      );
    const products = await OperationsService.orderProducts('木材');
    expect(products.items.map((item) => item.id)).toEqual(['27']);
    expect(
      JSON.parse(requireValue(fetchMock.mock.calls[0])[1].body).query,
    ).toMatchObject({
      keyword: '木材',
      enabled: true,
      reviewStatus: 'APPROVED',
      displayStatus: 'PUBLISHED',
    });
    const skus = await OperationsService.orderSkus('27');
    expect(skus.map((item) => item.id)).toEqual(['9']);
    expect(requireValue(fetchMock.mock.calls[1])[0]).toBe(
      '/admin-api/v1/catalog/products/27/skus',
    );
  });
  it('uses BFF paging and filters without adding merchant scope on the client', async () => {
    fetchMock.mockResolvedValue(success({ items: [], total: '0' }));
    await operationsRepository.stocks({ keyword: 'SKU', status: 'LOW' }, 3);
    expect(requireValue(fetchMock.mock.calls[0])[0]).toBe(
      '/admin-api/v1/business/inventory/page',
    );
    expect(JSON.parse(requireValue(fetchMock.mock.calls[0])[1].body)).toEqual({
      page: 3,
      pageSize: 20,
      query: { keyword: 'SKU', status: 'LOW' },
    });
  });
  it('preserves large string identifiers, decimal quantities and optimistic version', async () => {
    fetchMock.mockResolvedValue(success({}));
    const body = {
      skuId: '9007199254740993',
      version: 7,
      delta: '-0.0001',
      lowThreshold: '1.2500',
      reason: '盘点',
      requestId: 'retry-key',
    };
    await OperationsService.adjustStock(body);
    expect(JSON.parse(requireValue(fetchMock.mock.calls[0])[1].body)).toEqual(
      body,
    );
  });
  it('retries identical payloads with the same id and rotates for a changed operation', () => {
    const request = createOperationRequest();
    const first = request({ version: 1, delta: '2.0000' });
    expect(request({ version: 1, delta: '2.0000' }).requestId).toBe(
      first.requestId,
    );
    expect(request({ version: 1, delta: '3.0000' }).requestId).not.toBe(
      first.requestId,
    );
    expect(
      createOperationRequest()({ version: 1, delta: '2.0000' }).requestId,
    ).not.toBe(first.requestId);
  });
  it('propagates backend version conflicts without fabricating a result', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ code: 20_000, msg: '库存已更新，请刷新', data: null }),
    );
    await expect(
      operationsRepository.adjustStock({
        skuId: '1',
        version: 1,
        delta: '0',
        lowThreshold: '0',
        reason: '阈值',
        requestId: 'x',
      }),
    ).rejects.toThrow('库存已更新');
  });
  it('uses the order transition and print endpoints', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(success({})));
    await operationsRepository.transitionOrder('99', {
      requestId: 'r',
      version: 2,
      action: 'REDEEM',
      reason: '',
    });
    expect(requireValue(fetchMock.mock.calls[0])[0]).toBe(
      '/admin-api/v1/business/orders/99/transition',
    );
    await operationsRepository.printOrder('99');
    expect(requireValue(fetchMock.mock.calls[1])[0]).toBe(
      '/admin-api/v1/business/orders/99/print',
    );
  });
  it('passes platform model file ownership through multipart without setting JSON headers', async () => {
    fetchMock.mockResolvedValue(success({ id: '4' }));
    await operationsRepository.upload(
      new File(['data'], 'model.obj'),
      'MODEL',
      '25',
    );
    const request = requireValue(fetchMock.mock.calls[0])[1];
    expect(request.body.get('merchantId')).toBe('25');
    expect(request.body.get('purpose')).toBe('MODEL');
    expect(request.headers['Content-Type']).toBeUndefined();
  });
  it('separates read-only quotes from explicit consuming model downloads', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(success({})));
    await operationsRepository.modelQuote('15');
    expect(requireValue(fetchMock.mock.calls[0])[1].method).toBe('GET');
    expect(requireValue(fetchMock.mock.calls[0])[0]).toContain(
      '/download-quote',
    );
    await operationsRepository.downloadModel('15', 'same-request');
    expect(JSON.parse(requireValue(fetchMock.mock.calls[1])[1].body)).toEqual({
      requestId: 'same-request',
    });
  });
  it('decodes downloads without treating file content as executable HTML', () => {
    const result = OperationsService.decodeDownload({
      file: {
        id: '1',
        name: '../a.txt',
        purpose: 'ATTACHMENT',
        merchantId: '1',
        size: '2',
        createdAt: '',
      },
      content: btoa('ok'),
      downloadId: null,
      consumedCredits: '0',
    });
    expect([...result.bytes]).toEqual([111, 107]);
    expect(result.name).not.toContain('/');
  });
  it('rejects malformed URL identifiers before requesting', () => {
    expect(() => operationsRepository.order('../1')).toThrow('ID无效');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
describe('operations rules', () => {
  it.each(['0', '0.0000', '-1', '1e2', '1.12345', 'NaN', '100000000000000'])(
    'rejects invalid order quantity %s',
    (quantity) => {
      expect(() =>
        validateOrder({
          contact: '验收',
          phone: '13900000001',
          remark: '',
          items: [{ skuId: '9', quantity }],
        }),
      ).toThrow('SKU或数量无效');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('requires order contact and unique SKU lines before requesting', () => {
    const body = {
      contact: '验收',
      phone: '13900000001',
      remark: '',
      items: [{ skuId: '9', quantity: '2.1250' }],
    };
    expect(() => validateOrder(body)).not.toThrow();
    expect(() => validateOrder({ ...body, contact: ' ' })).toThrow('联系人');
    expect(() => validateOrder({ ...body, phone: '123' })).toThrow('手机号');
    expect(() => validateOrder({ ...body, items: [] })).toThrow(
      '请选择1至100种不同SKU',
    );
    expect(() =>
      validateOrder({ ...body, items: [...body.items, ...body.items] }),
    ).toThrow('请选择1至100种不同SKU');
    expect(() => validateOrder({ ...body, remark: 'x'.repeat(501) })).toThrow(
      '订单备注最多500字',
    );
  });
  it.each(['1.12345', 'NaN', '1e5', '--2'])(
    'rejects invalid stock quantity %s',
    (delta) => {
      expect(() =>
        validateAdjustment({
          skuId: '1',
          version: 0,
          delta,
          lowThreshold: '0',
          reason: '调整',
        }),
      ).toThrow('库存数量最多4位小数');
    },
  );
  it('requires stock adjustment reasons and nonnegative thresholds', () => {
    expect(() =>
      validateAdjustment({
        skuId: '1',
        version: 0,
        delta: '1',
        lowThreshold: '0',
        reason: '  ',
      }),
    ).toThrow('请填写调整原因');
    expect(() =>
      validateAdjustment({
        skuId: '1',
        version: 0,
        delta: '1',
        lowThreshold: '-1',
        reason: 'test',
      }),
    ).toThrow('阈值必须非负');
  });
  it('requires a product for model tickets and enforces SKU context', () => {
    expect(() => validateTicket({ ...ticket, type: 'MODEL_CREATION' })).toThrow(
      '关联商品',
    );
    expect(() => validateTicket({ ...ticket, skuId: '7' })).toThrow(
      'SKU所属商品',
    );
    expect(() =>
      validateTicket({ ...ticket, type: 'MODEL_CREATION', productId: '30' }),
    ).not.toThrow();
  });
  it('rejects incomplete or invalid contact details', () => {
    expect(() => validateTicket({ ...ticket, phone: '11000000000' })).toThrow(
      '有效需求描述、联系人和11位手机号',
    );
    expect(() => validateTicket({ ...ticket, description: '  ' })).toThrow(
      '有效需求描述、联系人和11位手机号',
    );
  });
  it('enforces the order status graph', () => {
    expect(canTransitionOrder('PENDING_CONFIRMATION', 'CONFIRM')).toBe(true);
    expect(canTransitionOrder('PENDING_CONFIRMATION', 'REDEEM')).toBe(false);
    expect(canTransitionOrder('CONFIRMED', 'REDEEM')).toBe(true);
    expect(canTransitionOrder('REDEEMED', 'CANCEL')).toBe(false);
    expect(canTransitionOrder('CANCELLED', 'CONFIRM')).toBe(false);
  });
  it.each<[boolean, TicketStatus, TicketAction, boolean]>([
    [true, 'SUBMITTED', 'ACCEPT', true],
    [false, 'SUBMITTED', 'ACCEPT', false],
    [true, 'SUBMITTED', 'ASSIGN', true],
    [true, 'PROCESSING', 'DELIVER', true],
    [true, 'SUBMITTED', 'DELIVER', false],
    [false, 'READY_CONFIRM', 'CONFIRM', true],
    [true, 'READY_CONFIRM', 'CONFIRM', false],
    [false, 'SUBMITTED', 'CANCEL', true],
    [false, 'PROCESSING', 'CANCEL', false],
    [true, 'COMPLETED', 'REJECT', false],
  ])(
    'checks ticket role=%s status=%s action=%s',
    (platform, status, action, expected) => {
      expect(canTransitionTicket(platform, status, action)).toBe(expected);
    },
  );
  it('rejects missing transition fields without making a request', () => {
    expect(() =>
      OperationsService.transitionTicket('1', {
        requestId: 'r',
        version: 0,
        action: 'ASSIGN',
        reason: '分派',
      }),
    ).toThrow('处理人');
    expect(() =>
      OperationsService.transitionTicket('1', {
        requestId: 'r',
        version: 0,
        action: 'DELIVER',
        reason: ' ',
      }),
    ).toThrow('交付说明');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps operational permissions limited to the appropriate server role', async () => {
    fetchMock.mockResolvedValue(
      success({ userId: '5', role: 'MERCHANT', merchantId: '25' }),
    );
    await PermissionDataService.loadCurrentUserPermissions();
    expect(permission.canManageInventory()).toBe(true);
    expect(permission.canManageOrders()).toBe(true);
    expect(permission.canSubmitWorkorder()).toBe(true);
    expect(permission.canProcessWorkorder()).toBe(false);
    CacherManager.logoutClear();
    fetchMock.mockResolvedValue(
      success({ userId: '1', role: 'PLATFORM', merchantId: null }),
    );
    await PermissionDataService.loadCurrentUserPermissions();
    expect(permission.canManageInventory()).toBe(false);
    expect(permission.canManageOrders()).toBe(false);
    expect(permission.canSubmitWorkorder()).toBe(false);
    expect(permission.canProcessWorkorder()).toBe(true);
  });
});
