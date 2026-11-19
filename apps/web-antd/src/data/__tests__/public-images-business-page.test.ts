import type { App } from 'vue';

import { createApp, h, nextTick, reactive, ref } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { RealAdminService } from '../../application/realAdminService';
import Catalog from '../../views/puyu-admin/real/Catalog.vue';
import Merchants from '../../views/puyu-admin/real/Merchants.vue';
import { requireValue } from './testAssertions';

const state = vi.hoisted(() => ({
  route: { query: {} as { id?: string } },
  push: vi.fn(),
  busy: undefined as ((v: boolean) => void) | undefined,
  urls: undefined as ((v: string[]) => void) | undefined,
  props: {} as any,
}));
vi.mock('vue-router', () => ({
  useRoute: () => state.route,
  useRouter: () => ({ push: state.push }),
}));
vi.mock('#/infrastructure/permission/permission', () => ({
  permission: new Proxy({}, { get: () => () => true }),
}));
vi.mock('#/views/puyu-admin/real/ImageUpload.vue', () => ({
  default: { render: () => null },
}));
vi.mock('#/views/puyu-admin/real/CatalogWorkbook.vue', () => ({
  default: { render: () => null },
}));
vi.mock('#/views/puyu-admin/real/CatalogBatch.vue', () => ({
  default: { render: () => null },
}));
vi.mock('#/ui/pc-web-a/publicUi/api-error-dialog.vue', () => ({
  default: { render: () => null },
}));
vi.mock('#/views/puyu-admin/real/PublicImageUpload.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      props: ['modelValue', 'scope', 'max', 'legacyCount'],
      emits: ['update:modelValue', 'busy'],
      setup:
        (p, { emit }) =>
        () => {
          state.props = p;
          state.busy = (value) => emit('busy', value);
          state.urls = (value) => emit('update:modelValue', value);
          return h('aside', `draft:${(p.modelValue ?? []).join(',')}`);
        },
    }),
  };
});
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const Container = defineComponent({
    setup:
      (_p, { slots }) =>
      () =>
        h('div', slots.default?.()),
  });
  const Button = defineComponent({
    props: ['disabled'],
    setup:
      (p, { slots, attrs }) =>
      () =>
        h('button', { ...attrs, disabled: p.disabled }, slots.default?.()),
  });
  const Form = defineComponent({
    setup: (_p, { slots, expose }) => {
      expose({ validate: async () => {} });
      return () => h('form', slots.default?.());
    },
  });
  return {
    Alert: Container,
    Button,
    Card: Container,
    Checkbox: Container,
    Descriptions: Object.assign(Container, { Item: Container }),
    Drawer: Container,
    Form: Object.assign(Form, { Item: Container }),
    Input: Object.assign(Container, { TextArea: Container }),
    InputNumber: Container,
    Modal: Container,
    Select: Container,
    Space: Container,
    Switch: Container,
    Table: Container,
    Tag: Container,
    message: { success: vi.fn() },
  };
});
let app: App | undefined;
let root: HTMLDivElement;
const page = ref('product-form');
const oldUrl = 'https://external.test/old.png';
const newUrl = 'http://resources.test/puyu/images/merchants/27/new.png';
const product: any = {
  id: '91',
  kind: 'PRODUCT',
  merchantId: '27',
  version: 1,
  code: 'P1',
  name: '合成商品',
  categoryId: '10',
  brandId: null,
  parentId: null,
  imageUrls: [oldUrl],
  imageFileIds: ['123'],
  parameters: [],
  enabled: true,
  sortOrder: 0,
  showInMenu: true,
  remark: '',
  description: '',
  retailPrice: null,
  partnerPrice: null,
  wholesalePrice: null,
  costPrice: null,
  modelFileMark: 'UNCONFIRMED',
};
const merchant: any = {
  id: '27',
  version: 2,
  content: {
    logoFileId: '123',
    logoUrl: oldUrl,
    name: '商户',
    storeName: '门店',
    serviceStart: '2026-01-01',
    serviceEnd: '2027-01-01',
  },
};
async function settle() {
  for (let i = 0; i < 25; i++) await Promise.resolve();
  await nextTick();
}
async function click(text: string) {
  const button = [...root.querySelectorAll('button')].find(
    (value) => value.textContent?.trim() === text,
  );
  expect(button).toBeTruthy();
  requireValue(button).click();
  await settle();
}
beforeEach(() => {
  vi.restoreAllMocks();
  state.route = reactive({ query: { id: '91' } });
  state.busy = undefined;
  state.urls = undefined;
  page.value = 'product-form';
  state.push.mockReset();
  state.push.mockImplementation(async ({ name, query }) => {
    state.route.query = query;
    page.value = name.replace('PuyuAdmin_', '');
  });
  vi.spyOn(RealAdminService, 'catalogChoices').mockResolvedValue([]);
  vi.spyOn(RealAdminService, 'catalog').mockResolvedValue({
    items: [],
    total: '0',
  });
  vi.spyOn(RealAdminService, 'skus').mockResolvedValue([]);
  vi.spyOn(RealAdminService, 'item').mockResolvedValue(
    structuredClone(product),
  );
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  root.remove();
  vi.restoreAllMocks();
});
it('keeps legacy IDs and external URLs, blocks save while uploading, then saves and renders authoritative product readback', async () => {
  const saved = {
    ...structuredClone(product),
    version: 2,
    imageUrls: [oldUrl, newUrl],
  };
  const save = vi
    .spyOn(RealAdminService, 'saveCatalog')
    .mockResolvedValue(saved);
  app = createApp({ setup: () => () => h(Catalog, { pageId: page.value }) });
  app.mount(root);
  await settle();
  expect(state.props.max).toBe(20);
  expect(state.props.legacyCount).toBe(1);
  expect(root.textContent).toContain('123');
  requireValue(state.busy)(true);
  await settle();
  await click('保存商品');
  expect(save).not.toHaveBeenCalled();
  requireValue(state.urls)([oldUrl, newUrl]);
  requireValue(state.busy)(false);
  await settle();
  vi.mocked(RealAdminService.item).mockResolvedValue(saved);
  await click('保存商品');
  expect(save).toHaveBeenCalledWith(
    'PRODUCT',
    expect.objectContaining({
      imageUrls: [oldUrl, newUrl],
      imageFileIds: ['123'],
    }),
    expect.objectContaining({ id: '91' }),
  );
  expect(RealAdminService.item).toHaveBeenLastCalledWith('PRODUCT', '91');
  expect(
    [...root.querySelectorAll('img')].map((img) => img.getAttribute('src')),
  ).toEqual([oldUrl, newUrl]);
});
it.each(['BRAND', 'CATEGORY'])(
  'preserves %s old mixed images without introducing a new quantity rule',
  async (kind) => {
    const record = {
      ...structuredClone(product),
      kind,
      imageUrls: Array.from(
        { length: 20 },
        (_, i) => `https://external.test/${i}`,
      ),
    };
    vi.mocked(RealAdminService.item).mockResolvedValue(record);
    const save = vi
      .spyOn(RealAdminService, 'saveCatalog')
      .mockResolvedValue(record);
    page.value = kind === 'BRAND' ? 'brand-form' : 'product-category-form';
    app = createApp(Catalog, { pageId: page.value });
    app.mount(root);
    await settle();
    expect(state.props.modelValue).toHaveLength(20);
    expect(state.props.legacyCount).toBe(1);
    expect(state.props.max).toBe(20);
    await click(kind === 'BRAND' ? '保存品牌' : '保存分类');
    expect(save.mock.calls[0]?.[1].imageUrls).toHaveLength(20);
    expect(save.mock.calls[0]?.[1].imageFileIds).toEqual(['123']);
  },
);
it('saves Logo as an independent URL, clears with an explicit empty string and retains fallback ID', async () => {
  state.route.query.id = '27';
  page.value = 'platform-merchant-form';
  const read = vi
    .spyOn(RealAdminService, 'merchant')
    .mockResolvedValue(structuredClone(merchant));
  const save = vi.spyOn(RealAdminService, 'saveMerchant').mockResolvedValue({
    ...merchant,
    content: { ...merchant.content, logoUrl: null },
  });
  app = createApp({ setup: () => () => h(Merchants, { pageId: page.value }) });
  app.mount(root);
  await settle();
  requireValue(state.busy)(true);
  await settle();
  await click('保存修改');
  expect(save).not.toHaveBeenCalled();
  requireValue(state.busy)(false);
  requireValue(state.urls)([]);
  await settle();
  read.mockResolvedValue({
    ...merchant,
    content: { ...merchant.content, logoUrl: null },
  });
  await click('保存修改');
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ logoUrl: '', logoFileId: '123' }),
    expect.objectContaining({ id: '27' }),
  );
  expect(root.textContent).toContain('123');
});

it('saves a new Logo URL independently and previews its authoritative readback before the old fallback ID', async () => {
  state.route.query.id = '27';
  page.value = 'platform-merchant-form';
  const initial = {
    ...merchant,
    content: { ...merchant.content, logoUrl: null },
  };
  const saved = {
    ...merchant,
    content: { ...merchant.content, logoUrl: newUrl },
  };
  const read = vi
    .spyOn(RealAdminService, 'merchant')
    .mockResolvedValue(structuredClone(initial));
  const save = vi
    .spyOn(RealAdminService, 'saveMerchant')
    .mockResolvedValue(saved);
  app = createApp({ setup: () => () => h(Merchants, { pageId: page.value }) });
  app.mount(root);
  await settle();
  requireValue(state.urls)([newUrl]);
  await settle();
  read.mockResolvedValue(saved);
  await click('保存修改');
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ logoUrl: newUrl, logoFileId: '123' }),
    expect.objectContaining({ id: '27' }),
  );
  expect(read).toHaveBeenLastCalledWith('27');
  expect(root.querySelector('img')?.getAttribute('src')).toBe(newUrl);
});
