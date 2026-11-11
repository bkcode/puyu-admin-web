import {
  CacherManager,
  createCacher,
} from '#/infrastructure/cache/cacherManager';
import { shanghaiDate } from '#/infrastructure/time/shanghaiTime';

import { serializeSkuInput } from './skuSpecifications';

export const isRealAdmin = import.meta.env.VITE_PUYU_DATA_MODE === 'real';
export type Actor = {
  merchantId: null | string;
  role: 'MERCHANT' | 'PLATFORM';
  userId: string;
};
export type Kind = 'BRAND' | 'CATEGORY' | 'PRODUCT';
export type PageResult<T> = { items: T[]; total: string };
export type MerchantInput = {
  address: string;
  contact: string;
  enabled: boolean;
  introduction: string;
  loginPhone: string;
  logoFileId?: null | string;
  name: string;
  phone: string;
  remark: string;
  serviceEnd: string;
  serviceStart: string;
  storeName: string;
  type: 'DEALER' | 'RENOVATION';
  wechatFileId?: null | string;
};
export type Merchant = {
  accountId: string;
  code: string;
  content: MerchantInput;
  id: string;
  serviceStatus: string;
  version: number;
};
export type Parameter = {
  key: string;
  name: string;
  unit: string;
  value: string;
  visible: boolean;
};
export type CatalogInput = {
  brandId: null | string;
  categoryId: null | string;
  code: string;
  costPrice: null | string;
  description: string;
  enabled: boolean;
  imageFileIds: string[];
  imageUrls: string[];
  modelFileMark: 'NONE' | 'PRESENT' | 'UNCONFIRMED';
  name: string;
  parameters: Parameter[];
  parentId: null | string;
  partnerPrice: null | string;
  remark: string;
  retailPrice: null | string;
  showInMenu: boolean;
  sortOrder: number;
  wholesalePrice: null | string;
};
export type Catalog = CatalogInput & {
  displayStatus: string;
  id: string;
  kind: Kind;
  level: null | number;
  merchantId: string;
  processReason: null | string;
  reviewStatus: string;
  skuCount: string;
  skuSpecificationSchemaVersion?: null | number;
  version: number;
};
export type SkuSpecification = { name: string; value: string };
export type SkuSpecificationStatus = 'LEGACY' | 'REVIEW_REQUIRED' | 'VERIFIED';
export type SkuInput = {
  code: string;
  costPrice: null | string;
  enabled: boolean;
  partnerPrice: null | string;
  price: string;
  spec: string;
  specifications?: null | SkuSpecification[];
  stock: string;
  wholesalePrice: null | string;
};
export type Sku = Omit<SkuInput, 'specifications'> & {
  id: string;
  productId: string;
  specifications: SkuSpecification[];
  specificationStatus: SkuSpecificationStatus;
  version: number;
};
type SkuResponse = Omit<Sku, 'specifications' | 'specificationStatus'> & {
  specifications?: null | SkuSpecification[];
  specificationStatus?: null | SkuSpecificationStatus;
};
function normalizeSku(row: SkuResponse): Sku {
  return {
    ...row,
    specifications: row.specifications ?? [],
    specificationStatus: row.specificationStatus ?? 'LEGACY',
  };
}
type TokenResult = {
  access_token: string;
  refresh_token?: string;
  scope: string;
};
function normalizeMerchant(row: Merchant): Merchant {
  const date = shanghaiDate;
  return {
    ...row,
    content: {
      ...row.content,
      serviceStart: date(row.content.serviceStart),
      serviceEnd: date(row.content.serviceEnd),
    },
  };
}
const refreshCache = createCacher<string>('real-auth-refresh', {
  level: 'local',
});
let tokenProvider: () => null | string | undefined = () => undefined;
export function configureRealTokenProvider(provider: typeof tokenProvider) {
  tokenProvider = provider;
}

export class AdminApiError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}
async function unwrap<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as null | {
    code: number;
    data: T;
    msg?: string;
  };
  if (!response.ok || !body || body.code !== 0)
    throw new AdminApiError(
      body?.msg || `服务请求失败（HTTP ${response.status}）`,
      String(body?.code ?? response.status),
    );
  return body.data;
}
export async function adminRequest<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  if (!isRealAdmin) throw new AdminApiError('当前未启用真实服务模式', 'MODE');
  if (!path.startsWith('/catalog/') && !path.startsWith('/business/'))
    throw new Error('Unsupported admin surface');
  const token = tokenProvider();
  if (!token) throw new AdminApiError('请先登录后台', '401');
  const form = body instanceof FormData;
  return unwrap<T>(
    await fetch(`/admin-api/v1${path}`, {
      method,
      signal: AbortSignal.timeout(20_000),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(!form && body !== undefined
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      ...(body === undefined
        ? {}
        : { body: form ? body : JSON.stringify(body) }),
    }),
  );
}
async function oauth(body: Record<string, string>): Promise<TokenResult> {
  const result = await unwrap<TokenResult>(
    await fetch('/auth-api/v1/oauth2/token', {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      body: new URLSearchParams(body),
    }),
  );
  if (!result.access_token)
    throw new AdminApiError('认证服务未返回令牌', 'AUTH');
  if (result.refresh_token) refreshCache.set(result.refresh_token);
  return result;
}
export const realAuthApi = {
  async login(username: string, password: string) {
    CacherManager.logoutClear();
    const result = await oauth({
      grant_type: 'password',
      username,
      password,
      scope: 'profile',
    });
    return { accessToken: result.access_token };
  },
  async refresh() {
    const token = refreshCache.get();
    if (!token) throw new AdminApiError('登录已过期，请重新登录', '401');
    const result = await oauth({
      grant_type: 'refresh_token',
      refresh_token: token,
    });
    return {
      data: result.access_token,
      status: 200,
    };
  },
  async logout() {
    CacherManager.logoutClear();
  },
  async actor(): Promise<Actor> {
    const actor = await adminRequest<Actor>('/catalog/actor');
    const id = (value: unknown) =>
      typeof value === 'string' && /^\d+$/.test(value) && /[1-9]/.test(value);
    if (
      !id(actor?.userId) ||
      !['MERCHANT', 'PLATFORM'].includes(actor?.role) ||
      (actor.role === 'MERCHANT'
        ? !id(actor.merchantId)
        : actor.merchantId !== null)
    )
      throw new AdminApiError('后台账号身份无效，请重新登录', '403');
    return actor;
  },
};
export const realAdminRepository = {
  actor: realAuthApi.actor,
  dashboard: () => adminRequest<Record<string, string>>('/business/dashboard'),
  merchants: async (keyword = '', page = 1, pageSize = 20) => {
    const result = await adminRequest<PageResult<Merchant>>(
      '/business/merchants/page',
      { page, pageSize, query: { keyword } },
    );
    return { ...result, items: result.items.map(normalizeMerchant) };
  },
  merchant: async (id: string) =>
    normalizeMerchant(
      await adminRequest<Merchant>(
        `/business/merchants/${encodeURIComponent(id)}`,
      ),
    ),
  saveMerchant: (content: MerchantInput, old?: Merchant) =>
    old
      ? adminRequest<Merchant>(
          `/business/merchants/${old.id}`,
          { version: old.version, content },
          'PUT',
        )
      : adminRequest<Merchant>('/business/merchants', content),
  catalog: (
    kind: Kind,
    query: Record<string, unknown> = {},
    page = 1,
    pageSize = 20,
  ) =>
    adminRequest<PageResult<Catalog>>(`/catalog/${kind}/page`, {
      page,
      pageSize,
      query,
    }),
  item: (kind: Kind, id: string) =>
    adminRequest<Catalog>(`/catalog/${kind}/${encodeURIComponent(id)}`),
  saveItem: (kind: Kind, content: CatalogInput, old?: Catalog) =>
    old
      ? adminRequest<Catalog>(
          `/catalog/${kind}/${old.id}`,
          { version: old.version, content },
          'PUT',
        )
      : adminRequest<Catalog>(`/catalog/${kind}`, content),
  submit: (item: Catalog) =>
    adminRequest<Catalog>(`/catalog/${item.kind}/${item.id}/submit`, {
      version: item.version,
    }),
  decide: (
    item: Catalog,
    decision: 'OFFLINE' | 'PUBLISH' | 'REJECT',
    reason = '',
  ) =>
    adminRequest<Catalog>(`/catalog/${item.kind}/${item.id}/decision`, {
      version: item.version,
      decision,
      reason,
    }),
  skus: async (productId: string) => {
    const skus = await adminRequest<SkuResponse[]>(
      `/catalog/products/${productId}/skus`,
    );
    return skus.map((row) => normalizeSku(row));
  },
  async saveSku(productId: string, content: SkuInput, old?: Sku) {
    const payload = serializeSkuInput(content);
    return normalizeSku(
      await (old
        ? adminRequest<SkuResponse>(
            `/catalog/products/${productId}/skus/${old.id}`,
            { version: old.version, content: payload },
            'PUT',
          )
        : adminRequest<SkuResponse>(
            `/catalog/products/${productId}/skus`,
            payload,
          )),
    );
  },
  async upload(file: File) {
    const data = new FormData();
    data.set('file', file);
    data.set('purpose', 'IMAGE');
    return adminRequest<{ id: string; name: string }>('/business/files', data);
  },
};
