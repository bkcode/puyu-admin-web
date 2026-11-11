import type { App } from 'vue';

import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import Credits from '../../views/puyu-admin/real/Credits.vue';
import { requireValue } from './testAssertions';
const state = vi.hoisted(() => ({
  allowed: true,
  export: vi.fn(),
  download: vi.fn(),
  ledger: vi.fn(),
  accounts: vi.fn(),
  stats: vi.fn(),
  rules: vi.fn(),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('#/application/adminBusinessService', () => ({
  AdminBusinessService: {
    exportLedger: state.export,
    ledger: state.ledger,
    creditAccounts: state.accounts,
    creditStatistics: state.stats,
  },
}));
vi.mock('#/application/operationsService', () => ({
  OperationsService: { modelRules: state.rules },
  createOperationRequest: () => () => ({ requestId: 'unused' }),
}));
vi.mock('#/infrastructure/permission/permission', () => ({
  permission: { canManageCredits: () => state.allowed },
}));
vi.mock('#/views/puyu-admin/real/BusinessFiles.vue', () => ({
  default: { render: () => null },
}));
vi.mock('#/views/puyu-admin/real/BusinessPicker.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      props: ['modelValue', 'disabled'],
      emits: ['update:modelValue'],
      setup:
        (p, { emit }) =>
        () =>
          h('input', {
            'aria-label': 'test-account',
            value: p.modelValue ?? '',
            disabled: p.disabled,
            onInput: (e: Event) =>
              emit('update:modelValue', (e.target as HTMLInputElement).value),
          }),
    }),
  };
});
vi.mock('#/ui/pc-web-a/publicUi/api-error-dialog.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      props: ['open', 'message'],
      emits: ['close'],
      setup:
        (p, { emit }) =>
        () =>
          p.open
            ? h('section', { 'data-api-error': true }, [
                p.message,
                h('button', { onClick: () => emit('close') }, '关闭错误'),
              ])
            : null,
    }),
  };
});
vi.mock('#/views/puyu-admin/real/businessUi', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, downloadExport: state.download };
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
  const Input = defineComponent({
    props: ['value', 'disabled', 'type'],
    emits: ['update:value'],
    setup:
      (p, { emit, attrs }) =>
      () =>
        h('input', {
          ...attrs,
          value: p.value ?? '',
          disabled: p.disabled,
          type: p.type ?? 'text',
          onInput: (e: Event) =>
            emit('update:value', (e.target as HTMLInputElement).value),
        }),
  });
  const Select = defineComponent({
    props: ['value', 'options', 'disabled'],
    emits: ['update:value'],
    setup:
      (p, { emit }) =>
      () =>
        h(
          'select',
          {
            value: p.value ?? '',
            disabled: p.disabled,
            onChange: (e: Event) =>
              emit('update:value', (e.target as HTMLSelectElement).value),
          },
          [
            h('option', { value: '' }, '全部'),
            ...(p.options ?? []).map((o: any) =>
              h('option', { value: o.value }, o.label),
            ),
          ],
        ),
  });
  const Tabs = Object.assign(
    defineComponent({
      props: ['activeKey'],
      emits: ['update:activeKey', 'change'],
      setup:
        (_p, { emit, slots }) =>
        () =>
          h('div', [
            h(
              'button',
              {
                onClick: () => {
                  emit('update:activeKey', 'ledger');
                  emit('change', 'ledger');
                },
              },
              '流水测试页签',
            ),
            slots.default?.(),
          ]),
    }),
    { TabPane: Container },
  );
  const Alert = defineComponent({
    props: ['message', 'description'],
    setup: (p) => () => h('p', `${p.message} ${p.description ?? ''}`),
  });
  return {
    Alert,
    Button,
    Card: Container,
    Descriptions: Object.assign(Container, { Item: Container }),
    Form: Object.assign(Container, { Item: Container }),
    Input: Object.assign(Input, { TextArea: Input }),
    Modal: Container,
    Select,
    Space: Container,
    Statistic: Container,
    Table: Container,
    Tag: Container,
    Tabs,
    message: { success: vi.fn() },
  };
});
let app: App | undefined;
let root: HTMLDivElement;
const file = {
  name: 'credit-ledger.csv',
  contentType: 'text/csv;charset=UTF-8',
  content: '77u/YSxiDQo=',
  rowCount: 2,
};
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
async function fill(label: string, value: string) {
  const input = requireValue(
    root.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`),
    `missing input ${label}`,
  );
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle();
}
async function mount() {
  app = createApp(Credits, { pageId: 'platform-credit-management' });
  app.mount(root);
  await settle();
  await click('流水测试页签');
  await fill('test-account', '28');
  await fill('流水开始时间', '2026-10-23T00:00');
  await fill('流水结束时间', '2026-10-29T23:59:59');
}
beforeEach(() => {
  vi.clearAllMocks();
  state.allowed = true;
  state.accounts.mockResolvedValue({ total: '0', items: [] });
  state.ledger.mockResolvedValue({ total: '0', items: [] });
  state.stats.mockResolvedValue({
    totalBalance: '540',
    todayRechargedCredits: '0',
    todayRechargeCount: '0',
  });
  state.rules.mockResolvedValue({});
  state.export.mockResolvedValue(file);
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  root.remove();
});
it('shows actual filename/count and request snapshot, never claims disk save', async () => {
  await mount();
  expect(state.export).not.toHaveBeenCalled();
  await click('导出当前流水');
  expect(state.export).toHaveBeenCalledWith({
    accountId: '28',
    from: '2026-10-23T00:00',
    to: '2026-10-29T23:59:59',
  });
  expect(state.download).toHaveBeenCalledWith(file);
  expect(root.textContent).toContain('已生成 credit-ledger.csv（2 条流水）');
  expect(root.textContent).toContain('账户 28');
  expect(root.textContent).toContain('此提示不表示文件已保存到磁盘');
});
it('zero-row file is a valid success', async () => {
  state.export.mockResolvedValue({ ...file, rowCount: 0 });
  await mount();
  await click('导出当前流水');
  expect(root.textContent).toContain('（0 条流水）');
  expect(state.download).toHaveBeenCalledOnce();
});
it('filter changes clear stale success without automatically exporting again', async () => {
  await mount();
  await click('导出当前流水');
  await fill('test-account', '29');
  expect(root.textContent).not.toContain('已生成');
  expect(state.export).toHaveBeenCalledOnce();
});
it('failure clears old result, retains filters and public error; explicit retry reuses filters', async () => {
  await mount();
  await click('导出当前流水');
  state.export.mockRejectedValueOnce(new Error('最多导出10000条'));
  await click('导出当前流水');
  expect(root.textContent).not.toContain('已生成');
  expect(root.textContent).toContain('筛选条件已保留');
  expect(root.textContent).toContain('最多导出10000条');
  expect(
    requireValue(
      root.querySelector<HTMLInputElement>('input[aria-label="test-account"]'),
    ).value,
  ).toBe('28');
  await click('关闭错误');
  await click('导出当前流水');
  expect(requireValue(state.export.mock.calls[1])[0]).toEqual(
    requireValue(state.export.mock.calls[2])[0],
  );
  expect(state.download).toHaveBeenCalledTimes(2);
});
it('pending export locks filters and duplicate clicks only make one request', async () => {
  let resolve!: (value: any) => void;
  state.export.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await mount();
  const button = requireValue(
    [...root.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === '导出当前流水',
    ),
    'missing export button',
  );
  button.click();
  button.click();
  await settle();
  expect(state.export).toHaveBeenCalledOnce();
  expect(button.disabled).toBe(true);
  expect(
    requireValue(
      root.querySelector<HTMLInputElement>('input[aria-label="test-account"]'),
    ).disabled,
  ).toBe(true);
  expect(
    requireValue(
      root.querySelector<HTMLInputElement>('input[aria-label="流水开始时间"]'),
    ).disabled,
  ).toBe(true);
  resolve(file);
  await settle();
  expect(state.download).toHaveBeenCalledOnce();
});
it('unknown or merchant role does not expose export button', async () => {
  state.allowed = false;
  await mount();
  expect(
    [...root.querySelectorAll('button')].some(
      (b) => b.textContent === '导出当前流水',
    ),
  ).toBe(false);
  expect(state.export).not.toHaveBeenCalled();
});
