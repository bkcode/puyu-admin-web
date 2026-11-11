import type { WorkbookContext } from '../../application/catalogWorkbookService';
import type { WorkbookMode } from '../catalogWorkbookApi';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogWorkbookService as service } from '../../application/catalogWorkbookService';
import { configureRealTokenProvider } from '../realAdminApi';
import { requireValue } from './testAssertions';

const fetchMock = vi.fn();
const xlsx = {
  name: 'product.xlsx',
  contentType:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  content: 'UEs=',
  rowCount: 0,
};
const ok = (data: unknown) => Response.json({ code: 0, msg: 'ok', data });
const product: WorkbookContext = {
  kind: 'product',
  query: { keyword: '玉', reviewStatus: 'DRAFT' },
};
const sku: WorkbookContext = {
  kind: 'sku',
  productId: '9007199254740993',
  productName: '测试商品',
};
const file = () =>
  new File(['xlsx-test-bytes'], '导入.xlsx', { type: xlsx.contentType });
const imported = (mode: WorkbookMode = 'PRODUCT') => ({
  batchId: '9007199254740995',
  mode,
  createdIds: ['9007199254740997'],
  updatedIds: ['2'],
});
const body = (index = 0) =>
  JSON.parse(requireValue(fetchMock.mock.calls[index])[1].body);
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  configureRealTokenProvider(() => 'test-token');
  fetchMock.mockImplementation(async () => ok(xlsx));
});

describe('existing Workbook HTTP contracts', () => {
  it.each<WorkbookMode>(['PRODUCT', 'PRODUCT_PRICE', 'SKU', 'SKU_PRICE'])(
    '%s template/export uses the existing JSON surface and exact scope',
    async (mode) => {
      const context = mode.startsWith('SKU') ? sku : product;
      await service.template(mode, context);
      await service.export(mode, context);
      expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
        '/admin-api/v1/business/workbooks/template',
        '/admin-api/v1/business/workbooks/export',
      ]);
      expect(
        fetchMock.mock.calls.every((call) => call[1].method === 'POST'),
      ).toBe(true);
      expect(body()).toEqual({
        mode,
        productId: mode.startsWith('SKU') ? sku.productId : null,
        query: mode.startsWith('SKU') ? {} : product.query,
      });
      expect(body(1)).toEqual(body());
    },
  );
  it('projects current filters, never tenant/merchant/version or pagination from UI objects', async () => {
    await service.export('PRODUCT', {
      kind: 'product',
      query: {
        keyword: ' 玉 ',
        reviewStatus: 'APPROVED',
        merchantId: 'other',
        page: 9,
        version: 4,
      },
    } as any);
    expect(body()).toEqual({
      mode: 'PRODUCT',
      productId: null,
      query: { keyword: '玉', reviewStatus: 'APPROVED' },
    });
  });
  it('does not import on selection and uses multipart without a JSON content-type', async () => {
    const command = service.createImport('SKU_PRICE', sku, file());
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockImplementation(async () => ok(imported('SKU_PRICE')));
    const result = await command.execute();
    const [url, options] = requireValue(fetchMock.mock.calls[0]);
    const form = options.body as FormData;
    expect(url).toBe('/admin-api/v1/business/workbooks/import');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ Authorization: 'Bearer test-token' });
    expect([...form.keys()].toSorted()).toEqual([
      'file',
      'mode',
      'productId',
      'requestId',
    ]);
    expect(form.get('mode')).toBe('SKU_PRICE');
    expect(form.get('productId')).toBe(sku.productId);
    expect(form.get('requestId')).toBe(command.requestId);
    expect((form.get('file') as File).name).toBe('导入.xlsx');
    expect(result).toEqual(imported('SKU_PRICE'));
  });
  it('product import omits productId and preserves file bytes', async () => {
    fetchMock.mockImplementation(async () => ok(imported()));
    await service.createImport('PRODUCT', product, file()).execute();
    const form = requireValue(fetchMock.mock.calls[0])[1].body as FormData;
    expect(form.has('productId')).toBe(false);
    expect(await (form.get('file') as File).text()).toBe('xlsx-test-bytes');
  });
});
describe('input and response boundaries', () => {
  it.each([
    ['SKU', product],
    ['SKU_PRICE', product],
    ['PRODUCT', sku],
    ['PRODUCT_PRICE', sku],
    ['OTHER', product],
    ['SKU', { ...sku, productId: '../1' }],
    ['SKU', { ...sku, productId: '0' }],
    ['SKU', { ...sku, productId: '9223372036854775808' }],
  ])('rejects incompatible mode/context %s', async (mode, context) => {
    await expect(
      service.export(mode as WorkbookMode, context as WorkbookContext),
    ).rejects.toThrow(Error);
    expect(() =>
      service.createImport(
        mode as WorkbookMode,
        context as WorkbookContext,
        file(),
      ),
    ).toThrow(Error);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['bad.xls', 'bad.xlsm', 'bad.xlsx.exe', 'bad.zip'])(
    'rejects %s before any request',
    (name) => {
      expect(() =>
        service.createImport('PRODUCT', product, new File(['x'], name)),
      ).toThrow('.xlsx');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('rejects empty/oversize files and accepts exact 5MiB with uppercase extension', () => {
    expect(() =>
      service.createImport('PRODUCT', product, new File([], 'empty.xlsx')),
    ).toThrow('5MiB');
    expect(() =>
      service.createImport(
        'PRODUCT',
        product,
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.xlsx'),
      ),
    ).toThrow('5MiB');
    expect(
      service.createImport(
        'PRODUCT',
        product,
        new File([new Uint8Array(5 * 1024 * 1024)], 'OK.XLSX'),
      ).size,
    ).toBe(5 * 1024 * 1024);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects invalid filter status before request', async () => {
    await expect(
      service.export('PRODUCT', {
        kind: 'product',
        query: { reviewStatus: 'AUTO_PUBLISH' },
      }),
    ).rejects.toThrow('筛选');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { ...xlsx, contentType: 'text/html' },
    { ...xlsx, content: 'bad!' },
    { ...xlsx, rowCount: 5001 },
  ])(
    'does not turn invalid response into a successful download',
    async (value) => {
      fetchMock.mockImplementation(async () => ok(value));
      await expect(service.template('PRODUCT', product)).rejects.toThrow(
        '文件无效',
      );
    },
  );
  it('rejects lossy numeric result IDs instead of claiming import success', async () => {
    fetchMock.mockImplementation(async () =>
      ok({ ...imported(), batchId: 12 }),
    );
    await expect(
      service.createImport('PRODUCT', product, file()).execute(),
    ).rejects.toThrow('结果无法确认');
  });
  it('preserves backend row/version errors', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json({
        code: 4001,
        msg: 'Excel第2行：版本冲突',
        data: null,
      }),
    );
    await expect(
      service.createImport('PRODUCT', product, file()).execute(),
    ).rejects.toThrow('Excel第2行：版本冲突');
  });
});
describe('one import command owns one payload', () => {
  it('retries the same file and command key after a network failure', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('timeout'))
      .mockImplementation(async () => ok(imported()));
    const command = service.createImport('PRODUCT', product, file());
    await expect(command.execute()).rejects.toThrow('timeout');
    await command.execute();
    const forms = fetchMock.mock.calls.map((call) => call[1].body as FormData);
    expect(requireValue(forms[0]).get('requestId')).toBe(
      requireValue(forms[1]).get('requestId'),
    );
    expect(await (requireValue(forms[0]).get('file') as File).text()).toBe(
      await (requireValue(forms[1]).get('file') as File).text(),
    );
  });
  it('deduplicates simultaneous execution and does not resubmit after confirmed success', async () => {
    let complete!: (value: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve;
        }),
    );
    const command = service.createImport('PRODUCT', product, file());
    const first = command.execute();
    const second = command.execute();
    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledOnce();
    complete(ok(imported()));
    await first;
    await command.execute();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('new file/mode/context creates a new command and freezes the original context', async () => {
    const context = { ...sku };
    const first = service.createImport('SKU', context, file());
    context.productId = '99';
    const second = service.createImport('SKU_PRICE', context, file());
    expect(first.requestId).not.toBe(second.requestId);
    expect(first.productId).toBe('9007199254740993');
    expect(second.productId).toBe('99');
  });
});
