import type { App } from 'vue';

import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import Credits from '../../views/puyu-admin/real/Credits.vue';
import { requireValue } from './testAssertions';
const state = vi.hoisted(() => ({
  draft: vi.fn(),
  statistics: vi.fn(),
  action: vi.fn(),
  rules: vi.fn(),
  push: vi.fn(),
  balance: '540',
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { id: '1' } }),
  useRouter: () => ({ push: state.push }),
}));
vi.mock('#/application/adminBusinessService', () => ({
  AdminBusinessService: {
    draft: state.draft,
    creditStatistics: state.statistics,
    draftAction: state.action,
  },
}));
vi.mock('#/application/operationsService', () => ({
  OperationsService: { modelRules: state.rules },
  createOperationRequest: () => () => ({ requestId: 'same-command' }),
}));
vi.mock('#/infrastructure/permission/permission', () => ({
  permission: { canManageCredits: () => true },
}));
vi.mock('#/views/puyu-admin/real/BusinessFiles.vue', () => ({
  default: { render: () => null },
}));
vi.mock('#/views/puyu-admin/real/BusinessPicker.vue', () => ({
  default: { render: () => null },
}));
vi.mock('#/ui/pc-web-a/publicUi/api-error-dialog.vue', () => ({
  default: { render: () => null },
}));
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const Container = defineComponent({
    setup:
      (_p, { slots }) =>
      () =>
        h('div', slots.default?.()),
  });
  const Form = Object.assign(Container, { Item: Container });
  const Descriptions = Object.assign(Container, { Item: Container });
  const Tabs = Object.assign(Container, { TabPane: Container });
  const Statistic = defineComponent({
    props: ['title', 'value'],
    setup: (p) => () => h('p', `${p.title}: ${p.value}`),
  });
  const Button = defineComponent({
    emits: ['click'],
    setup:
      (_p, { slots, emit }) =>
      () =>
        h('button', { onClick: () => emit('click') }, slots.default?.()),
  });
  const Modal = defineComponent({
    props: { open: Boolean },
    emits: ['ok', 'cancel'],
    setup:
      (p, { slots, emit }) =>
      () =>
        p.open
          ? h('section', [
              slots.default?.(),
              h('button', { onClick: () => emit('ok') }, '确认额度'),
            ])
          : null,
  });
  return {
    Alert: Container,
    Button,
    Card: Container,
    Descriptions,
    Form,
    Input: Container,
    Modal,
    Select: Container,
    Space: Container,
    Statistic,
    Table: Container,
    Tag: Container,
    Tabs,
    message: { success: vi.fn() },
  };
});
let app: App | undefined;
let root: HTMLDivElement;
async function settle() {
  for (let i = 0; i < 15; i++) await Promise.resolve();
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
  state.balance = '540';
  const draft = {
    id: '1',
    version: 0,
    status: 'DRAFT',
    content: {
      accountId: '28',
      type: 'RECHARGE',
      amount: '10',
      reason: '验收',
      voucherFileId: null,
      receivedAmount: null,
    },
  };
  state.draft.mockResolvedValue(draft);
  state.statistics.mockImplementation(async () => ({
    totalBalance: state.balance,
    todayRechargedCredits: state.balance === '540' ? '0' : '10',
    todayRechargeCount: state.balance === '540' ? '0' : '1',
  }));
  state.rules.mockResolvedValue({
    freeMonths: 3,
    freeDownloads: 5,
    creditsPerDownload: '10',
    source: 'Nacos',
  });
  state.action.mockImplementation(async () => {
    state.balance = '550';
    return { ...draft, status: 'SUBMITTED', version: 1 };
  });
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  app?.unmount();
  root.remove();
  app = undefined;
});
it('refreshes aggregate credit cards after submitting without requiring route navigation', async () => {
  app = createApp(Credits, { pageId: 'platform-credit-recharge' });
  app.mount(root);
  await settle();
  expect(root.textContent).toContain('平台账户额度总余额: 540');
  await click('提交额度');
  await click('确认额度');
  expect(state.action).toHaveBeenCalledOnce();
  expect(state.statistics).toHaveBeenCalledTimes(2);
  expect(root.textContent).toContain('平台账户额度总余额: 550');
  expect(root.textContent).toContain('今日充值额度: 10');
  expect(state.push).not.toHaveBeenCalled();
});
