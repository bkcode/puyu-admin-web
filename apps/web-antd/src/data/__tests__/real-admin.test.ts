import type { Catalog, Sku, SkuInput } from '../realAdminApi';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RealAdminService } from '../../application/realAdminService';
import { CacherManager } from '../../infrastructure/cache/cacherManager';
import { PermissionDataService } from '../permissionDataService';
import {
  adminRequest,
  configureRealTokenProvider,
  realAdminRepository,
  realAuthApi,
} from '../realAdminApi';
import {
  buildSkuInput,
  serializeSkuInput,
  validateSkuSpecifications,
} from '../skuSpecifications';
import { requireValue } from './testAssertions';

const fetchMock = vi.fn();
function success(data: unknown) {
  return Response.json(
    { code: 0, data, msg: 'success' },
    {
      status: 200,
    },
  );
}
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  configureRealTokenProvider(() => 'test-access-token');
  CacherManager.logoutClear();
});
describe('real admin transport and identity', () => {
  it('logs in through the gateway alias without exposing a client secret or Basic header', async () => {
    fetchMock.mockResolvedValue(
      success({
        access_token: 'access',
        refresh_token: 'refresh',
        scope: 'profile',
      }),
    );
    expect(await realAuthApi.login('13900000001', 'test-password')).toEqual({
      accessToken: 'access',
    });
    const [url, request] = requireValue(fetchMock.mock.calls[0]);
    expect(url).toBe('/auth-api/v1/oauth2/token');
    expect(request.headers).toBeUndefined();
    expect([...request.body.keys()]).toEqual([
      'grant_type',
      'username',
      'password',
      'scope',
    ]);
    expect(request.body.has('client_secret')).toBe(false);
  });
  it('preserves string identifiers and decimal strings in versioned request payloads', async () => {
    fetchMock.mockResolvedValue(success({ id: '9007199254740993' }));
    await adminRequest('/catalog/products/9007199254740993/skus', {
      code: 'SKU-A',
      price: '9999.99',
      stock: '1.2500',
    });
    const [url, request] = requireValue(fetchMock.mock.calls[0]);
    expect(url).toBe('/admin-api/v1/catalog/products/9007199254740993/skus');
    expect(request.headers.Authorization).toBe('Bearer test-access-token');
    expect(JSON.parse(request.body)).toEqual({
      code: 'SKU-A',
      price: '9999.99',
      stock: '1.2500',
    });
  });
  it('honors failed ApiResult even on HTTP 200 and never manufactures success', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { code: 20_000, data: null, msg: '版本已更新，请刷新' },
        { status: 200 },
      ),
    );
    await expect(adminRequest('/catalog/PRODUCT/1')).rejects.toMatchObject({
      message: '版本已更新，请刷新',
      code: '20000',
    });
  });
  it('fails closed without a token or for unsupported API surfaces', async () => {
    configureRealTokenProvider(() => null);
    await expect(adminRequest('/business/dashboard')).rejects.toMatchObject({
      code: '401',
    });
    await expect(adminRequest('/inner-api/unsafe')).rejects.toThrow(
      'Unsupported admin surface',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('derives least-privilege fixed menus from the server actor, not wildcard mock permissions', async () => {
    expect(PermissionDataService.hasMenuKey('merchant:manage')).toBe(false);
    fetchMock.mockResolvedValue(
      success({ userId: '17', role: 'MERCHANT', merchantId: '9' }),
    );
    const merchant = await PermissionDataService.loadCurrentUserPermissions();
    expect(merchant.menuKeys).not.toContain('*');
    expect(PermissionDataService.hasMenuKey('product:edit')).toBe(true);
    expect(PermissionDataService.hasMenuKey('merchant:manage')).toBe(false);
    PermissionDataService.clearCurrentUserPermissions();
    fetchMock.mockResolvedValue(
      success({ userId: '1', role: 'PLATFORM', merchantId: null }),
    );
    await PermissionDataService.loadCurrentUserPermissions();
    expect(PermissionDataService.hasMenuKey('merchant:manage')).toBe(true);
    expect(PermissionDataService.hasMenuKey('product:edit')).toBe(false);
  });
  it('normalizes existing backend timestamp dates for editable date inputs', async () => {
    fetchMock.mockResolvedValue(
      success({
        id: '9',
        content: { serviceStart: '1780243200000', serviceEnd: '1790784000000' },
      }),
    );
    const merchant = await realAdminRepository.merchant('9');
    expect(merchant.content.serviceStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(merchant.content.serviceEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('rejects malformed identities instead of treating an unknown role as merchant', async () => {
    fetchMock.mockResolvedValue(
      success({ userId: '17', role: 'UNKNOWN', merchantId: '9' }),
    );
    await expect(
      PermissionDataService.loadCurrentUserPermissions(),
    ).rejects.toMatchObject({ code: '403' });
    expect(PermissionDataService.hasMenuKey('product:edit')).toBe(false);
    fetchMock.mockResolvedValue(
      success({ userId: '17', role: 'MERCHANT', merchantId: null }),
    );
    await expect(realAuthApi.actor()).rejects.toMatchObject({ code: '403' });
  });
});

const skuContent: SkuInput = {
  code: 'sku',
  spec: '原木色 / 120cm',
  price: '100.00',
  partnerPrice: '90.00',
  wholesalePrice: '80.00',
  costPrice: '50.00',
  stock: '2.5000',
  enabled: true,
};
const dimensions = [{ name: '颜色', value: '原木色' }];
describe('sKU dimension explicit intent and compatibility', () => {
  it('omits dimensions for open/price-only edits even when input is a full read DTO', () => {
    const dto = {
      ...skuContent,
      id: '9',
      productId: '8',
      version: 7,
      specifications: dimensions,
      specificationStatus: 'REVIEW_REQUIRED',
    } as Sku;
    expect(
      buildSkuInput(dto, 1, {
        rows: dimensions,
        dirty: false,
        confirmed: false,
      }),
    ).toEqual(skuContent);
    expect(buildSkuInput(dto, 1)).toEqual(skuContent);
    expect(serializeSkuInput(dto)).not.toHaveProperty('id');
    expect(serializeSkuInput(dto)).not.toHaveProperty('productId');
    expect(serializeSkuInput(dto)).not.toHaveProperty('version');
    expect(serializeSkuInput(dto)).not.toHaveProperty('specificationStatus');
  });
  it('sends an explicit empty array only after intentional removal and nonempty values after edit or confirmation', () => {
    expect(
      buildSkuInput(skuContent, 1, { rows: [], dirty: true, confirmed: false })
        .specifications,
    ).toEqual([]);
    expect(
      buildSkuInput(skuContent, 1, {
        rows: dimensions,
        dirty: false,
        confirmed: true,
      }).specifications,
    ).toEqual(dimensions);
    expect(
      buildSkuInput(skuContent, 1, {
        rows: [{ name: ' 颜色 ', value: ' 原木色 ' }],
        dirty: true,
        confirmed: false,
      }).specifications,
    ).toEqual(dimensions);
    expect(
      serializeSkuInput({ ...skuContent, specifications: null }).specifications,
    ).toBeNull();
  });
  it.each([undefined, null, 0, 2])(
    'never sends unsupported dimensions for schema %s',
    (schema) => {
      expect(
        buildSkuInput({ ...skuContent, specifications: dimensions }, schema, {
          rows: dimensions,
          dirty: true,
          confirmed: true,
        }),
      ).not.toHaveProperty('specifications');
    },
  );
  it('validates 1-6 complete trimmed pairs and rejects duplicate names and excessive lengths', () => {
    expect(validateSkuSpecifications([])).toEqual([]);
    expect(
      validateSkuSpecifications([
        { name: 'a'.repeat(40), value: 'b'.repeat(80) },
      ]),
    ).toHaveLength(1);
    expect(() =>
      validateSkuSpecifications([{ name: ' ', value: 'x' }]),
    ).toThrow('不能为空');
    expect(() =>
      validateSkuSpecifications([{ name: 'x', value: ' ' }]),
    ).toThrow('不能为空');
    expect(() =>
      validateSkuSpecifications([
        { name: 'x', value: 'y' },
        { name: ' x ', value: 'z' },
      ]),
    ).toThrow('不能重复');
    expect(() =>
      validateSkuSpecifications([{ name: 'a'.repeat(41), value: 'y' }]),
    ).toThrow('最多40字');
    expect(() =>
      validateSkuSpecifications([{ name: 'x', value: 'a'.repeat(81) }]),
    ).toThrow('值最多80字');
    expect(() =>
      validateSkuSpecifications(
        Array.from({ length: 7 }, (_, i) => ({ name: `n${i}`, value: 'v' })),
      ),
    ).toThrow('最多6组');
  });
  it('normalizes older read responses without asserting capability or verified state', async () => {
    fetchMock.mockResolvedValue(
      success([{ ...skuContent, id: '9', productId: '8', version: 1 }]),
    );
    const skus = await realAdminRepository.skus('8');
    expect(skus[0]).toMatchObject({
      specifications: [],
      specificationStatus: 'LEGACY',
    });
  });
  it.each([
    ['Color', 'color'],
    ['Color', 'Ｃｏｌｏｒ'],
    [' color ', ' Ｃｏｌｏｒ '],
  ])(
    'rejects canonically duplicate dimension names %s / %s',
    (first, second) => {
      expect(() =>
        validateSkuSpecifications([
          { name: first, value: '原木色' },
          { name: second, value: '胡桃色' },
        ]),
      ).toThrow('名称不能重复');
    },
  );
  it('keeps trimmed display names and validates their original lengths before NFKC normalization', () => {
    expect(
      validateSkuSpecifications([{ name: ' Ｃｏｌｏｒ ', value: ' 原木色 ' }]),
    ).toEqual([{ name: 'Ｃｏｌｏｒ', value: '原木色' }]);
    // NFKC expands each ligature to three characters, but the wire/display limit is on the original text.
    expect(
      validateSkuSpecifications([{ name: 'ﬃ'.repeat(40), value: '原木色' }]),
    ).toHaveLength(1);
    expect(() =>
      validateSkuSpecifications([{ name: 'ﬃ'.repeat(41), value: '原木色' }]),
    ).toThrow('最多40字');
  });
  it('price-only service save retains REVIEW_REQUIRED and all prices, strips read identity fields', async () => {
    const old = {
      ...skuContent,
      id: '9',
      productId: '8',
      version: 7,
      specifications: dimensions,
      specificationStatus: 'REVIEW_REQUIRED',
    } as Sku;
    fetchMock.mockResolvedValue(success({ ...old, price: '101.00' }));
    const result = await RealAdminService.saveProductSku(
      { id: '8', skuSpecificationSchemaVersion: 1 } as Catalog,
      { ...old, price: '101.00' },
      old,
      { rows: dimensions, dirty: false, confirmed: false },
    );
    expect(result.specificationStatus).toBe('REVIEW_REQUIRED');
    expect(JSON.parse(requireValue(fetchMock.mock.calls[0])[1].body)).toEqual({
      version: 7,
      content: { ...skuContent, price: '101.00' },
    });
  });
  it('service sends only explicit supported dimensions and does not allow inventory overwrite', async () => {
    fetchMock.mockImplementation(async () =>
      success({
        ...skuContent,
        id: '9',
        productId: '8',
        version: 1,
        specifications: dimensions,
        specificationStatus: 'VERIFIED',
      }),
    );
    await RealAdminService.saveProductSku(
      { id: '8', skuSpecificationSchemaVersion: 1 } as Catalog,
      skuContent,
      undefined,
      { rows: dimensions, dirty: false, confirmed: true },
    );
    expect(JSON.parse(requireValue(fetchMock.mock.calls[0])[1].body)).toEqual({
      ...skuContent,
      specifications: dimensions,
    });
    await RealAdminService.saveProductSku(
      { id: '8' } as Catalog,
      skuContent,
      undefined,
      { rows: dimensions, dirty: true, confirmed: true },
    );
    expect(JSON.parse(requireValue(fetchMock.mock.calls[1])[1].body)).toEqual(
      skuContent,
    );
    expect(() =>
      RealAdminService.saveProductSku(
        { id: '8' } as Catalog,
        { ...skuContent, stock: '3' },
        { ...skuContent, productId: '8' } as Sku,
      ),
    ).toThrow('库存调整');
  });
});
