import type { App } from 'vue';

import type { CatalogBatchRow } from '../../application/catalogBatchService';

import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import CatalogBatch from '../../views/puyu-admin/real/CatalogBatch.vue';
import { requireValue } from './testAssertions';
vi.mock('#/ui/pc-web-a/publicUi/api-error-dialog.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      props: ['open', 'message'],
      setup: (p) => () =>
        p.open ? h('p', { 'data-api-error': true }, p.message) : null,
    }),
  };
});
const state = vi.hoisted(() => ({
  role: 'merchant',
  execute: vi.fn(),
  completed: vi.fn(),
  busy: vi.fn(),
  clear: vi.fn(),
}));
vi.mock('#/data/catalogBatchApi', () => ({
  catalogBatchRepository: { execute: state.execute },
}));
vi.mock('#/infrastructure/permission/permission', () => ({
  permission: {
    canEditProduct: () => state.role === 'merchant',
    canEditCategory: () => state.role === 'merchant',
    canEditBrand: () => state.role === 'merchant',
    canSubmitCatalog: () => state.role === 'merchant',
    canPublishProduct: () => state.role === 'platform',
    canOfflineProduct: () => state.role === 'platform',
    canReviewCategory: () => state.role === 'platform',
  },
}));
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const Container = defineComponent({
    setup:
      (_p, { slots }) =>
      () =>
        h('div', slots.default?.()),
  });
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
  const TextArea = defineComponent({
    props: ['value', 'disabled'],
    emits: ['update:value'],
    setup:
      (p, { emit }) =>
      () =>
        h('textarea', {
          value: p.value,
          disabled: p.disabled,
          onInput: (e: Event) =>
            emit('update:value', (e.target as HTMLTextAreaElement).value),
        }),
  });
  const Modal = defineComponent({
    props: ['open'],
    setup:
      (p, { slots }) =>
      () =>
        p.open
          ? h('section', { 'data-dialog': 'batch' }, slots.default?.())
          : null,
  });
  const Table = defineComponent({
    props: ['dataSource'],
    setup: (p) => () =>
      h(
        'div',
        (p.dataSource ?? []).map((r: any) =>
          h('p', `${r.name} ${r.code} ${r.id} v${r.version}`),
        ),
      ),
  });
  const Alert = defineComponent({
    props: ['message', 'description'],
    setup: (p) => () => h('p', `${p.message} ${p.description ?? ''}`),
  });
  return {
    Button,
    Alert,
    Form: Object.assign(Container, { Item: Container }),
    Input: Object.assign(Container, { TextArea }),
    Modal,
    Space: Container,
    Table,
  };
});
let app: App | undefined;
let root: HTMLDivElement;
const row = (patch: Partial<CatalogBatchRow> = {}): CatalogBatchRow => ({
  id: '9007199254740993',
  version: 2,
  kind: 'PRODUCT',
  name: '验收商品',
  code: 'p1',
  enabled: true,
  reviewStatus: 'DRAFT',
  displayStatus: 'HIDDEN',
  ...patch,
});
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await nextTick();
}
async function click(text: string) {
  const button = [...root.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text,
  );
  requireValue(button, `missing button ${text}`).click();
  await settle();
}
async function fill(value: string) {
  const input = requireValue(
    root.querySelector<HTMLTextAreaElement>('textarea'),
  );
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle();
}
function mount(
  rows = [row()],
  kind: 'BRAND' | 'CATEGORY' | 'PRODUCT' = 'PRODUCT',
  platform = state.role === 'platform',
) {
  app = createApp(CatalogBatch, {
    rows,
    kind,
    platform,
    onCompleted: state.completed,
    onBusy: state.busy,
    onClear: state.clear,
  });
  return app.mount(root) as unknown as {
    openSingle: (value: CatalogBatchRow) => void;
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.role = 'merchant';
  state.execute.mockImplementation(async (req: any) =>
    req.items.map((item: any) => row({ ...item, kind: req.kind })),
  );
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  app?.unmount();
  root.remove();
  app = undefined;
});
it('merchant controls contain only maintenance actions, selection preview, cancellation never writes', async () => {
  mount();
  await settle();
  expect(root.textContent).toContain('本页已选 1 条商品');
  expect(root.textContent).not.toContain('批量通过并发布');
  await click('批量提交审核');
  expect(root.textContent).toContain('9007199254740993 v2');
  expect(state.execute).not.toHaveBeenCalled();
  await click('取消');
  expect(state.execute).not.toHaveBeenCalled();
  await click('清空选择');
  expect(state.clear).toHaveBeenCalledOnce();
});
it('platform controls only governance, rejection reason is required before transmission', async () => {
  state.role = 'platform';
  mount([row({ reviewStatus: 'PENDING' })]);
  await settle();
  expect(root.textContent).not.toContain('批量启用');
  await click('批量驳回');
  await click('确认驳回');
  expect(root.textContent).toContain('必须填写处理原因');
  expect(state.execute).not.toHaveBeenCalled();
  await fill('不合规材料说明');
  await click('确认驳回');
  expect(requireValue(state.execute.mock.calls[0])[0].reason).toBe(
    '不合规材料说明',
  );
  expect(state.completed).toHaveBeenCalledOnce();
});
it.each(['CATEGORY', 'BRAND'] as const)(
  'uses existing permissions and correct kind for merchant %s',
  async (kind) => {
    mount([row({ kind, enabled: false })], kind);
    await settle();
    await click('批量启用');
    await click('确认启用');
    expect(requireValue(state.execute.mock.calls[0])[0].kind).toBe(kind);
    expect(state.completed).toHaveBeenCalledOnce();
  },
);
it('unknown role has no actions or requests', async () => {
  state.role = 'unknown';
  mount();
  await settle();
  expect(root.querySelector('button')).toBeNull();
  expect(state.execute).not.toHaveBeenCalled();
});
it('empty selection disables buttons', async () => {
  mount([]);
  await settle();
  expect([...root.querySelectorAll('button')].every((b) => b.disabled)).toBe(
    true,
  );
});
it('ineligible mixed selection is not silently filtered or partially submitted', async () => {
  mount([row(), row({ id: '2', reviewStatus: 'PENDING' })]);
  await settle();
  await click('批量提交审核');
  await click('确认提交审核');
  expect(root.textContent).toContain('不会自动跳过');
  expect(state.execute).not.toHaveBeenCalled();
});
it('network failure keeps same request on close/reopen retry; busy prevents duplicates and signals complete only after unlock', async () => {
  state.execute
    .mockRejectedValueOnce(new Error('timeout'))
    .mockResolvedValue([row()]);
  mount();
  await settle();
  await click('批量提交审核');
  await click('确认提交审核');
  expect(root.textContent).toContain('timeout');
  await click('取消');
  await click('批量提交审核');
  await click('使用原批次重试');
  expect(requireValue(state.execute.mock.calls[0])[0]).toEqual(
    requireValue(state.execute.mock.calls[1])[0],
  );
  expect(state.completed).toHaveBeenCalledOnce();
  expect(state.busy.mock.calls.map((c) => c[0])).toEqual([
    true,
    false,
    true,
    false,
  ]);
  expect(requireValue(state.busy.mock.invocationCallOrder.at(-1))).toBeLessThan(
    requireValue(state.completed.mock.invocationCallOrder[0]),
  );
});
it('changing reason after failure creates new operation instead of reusing a different payload', async () => {
  state.role = 'platform';
  state.execute
    .mockRejectedValueOnce(new Error('timeout'))
    .mockResolvedValue([row({ reviewStatus: 'PENDING' })]);
  mount([row({ reviewStatus: 'PENDING' })]);
  await settle();
  await click('批量驳回');
  await fill('旧原因');
  await click('确认驳回');
  await fill('新原因');
  await click('使用原批次重试');
  expect(requireValue(state.execute.mock.calls[0])[0].requestId).not.toBe(
    requireValue(state.execute.mock.calls[1])[0].requestId,
  );
  expect(requireValue(state.execute.mock.calls[1])[0].reason).toBe('新原因');
});
it('double confirm while HTTP is pending only executes once', async () => {
  let resolve!: (value: any) => void;
  state.execute.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  mount();
  await settle();
  await click('批量提交审核');
  const button = requireValue(
    [...root.querySelectorAll('button')].find(
      (b) => b.textContent === '确认提交审核',
    ),
    'missing batch confirmation',
  );
  button.click();
  button.click();
  await settle();
  expect(state.execute).toHaveBeenCalledOnce();
  resolve([row()]);
  await settle();
  expect(state.completed).toHaveBeenCalledOnce();
});
it.each(['PRODUCT', 'CATEGORY', 'BRAND'] as const)(
  'single %s command ignores checkbox selection and sends only the clicked row',
  async (kind) => {
    const selected = row({ id: '10', kind });
    const target = row({
      id: '9007199254740995',
      version: 7,
      kind,
      enabled: false,
      name: '单条目标',
    });
    const view = mount([selected], kind);
    await settle();
    view.openSingle(target);
    await settle();
    expect(root.textContent).toContain('启用 1 条');
    expect(root.querySelector('[data-dialog]')?.textContent).toContain(
      '单条目标',
    );
    expect(root.querySelector('[data-dialog]')?.textContent).not.toContain(
      '验收商品',
    );
    expect(state.execute).not.toHaveBeenCalled();
    await click('确认启用');
    expect(requireValue(state.execute.mock.calls[0])[0]).toMatchObject({
      kind,
      action: 'ENABLE',
      items: [{ id: target.id, version: 7 }],
    });
    expect(state.completed).toHaveBeenCalledWith(1);
    expect(state.clear).not.toHaveBeenCalled();
  },
);
it('single cancel leaves checkbox selection and original row unchanged', async () => {
  const target = row();
  const view = mount([row({ id: '10' })]);
  await settle();
  view.openSingle(target);
  await settle();
  await click('取消');
  expect(state.execute).not.toHaveBeenCalled();
  expect(state.clear).not.toHaveBeenCalled();
  expect(target.enabled).toBe(true);
  expect(root.textContent).toContain('本页已选 1 条商品');
});
it('single error close/reopen retries original key; a different target creates a new key', async () => {
  state.execute
    .mockRejectedValueOnce(new Error('timeout'))
    .mockImplementation(async (req: any) =>
      req.items.map((item: any) => row(item)),
    );
  const view = mount([]);
  await settle();
  const target = row();
  view.openSingle(target);
  await settle();
  await click('确认停用');
  await click('取消');
  view.openSingle(target);
  await settle();
  await click('使用原操作重试');
  expect(requireValue(state.execute.mock.calls[0])[0].requestId).toBe(
    requireValue(state.execute.mock.calls[1])[0].requestId,
  );
  view.openSingle(row({ id: '2' }));
  await settle();
  await click('确认停用');
  expect(requireValue(state.execute.mock.calls[2])[0].requestId).not.toBe(
    requireValue(state.execute.mock.calls[1])[0].requestId,
  );
});
it('switching from single to batch never reuses the single target or operation', async () => {
  state.execute
    .mockRejectedValueOnce(new Error('timeout'))
    .mockImplementation(async (req: any) =>
      req.items.map((item: any) => row(item)),
    );
  const view = mount([row({ id: '10' })]);
  await settle();
  view.openSingle(row({ id: '2' }));
  await settle();
  await click('确认停用');
  await click('取消');
  await click('批量停用');
  await click('确认停用');
  expect(requireValue(state.execute.mock.calls[0])[0].items).toEqual([
    { id: '2', version: 2 },
  ]);
  expect(requireValue(state.execute.mock.calls[1])[0].items).toEqual([
    { id: '10', version: 2 },
  ]);
  expect(requireValue(state.execute.mock.calls[0])[0].requestId).not.toBe(
    requireValue(state.execute.mock.calls[1])[0].requestId,
  );
});
it.each(['platform', 'unknown'])(
  'imperative single entry cannot bypass %s permission',
  async (role) => {
    state.role = role;
    const view = mount();
    await settle();
    view.openSingle(row());
    await settle();
    expect(root.querySelector('[data-dialog]')).toBeNull();
    expect(state.execute).not.toHaveBeenCalled();
  },
);
