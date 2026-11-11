import type { App } from 'vue';

import type { WorkbookContext } from '../../application/catalogWorkbookService';

import { createApp, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import CatalogWorkbook from '../../views/puyu-admin/real/CatalogWorkbook.vue';
import { requireValue } from './testAssertions';

const state = vi.hoisted(() => ({
  allowed: true,
  file: undefined as File | undefined,
  template: vi.fn(),
  export: vi.fn(),
  import: vi.fn(),
  download: vi.fn(),
  imported: vi.fn(),
}));
vi.mock('#/data/catalogWorkbookApi', () => ({
  catalogWorkbookRepository: {
    template: state.template,
    export: state.export,
    import: state.import,
  },
}));
vi.mock('#/infrastructure/permission/permission', () => ({
  permission: { canEditProduct: () => state.allowed },
}));
vi.mock('#/views/puyu-admin/real/businessUi', () => ({
  downloadExport: state.download,
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
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const Container = defineComponent({
    setup:
      (_p, { slots }) =>
      () =>
        h('div', slots.default?.()),
  });
  const Form = Object.assign(Container, { Item: Container });
  const Button = defineComponent({
    props: ['disabled', 'loading'],
    emits: ['click'],
    setup:
      (p, { slots, emit }) =>
      () =>
        h(
          'button',
          { disabled: p.disabled || p.loading, onClick: () => emit('click') },
          slots.default?.(),
        ),
  });
  const Select = defineComponent({
    props: ['value', 'options', 'disabled'],
    emits: ['update:value', 'change'],
    setup:
      (p, { emit }) =>
      () =>
        h(
          'select',
          {
            value: p.value,
            disabled: p.disabled,
            onChange: (e: Event) => {
              const value = (e.target as HTMLSelectElement).value;
              emit('update:value', value);
              emit('change', value);
            },
          },
          p.options.map((o: any) => h('option', { value: o.value }, o.label)),
        ),
  });
  const Modal = defineComponent({
    props: ['open'],
    setup:
      (p, { slots }) =>
      () =>
        p.open
          ? h('section', { 'data-dialog': 'import' }, slots.default?.())
          : null,
  });
  const Upload = defineComponent({
    props: ['beforeUpload', 'disabled'],
    setup:
      (p, { slots }) =>
      () =>
        h('div', [
          slots.default?.(),
          h('input', {
            type: 'file',
            disabled: p.disabled,
            onChange: () => p.beforeUpload(state.file),
          }),
        ]),
  });
  const Alert = defineComponent({
    props: ['message', 'description'],
    setup: (p) => () => h('p', `${p.message} ${p.description ?? ''}`),
  });
  return { Form, Button, Select, Space: Container, Modal, Upload, Alert };
});
let app: App | undefined;
let root: HTMLDivElement;
const result = {
  batchId: '9007199254740993',
  mode: 'SKU' as const,
  createdIds: ['11'],
  updatedIds: ['12'],
};
const xlsx = {
  name: 'sku.xlsx',
  contentType:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  content: 'UEs=',
  rowCount: 2,
};
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await nextTick();
}
async function click(text: string) {
  const button = [...root.querySelectorAll('button')].find(
    (node) => node.textContent?.trim() === text,
  );
  requireValue(button, `missing button ${text}`).click();
  await settle();
}
const createDefaultContext = (): WorkbookContext => ({
  kind: 'sku',
  productId: '20',
  productName: '验收商品',
});
function mount(context: WorkbookContext = createDefaultContext()) {
  app = createApp(CatalogWorkbook, { context, onImported: state.imported });
  app.mount(root);
}
async function choose(name = '测试.xlsx') {
  state.file = new File(['test bytes'], name);
  requireValue(
    root.querySelector<HTMLInputElement>('input[type="file"]'),
    'missing workbook file input',
  ).dispatchEvent(new Event('change'));
  await settle();
}
beforeEach(() => {
  vi.clearAllMocks();
  state.allowed = true;
  state.file = undefined;
  state.template.mockResolvedValue(xlsx);
  state.export.mockResolvedValue(xlsx);
  state.import.mockResolvedValue(result);
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  app?.unmount();
  root.remove();
  app = undefined;
});

it('platform/unknown actor has no workbook controls or requests', async () => {
  state.allowed = false;
  mount();
  await settle();
  expect(root.querySelector('button')).toBeNull();
  expect(state.template).not.toHaveBeenCalled();
  expect(state.import).not.toHaveBeenCalled();
});
it('sKU tools preserve product context, selection is local, only confirmation imports and emits refresh', async () => {
  mount();
  await settle();
  expect(root.textContent).toContain('当前商品：验收商品（ID 20）');
  expect([...root.querySelectorAll('option')].map((o) => o.value)).toEqual([
    'SKU',
    'SKU_PRICE',
  ]);
  await click('导入SKU资料');
  expect(root.querySelector('[data-dialog]')).not.toBeNull();
  expect(
    requireValue(
      [...root.querySelectorAll('button')].find(
        (b) => b.textContent === '确认导入',
      ),
      'missing import confirmation',
    ).disabled,
  ).toBe(true);
  await choose();
  expect(state.import).not.toHaveBeenCalled();
  await click('确认导入');
  expect(state.import).toHaveBeenCalledOnce();
  expect(requireValue(state.import.mock.calls[0])[0]).toEqual({
    mode: 'SKU',
    productId: '20',
    query: {},
  });
  expect(state.imported).toHaveBeenCalledWith(result, '20');
  expect(root.textContent).toContain('新增 1 条，更新 1 条');
  expect(root.querySelector('[data-dialog]')).toBeNull();
});
it('invalid file produces inline guidance without an upload', async () => {
  mount();
  await settle();
  await click('导入SKU资料');
  await choose('wrong.xlsm');
  expect(root.textContent).toContain('不支持.xls或.xlsm');
  expect(state.import).not.toHaveBeenCalled();
});
it('cancel never writes and reopening preserves the same file selection', async () => {
  mount();
  await settle();
  await click('导入SKU资料');
  await choose();
  await click('取消');
  expect(state.import).not.toHaveBeenCalled();
  await click('导入SKU资料');
  expect(root.textContent).toContain('测试.xlsx');
});
it('failed import keeps file/error and retries the identical command without duplicate concurrent submit', async () => {
  state.import
    .mockRejectedValueOnce(new Error('Excel第2行：版本冲突'))
    .mockResolvedValue(result);
  mount();
  await settle();
  await click('导入SKU资料');
  await choose();
  await click('确认导入');
  expect(root.textContent).toContain('Excel第2行：版本冲突');
  expect(root.textContent).toContain('测试.xlsx');
  await click('取消');
  await click('导入SKU资料');
  expect(root.textContent).toContain('Excel第2行：版本冲突');
  await click('使用原文件重试');
  expect(requireValue(state.import.mock.calls[0])[2]).toBe(
    requireValue(state.import.mock.calls[1])[2],
  );
  expect(state.imported).toHaveBeenCalledOnce();
});
it('selecting a replacement file after failure creates a new command', async () => {
  state.import
    .mockRejectedValueOnce(new Error('invalid rowCount'))
    .mockResolvedValue(result);
  mount();
  await settle();
  await click('导入SKU资料');
  await choose();
  await click('确认导入');
  await choose('修正.xlsx');
  await click('确认导入');
  expect(requireValue(state.import.mock.calls[0])[2]).not.toBe(
    requireValue(state.import.mock.calls[1])[2],
  );
});
it('downloads only on explicit actions and uses product price filter projection', async () => {
  mount({
    kind: 'product',
    query: { keyword: '玉', reviewStatus: 'APPROVED' },
  });
  await settle();
  expect(state.template).not.toHaveBeenCalled();
  expect(state.export).not.toHaveBeenCalled();
  const select = requireValue(root.querySelector<HTMLSelectElement>('select'));
  select.value = 'PRODUCT_PRICE';
  select.dispatchEvent(new Event('change'));
  await settle();
  await click('下载模板');
  await click('导出商品价格');
  expect(state.download).toHaveBeenCalledTimes(2);
  expect(root.textContent).toContain('已生成 sku.xlsx（2 条数据）');
  expect(state.export).toHaveBeenCalledWith({
    mode: 'PRODUCT_PRICE',
    productId: null,
    query: { keyword: '玉', reviewStatus: 'APPROVED' },
  });
});
it('download failures use the public error dialog without claiming success', async () => {
  state.export.mockRejectedValueOnce(
    new Error('最多导出5000条，请缩小筛选范围'),
  );
  mount();
  await settle();
  await click('导出SKU资料');
  expect(root.textContent).toContain('最多导出5000条');
  expect(state.download).not.toHaveBeenCalled();
});
it('keeps confirmed import result across parent refresh with equivalent context and temporary loading', async () => {
  const parent = reactive<{ context: WorkbookContext; disabled: boolean }>({
    context: { kind: 'sku', productId: '20', productName: '原商品' },
    disabled: false,
  });
  app = createApp({
    render: () =>
      h(CatalogWorkbook, {
        context: parent.context,
        disabled: parent.disabled,
        onImported: () => {
          parent.context = {
            kind: 'sku',
            productId: '20',
            productName: '刷新商品',
          };
          parent.disabled = true;
        },
      }),
  });
  app.mount(root);
  await settle();
  await click('导入SKU资料');
  await choose();
  await click('确认导入');
  parent.disabled = false;
  await settle();
  expect(root.textContent).toContain('导入完成：批次 9007199254740993');
  expect(root.textContent).toContain('新增 1 条，更新 1 条');
  expect(root.textContent).toContain('刷新商品');
  expect(state.import).toHaveBeenCalledOnce();
});
it('equivalent parent context does not discard selected file but a real product change does', async () => {
  const parent = reactive<{ context: WorkbookContext }>({
    context: { kind: 'sku', productId: '20', productName: '原商品' },
  });
  app = createApp({
    render: () => h(CatalogWorkbook, { context: parent.context }),
  });
  app.mount(root);
  await settle();
  await click('导入SKU资料');
  await choose();
  parent.context = { kind: 'sku', productId: '20', productName: '同商品刷新' };
  await settle();
  expect(root.textContent).toContain('测试.xlsx');
  expect(root.querySelector('[data-dialog]')).not.toBeNull();
  parent.context = { kind: 'sku', productId: '21', productName: '另一商品' };
  await settle();
  expect(root.querySelector('[data-dialog]')).toBeNull();
  await click('导入SKU资料');
  expect(root.textContent).toContain('尚未选择有效文件');
  expect(state.import).not.toHaveBeenCalled();
});
