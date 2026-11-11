import type { CatalogBatchRow } from '../../application/catalogBatchService';
import type { CatalogBatchAction } from '../catalogBatchApi';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  catalogBatchStateError,
  CatalogBatchService as service,
} from '../../application/catalogBatchService';
import { configureRealTokenProvider } from '../realAdminApi';
import { requireValue } from './testAssertions';

const fetchMock = vi.fn();
const row = (patch: Partial<CatalogBatchRow> = {}): CatalogBatchRow => ({
  id: '9007199254740993',
  version: 3,
  kind: 'PRODUCT',
  name: '验收商品',
  code: 'p1',
  enabled: true,
  reviewStatus: 'DRAFT',
  displayStatus: 'HIDDEN',
  ...patch,
});
const ok = (data: unknown) => Response.json({ code: 0, msg: 'ok', data });
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  configureRealTokenProvider(() => 'test-token');
  fetchMock.mockImplementation(async () => ok([row()]));
});
describe('batch contract and preconditions', () => {
  it.each(['PRODUCT', 'CATEGORY', 'BRAND'] as const)(
    'projects only existing DTO for %s and retains long ID/version',
    async (kind) => {
      const source = {
        ...row({ kind }),
        merchantId: 'evil',
        costPrice: '11',
        extra: true,
      };
      fetchMock.mockImplementation(async () => ok([row({ kind })]));
      await service.create(kind, 'SUBMIT', [source], '  原说明  ').execute();
      const [url, options] = requireValue(fetchMock.mock.calls[0]);
      expect(url).toBe('/admin-api/v1/business/catalog/batch');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({
        requestId: expect.any(String),
        kind,
        action: 'SUBMIT',
        items: [{ id: source.id, version: 3 }],
        reason: '原说明',
      });
    },
  );
  it.each<[CatalogBatchAction, Partial<CatalogBatchRow>]>([
    ['SUBMIT', {}],
    ['SUBMIT', { reviewStatus: 'REJECTED' }],
    ['SUBMIT', { reviewStatus: 'APPROVED', displayStatus: 'OFFLINE' }],
    ['ENABLE', { enabled: false }],
    ['DISABLE', {}],
    ['PUBLISH', { reviewStatus: 'PENDING' }],
    ['REJECT', { reviewStatus: 'PENDING' }],
    ['OFFLINE', { reviewStatus: 'APPROVED', displayStatus: 'PUBLISHED' }],
  ])('accepts %s only for matching state', (action, patch) => {
    expect(() =>
      service.create('PRODUCT', action, [row(patch)], '填写原因'),
    ).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each<[CatalogBatchAction, Partial<CatalogBatchRow>]>([
    ['SUBMIT', { reviewStatus: 'PENDING' }],
    ['SUBMIT', { enabled: false }],
    ['ENABLE', {}],
    ['DISABLE', { enabled: false }],
    ['PUBLISH', {}],
    ['PUBLISH', { enabled: false, reviewStatus: 'PENDING' }],
    ['REJECT', {}],
    ['OFFLINE', {}],
  ])(
    'rejects ineligible %s without silently skipping any selected record',
    (action, patch) => {
      expect(catalogBatchStateError(action, row(patch))).not.toBe('');
      expect(() =>
        service.create('PRODUCT', action, [row(patch)], '理由'),
      ).toThrow('不会自动跳过');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('rejects empty/101/duplicate/mixed-kind/invalid ID or version', () => {
    for (const rows of [
      [],
      Array.from({ length: 101 }, (_, i) => row({ id: String(i + 1) })),
      [row(), row()],
      [row({ kind: 'BRAND' })],
      [row({ id: '../1' })],
      [row({ id: '9223372036854775808' })],
      [row({ version: 1.5 })],
      [row({ version: -1 })],
      [row({ version: 2_147_483_648 })],
    ])
      expect(() => service.create('PRODUCT', 'SUBMIT', rows)).toThrow(Error);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('accepts exactly100 distinct rows and preserves versions', () => {
    expect(() =>
      service.create(
        'PRODUCT',
        'SUBMIT',
        Array.from({ length: 100 }, (_, i) => row({ id: String(i + 1) })),
      ),
    ).not.toThrow();
  });
  it('requires trimmed reason for reject/offline and limits1000', () => {
    expect(() =>
      service.create(
        'PRODUCT',
        'REJECT',
        [row({ reviewStatus: 'PENDING' })],
        '  ',
      ),
    ).toThrow('必须');
    expect(() =>
      service.create(
        'PRODUCT',
        'OFFLINE',
        [row({ displayStatus: 'PUBLISHED' })],
        '',
      ),
    ).toThrow('必须');
    expect(() =>
      service.create('PRODUCT', 'SUBMIT', [row()], 'x'.repeat(1001)),
    ).toThrow('1000');
    expect(() =>
      service.create('PRODUCT', 'SUBMIT', [row()], 'x'.repeat(1000)),
    ).not.toThrow();
  });
  it('rejects unknown kind/action before any request', () => {
    expect(() => service.create('WHOLESALE' as any, 'SUBMIT', [row()])).toThrow(
      '无效',
    );
    expect(() => service.create('PRODUCT', 'DELETE' as any, [row()])).toThrow(
      '无效',
    );
  });
});
describe('atomic response and idempotent commands', () => {
  it('captures an immutable snapshot, retry is same request and success does not resend', async () => {
    const source = row();
    const command = service.create('PRODUCT', 'SUBMIT', [source]);
    source.id = '11';
    source.version = 8;
    fetchMock
      .mockRejectedValueOnce(new Error('timeout'))
      .mockImplementation(async () => ok([row()]));
    await expect(command.execute()).rejects.toThrow('timeout');
    await command.execute();
    await command.execute();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(requireValue(fetchMock.mock.calls[0])[1].body);
    const retry = JSON.parse(requireValue(fetchMock.mock.calls[1])[1].body);
    expect(first).toEqual(retry);
    expect(first.items).toEqual([{ id: '9007199254740993', version: 3 }]);
    expect(service.create('PRODUCT', 'SUBMIT', [row()]).requestId).not.toBe(
      command.requestId,
    );
  });
  it('coalesces concurrent executions', async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    );
    const command = service.create('PRODUCT', 'SUBMIT', [row()]);
    const first = command.execute();
    const second = command.execute();
    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledOnce();
    resolve(ok([row()]));
    await first;
  });
  it.each([
    [],
    [row({ id: 'unknown' })],
    [row({ kind: 'BRAND' })],
    [row(), row()],
    null,
  ])(
    'does not claim success for incomplete or mismatched response %j',
    async (value) => {
      fetchMock.mockImplementation(async () => ok(value));
      await expect(
        service.create('PRODUCT', 'SUBMIT', [row()]).execute(),
      ).rejects.toThrow('结果未确认');
    },
  );
  it('retains backend rollback/error message and does not emit a partial result', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        code: 4001,
        msg: '批次已回滚，记录2：版本已更新',
        data: null,
      }),
    );
    await expect(
      service.create('PRODUCT', 'SUBMIT', [row()]).execute(),
    ).rejects.toThrow('批次已回滚，记录2');
  });
});
