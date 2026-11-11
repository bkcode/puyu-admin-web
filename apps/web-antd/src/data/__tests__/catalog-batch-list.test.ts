import type { App } from 'vue';

import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import Catalog from '../../views/puyu-admin/real/Catalog.vue';
import { buildSkuInput } from '../skuSpecifications';
import { requireValue } from './testAssertions';
const state = vi.hoisted(() => ({
  catalog: vi.fn(),
  choices: vi.fn(),
  completed: undefined as ((count?: number) => void) | undefined,
  setBusy: undefined as ((value: boolean) => void) | undefined,
  lastBatch: [] as any[],
  tables: [] as any[],
  permission: true,
  openSingle: vi.fn(),
  merchants: vi.fn(),
  notice: vi.fn(),
  routeQuery: {} as { id?: string },
  item: vi.fn(),
  skus: vi.fn(),
  saveSku: vi.fn(),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: state.routeQuery }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('#/application/realAdminService', () => ({
  RealAdminService: {
    catalog: state.catalog,
    catalogChoices: state.choices,
    merchants: state.merchants,
    item: state.item,
    skus: state.skus,
    saveProductSku: state.saveSku,
  },
}));
vi.mock('#/infrastructure/permission/permission', () => ({
  permission: {
    canEditProduct: () => state.permission,
    canEditCategory: () => state.permission,
    canEditBrand: () => state.permission,
    canSubmitCatalog: () => state.permission,
    canReviewCategory: () => false,
    canPublishProduct: () => false,
    canOfflineProduct: () => false,
  },
}));
vi.mock('#/views/puyu-admin/real/CatalogWorkbook.vue', () => ({
  default: { render: () => null },
}));
vi.mock('#/views/puyu-admin/real/ImageUpload.vue', () => ({
  default: { render: () => null },
}));
vi.mock('#/ui/pc-web-a/publicUi/api-error-dialog.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      props: ['open', 'message'],
      setup: (p) => () => (p.open ? h('p', p.message) : null),
    }),
  };
});
vi.mock('#/views/puyu-admin/real/CatalogBatch.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      props: ['rows'],
      emits: ['clear', 'completed', 'busy'],
      setup: (p, { emit, expose }) => {
        expose({ openSingle: state.openSingle });
        return () => {
          state.lastBatch = p.rows;
          state.completed = (count) => emit('completed', count);
          state.setBusy = (value) => emit('busy', value);
          return h('div', [
            h('p', `selected:${p.rows.length}`),
            h('button', { onClick: () => emit('clear') }, '清空测试选择'),
          ]);
        };
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
    setup:
      (_p, { slots, attrs }) =>
      () =>
        h('button', attrs, slots.default?.()),
  });
  const Input = defineComponent({
    props: ['value', 'disabled'],
    emits: ['update:value'],
    setup:
      (p, { emit, attrs }) =>
      () =>
        h('input', {
          ...attrs,
          value: p.value,
          disabled: p.disabled,
          onInput: (event: Event) =>
            emit('update:value', (event.target as HTMLInputElement).value),
        }),
  });
  const Checkbox = defineComponent({
    props: ['checked', 'disabled'],
    emits: ['update:checked'],
    setup:
      (p, { emit, slots }) =>
      () =>
        h('label', [
          h('input', {
            type: 'checkbox',
            checked: p.checked,
            disabled: p.disabled,
            onChange: (event: Event) =>
              emit(
                'update:checked',
                (event.target as HTMLInputElement).checked,
              ),
          }),
          slots.default?.(),
        ]),
  });
  const Modal = defineComponent({
    props: ['open'],
    setup:
      (p, { slots }) =>
      () =>
        p.open ? h('section', { 'data-modal': true }, slots.default?.()) : null,
  });
  const Alert = defineComponent({
    props: ['message'],
    setup: (p) => () => h('p', p.message),
  });
  const Form = defineComponent({
    setup: (_p, { expose, slots }) => {
      expose({ validate: async () => undefined });
      return () => h('div', slots.default?.());
    },
  });
  const Table = defineComponent({
    props: ['rowSelection', 'dataSource', 'pagination'],
    emits: ['change'],
    setup:
      (p, { emit, slots }) =>
      () => {
        state.tables = [p];
        return h('div', [
          h(
            'button',
            {
              onClick: () =>
                p.rowSelection?.onChange(p.dataSource.map((r: any) => r.id)),
            },
            '选择当前页',
          ),
          h(
            'button',
            { onClick: () => emit('change', { current: 2 }) },
            '下一页测试',
          ),
          h('p', `checked:${p.rowSelection?.selectedRowKeys.length ?? 'none'}`),
          ...(p.dataSource ?? []).map((record: any) =>
            h(
              'div',
              { 'data-test-row': record.id },
              slots.bodyCell?.({ column: { key: 'action' }, record }),
            ),
          ),
        ]);
      },
  });
  return {
    Alert,
    Button,
    Card: Container,
    Checkbox,
    Descriptions: Object.assign(Container, { Item: Container }),
    Drawer: Container,
    Form: Object.assign(Form, { Item: Container }),
    Input: Object.assign(Input, { TextArea: Container }),
    InputNumber: Container,
    Modal,
    Select: Container,
    Space: Container,
    Switch: Container,
    Table,
    Tag: Container,
    message: { success: state.notice },
  };
});
let app: App | undefined;
let root: HTMLDivElement;
async function settle() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
  await nextTick();
}
async function click(text: string) {
  const button = [...root.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text,
  );
  requireValue(button, `missing button ${text}`).click();
  await settle();
}
beforeEach(() => {
  vi.clearAllMocks();
  state.permission = true;
  state.routeQuery = {};
  state.lastBatch = [];
  state.tables = [];
  state.choices.mockResolvedValue([]);
  state.merchants.mockResolvedValue({ items: [] });
  state.catalog.mockImplementation(
    async (_kind: any, _query: any, page: number) => ({
      total: '40',
      items: [
        {
          id: String(page),
          kind: _kind,
          version: page,
          name: `商品${page}`,
          code: `p${page}`,
          enabled: true,
          reviewStatus: 'DRAFT',
          displayStatus: 'HIDDEN',
        },
      ],
    }),
  );
  root = document.createElement('div');
  document.body.append(root);
});

const productFixture = (schemaVersion: null | number | undefined = 1) => ({
  id: '8',
  kind: 'PRODUCT',
  name: '维度商品',
  code: 'P8',
  imageFileIds: [],
  parameters: [],
  skuSpecificationSchemaVersion: schemaVersion,
});
const skuFixture = () => ({
  id: '9',
  productId: '8',
  version: 3,
  code: 'S9',
  spec: '原木色 / 120cm',
  price: '100.00',
  partnerPrice: '90.00',
  wholesalePrice: '80.00',
  costPrice: '50.00',
  stock: '2.5000',
  enabled: true,
  specifications: [{ name: '颜色', value: '原木色' }],
  specificationStatus: 'REVIEW_REQUIRED',
});
async function mountSkuEditor(schemaVersion: null | number | undefined = 1) {
  state.routeQuery = { id: '8' };
  state.item.mockResolvedValue(productFixture(schemaVersion));
  state.skus.mockResolvedValue([skuFixture()]);
  state.saveSku.mockImplementation(async (product, content, _old, edit) =>
    buildSkuInput(content, product.skuSpecificationSchemaVersion, edit),
  );
  await mount('product-detail');
  await click('编辑 SKU');
}
async function inputSku(label: string, value: string) {
  const input = requireValue(
    root.querySelector<HTMLInputElement>(`[aria-label="${label}"]`),
    `missing SKU input ${label}`,
  );
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle();
}
it('sKU editor prefills dimensions without confirmation; price save retains all hidden prices and omits dimensions', async () => {
  await mountSkuEditor();
  expect(root.textContent).toContain('待复核');
  expect(
    requireValue(
      root.querySelector<HTMLInputElement>('[aria-label="规格名称 1"]'),
    ).value,
  ).toBe('颜色');
  const inputs = root.querySelectorAll<HTMLInputElement>('[data-modal] input');
  expect([...inputs].find((input) => input.value === '2.5000')?.disabled).toBe(
    true,
  );
  const price = requireValue(
    [...inputs].find((input) => input.value === '100.00'),
    'missing SKU price input',
  );
  price.value = '101.00';
  price.dispatchEvent(new Event('input'));
  await settle();
  expect(
    requireValue(root.querySelector<HTMLInputElement>('[type="checkbox"]'))
      .checked,
  ).toBe(false);
  await click('保存 SKU');
  expect(state.saveSku).toHaveBeenCalledOnce();
  await expect(
    requireValue(state.saveSku.mock.results[0]).value,
  ).resolves.toEqual({
    code: 'S9',
    spec: '原木色 / 120cm',
    price: '101.00',
    partnerPrice: '90.00',
    wholesalePrice: '80.00',
    costPrice: '50.00',
    stock: '2.5000',
    enabled: true,
  });
});
it('explicit confirmation sends existing dimensions, spec change revokes confirmation and does not auto-confirm', async () => {
  await mountSkuEditor();
  const checkbox = requireValue(
    root.querySelector<HTMLInputElement>('[type="checkbox"]'),
  );
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event('change'));
  await settle();
  await inputSku('自由规格组合', '胡桃色 / 120cm');
  expect(checkbox.checked).toBe(false);
  expect(root.textContent).toContain('仅修改自由规格');
  checkbox.checked = true;
  checkbox.dispatchEvent(new Event('change'));
  await settle();
  await click('保存 SKU');
  await expect(
    requireValue(state.saveSku.mock.results[0]).value,
  ).resolves.toMatchObject({
    specifications: [{ name: '颜色', value: '原木色' }],
  });
});
it('dimension edit submits normalized pairs; deletion sends [] with a visible destructive-meaning warning', async () => {
  await mountSkuEditor();
  await inputSku('规格值 1', ' 胡桃色 ');
  await click('保存 SKU');
  await expect(
    requireValue(state.saveSku.mock.results[0]).value,
  ).resolves.toMatchObject({
    specifications: [{ name: '颜色', value: '胡桃色' }],
  });
  await click('编辑 SKU');
  await click('删除');
  expect(root.textContent).toContain('保存后将清空该 SKU 的全部规格维度');
  await click('保存 SKU');
  await expect(
    requireValue(state.saveSku.mock.results[1]).value,
  ).resolves.toMatchObject({
    specifications: [],
  });
});
it('blank/duplicate dimension rows block save and cancel never writes', async () => {
  await mountSkuEditor();
  await click('添加规格维度');
  await click('保存 SKU');
  expect(state.saveSku).not.toHaveBeenCalled();
  expect(root.textContent).toContain('不能为空');
  await inputSku('规格名称 2', ' 颜色 ');
  await inputSku('规格值 2', '黑色');
  await click('保存 SKU');
  expect(root.textContent).toContain('名称不能重复');
  expect(state.saveSku).not.toHaveBeenCalled();
  await click('取消');
  expect(state.saveSku).not.toHaveBeenCalled();
});
it('old backend cannot edit/send dimensions but retains free-spec and price saves', async () => {
  await mountSkuEditor(null);
  expect(root.textContent).toContain('后端尚未支持');
  expect(root.querySelector('[aria-label="规格名称 1"]')).toBeNull();
  expect(
    [...root.querySelectorAll('button')].some(
      (button) => button.textContent === '添加规格维度',
    ),
  ).toBe(false);
  await inputSku('自由规格组合', '自由规格仍可保存');
  await click('保存 SKU');
  await expect(
    requireValue(state.saveSku.mock.results[0]).value,
  ).resolves.not.toHaveProperty('specifications');
});
afterEach(() => {
  app?.unmount();
  root.remove();
  app = undefined;
});
async function mount(pageId = 'product-list') {
  app = createApp(Catalog, { pageId });
  app.mount(root);
  await settle();
}
it('only current rows can be selected; pagination clears selection before loading next page', async () => {
  await mount();
  await click('选择当前页');
  expect(state.lastBatch.map((r) => r.id)).toEqual(['1']);
  await click('下一页测试');
  expect(root.textContent).toContain('selected:0');
  expect(requireValue(state.catalog.mock.calls.at(-1))[2]).toBe(2);
  await click('选择当前页');
  expect(state.lastBatch.map((r) => r.id)).toEqual(['2']);
});
it('refresh/query and explicit clear remove all selection', async () => {
  await mount();
  await click('选择当前页');
  await click('刷新');
  expect(root.textContent).toContain('selected:0');
  await click('选择当前页');
  await click('查询');
  expect(root.textContent).toContain('selected:0');
  await click('选择当前页');
  await click('清空测试选择');
  expect(root.textContent).toContain('selected:0');
});
it('batch completion clears selected versions and reloads; refresh failure stays a read error, not a new write', async () => {
  await mount();
  await click('选择当前页');
  state.catalog.mockRejectedValueOnce(new Error('列表读取失败'));
  requireValue(state.completed)();
  await settle();
  expect(root.textContent).toContain('selected:0');
  expect(root.textContent).toContain('列表读取失败');
  expect(state.catalog).toHaveBeenCalledTimes(2);
});
it('read-only role does not receive checkbox selection', async () => {
  state.permission = false;
  await mount();
  expect(state.tables[0].rowSelection).toBeUndefined();
});
it('ignores off-page/number keys and prevents paging or refresh during batch write', async () => {
  await mount();
  state.tables[0].rowSelection.onChange(['1', 'other', 2]);
  await settle();
  expect(state.lastBatch.map((r) => r.id)).toEqual(['1']);
  requireValue(state.setBusy)(true);
  await settle();
  state.tables[0].rowSelection.onChange([]);
  await click('下一页测试');
  await click('刷新');
  expect(state.catalog).toHaveBeenCalledOnce();
  expect(state.lastBatch.map((r) => r.id)).toEqual(['1']);
  requireValue(state.setBusy)(false);
  await settle();
  await click('刷新');
  expect(state.catalog).toHaveBeenCalledTimes(2);
});
it.each(['product-list', 'product-category-list', 'brand-list'])(
  '%s row state action does not use or mutate checkbox selection',
  async (pageId) => {
    state.catalog.mockImplementation(async (kind: any) => ({
      total: '2',
      items: [
        { id: '1', kind, version: 3, name: '启用项', enabled: true },
        { id: '2', kind, version: 8, name: '停用项', enabled: false },
      ],
    }));
    await mount(pageId);
    await click('选择当前页');
    expect(state.lastBatch).toHaveLength(2);
    const first = requireValue(root.querySelector('[data-test-row="1"]'));
    const second = requireValue(root.querySelector('[data-test-row="2"]'));
    const disable = requireValue(
      [...first.querySelectorAll('button')].find(
        (b) => b.textContent === '停用',
      ),
    );
    const enable = requireValue(
      [...second.querySelectorAll('button')].find(
        (b) => b.textContent === '启用',
      ),
    );
    disable.click();
    await settle();
    expect(state.openSingle).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: '1', version: 3, enabled: true }),
    );
    expect(state.lastBatch).toHaveLength(2);
    enable.click();
    await settle();
    expect(state.openSingle).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: '2', version: 8, enabled: false }),
    );
    expect(state.lastBatch).toHaveLength(2);
  },
);
it('platform or read-only list never exposes merchant single state buttons', async () => {
  await mount('platform-product-management');
  expect(
    [...root.querySelectorAll('button')].some((b) =>
      ['停用', '启用'].includes(b.textContent ?? ''),
    ),
  ).toBe(false);
  expect(state.openSingle).not.toHaveBeenCalled();
});
it('single completion with no checkbox selection reports one affected row and reloads', async () => {
  await mount();
  requireValue(state.completed)(1);
  await settle();
  expect(state.notice).toHaveBeenCalledWith(expect.stringContaining('1条'));
  expect(state.catalog).toHaveBeenCalledTimes(2);
});
