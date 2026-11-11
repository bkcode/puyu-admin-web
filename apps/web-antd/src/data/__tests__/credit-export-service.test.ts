import { beforeEach, expect, it, vi } from 'vitest';

import { AdminBusinessService as service } from '../../application/adminBusinessService';
import { configureRealTokenProvider } from '../realAdminApi';
import { requireValue } from './testAssertions';

const fetchMock = vi.fn();
const file = {
  name: 'credit-ledger.csv',
  contentType: 'text/csv;charset=UTF-8',
  content: '77u/YSxiDQo=',
  rowCount: 2,
};
const ok = (data: unknown) => Response.json({ code: 0, msg: 'ok', data });
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  configureRealTokenProvider(() => 'test-token');
  fetchMock.mockImplementation(async () => ok(file));
});
it('retains rowCount and exact filters/long IDs without exporting UI-injected scope', async () => {
  const result = await service.exportLedger({
    accountId: '9007199254740993',
    type: 'GIFT',
    from: '2026-10-23T00:00',
    to: '2026-10-29T23:59:59',
    merchantId: 'other',
    page: 2,
  } as any);
  expect(result).toEqual(file);
  expect(requireValue(fetchMock.mock.calls[0])[0]).toBe(
    '/admin-api/v1/business/credits/export',
  );
  expect(requireValue(fetchMock.mock.calls[0])[1].method).toBe('POST');
  expect(JSON.parse(requireValue(fetchMock.mock.calls[0])[1].body)).toEqual({
    accountId: '9007199254740993',
    type: 'GIFT',
    from: '2026-10-23T00:00',
    to: '2026-10-29T23:59:59',
  });
});
it.each([0, 10_000])(
  'accepts a valid CSV response with %i rows, not current-page length',
  async (count) => {
    fetchMock.mockImplementation(async () => ok({ ...file, rowCount: count }));
    const result = await service.exportLedger({ accountId: '28' });
    expect(result.rowCount).toBe(count);
  },
);
it.each([
  { ...file, rowCount: undefined },
  { ...file, rowCount: '2' },
  { ...file, rowCount: 1.5 },
  { ...file, rowCount: -1 },
  { ...file, rowCount: 10_001 },
  { ...file, contentType: 'text/html' },
  { ...file, name: 'bad.exe' },
  { ...file, content: 'bad!' },
  { ...file, content: '' },
  null,
])(
  'rejects invalid metadata or base64 before the download layer %j',
  async (value) => {
    fetchMock.mockImplementation(async () => ok(value));
    await expect(service.exportLedger({ accountId: '28' })).rejects.toThrow(
      'CSV文件或条数无效',
    );
  },
);
it('invalid dates/IDs are rejected before request and preserve synchronous validation behavior', () => {
  expect(() => service.exportLedger({ from: '2026-02-30T00:00' })).toThrow(
    '日期',
  );
  expect(() =>
    service.exportLedger({ from: '2026-10-29T00:00', to: '2026-10-23T00:00' }),
  ).toThrow('开始时间');
  expect(() => service.exportLedger({ accountId: '../x' })).toThrow(
    '记录标识无效',
  );
  expect(fetchMock).not.toHaveBeenCalled();
});
it('propagates backend range errors without masking them as success', async () => {
  fetchMock.mockImplementation(async () =>
    Response.json({
      code: 4001,
      msg: '单次最多导出10000条，请缩小账户或日期范围',
      data: null,
    }),
  );
  await expect(service.exportLedger({ accountId: '28' })).rejects.toThrow(
    '最多导出10000条',
  );
});
