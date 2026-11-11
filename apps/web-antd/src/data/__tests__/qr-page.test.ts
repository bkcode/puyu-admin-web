import type { App } from 'vue';

import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import Cooperation from '../../views/puyu-admin/real/Cooperation.vue';
import { requireValue } from './testAssertions';
const state = vi.hoisted(() => ({
  qrs: vi.fn(),
  history: vi.fn(),
  scans: vi.fn(),
  image: vi.fn(),
  previewed: false,
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('#/application/adminBusinessService', () => ({
  AdminBusinessService: {
    qrs: state.qrs,
    qrHistory: state.history,
    qrScans: state.scans,
    qrImage: state.image,
  },
}));
vi.mock('#/infrastructure/permission/permission', () => ({
  permission: { canManageCooperation: () => true },
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
  const Table = defineComponent({
    props: ['dataSource', 'columns'],
    setup:
      (p, { slots }) =>
      () =>
        h(
          'div',
          (p.dataSource ?? []).map((record: any) =>
            h(
              'div',
              (p.columns ?? []).map(
                (column: any) =>
                  slots.bodyCell?.({ column, record }) ??
                  String(record[column.dataIndex] ?? ''),
              ),
            ),
          ),
        ),
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
    setup:
      (p, { slots }) =>
      () =>
        p.open ? h('section', slots.default?.()) : null,
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
    Switch: Container,
    Table,
    Tag: Container,
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
  const b = [...root.querySelectorAll('button')].find(
    (n) => n.textContent?.trim() === text,
  );
  requireValue(b, `missing button ${text}`).click();
  await settle();
}
beforeEach(() => {
  vi.clearAllMocks();
  state.previewed = false;
  state.qrs.mockResolvedValue([
    {
      id: '7',
      merchantId: '27',
      type: 'DESIGNER',
      code: 'test-only-code',
      enabled: true,
      expiresAt: null,
      createdAt: '',
    },
  ]);
  state.scans.mockResolvedValue([]);
  state.history.mockImplementation(async () => ({
    total: state.previewed ? '2' : '1',
    items: [
      {
        id: '1',
        action: 'CREATE',
        operatorId: '1',
        reason: '创建测试',
        createdAt: '',
      },
      ...(state.previewed
        ? [
            {
              id: '2',
              action: 'DOWNLOAD',
              operatorId: '1',
              reason: '预览测试',
              createdAt: '',
            },
          ]
        : []),
    ],
  }));
  state.image.mockImplementation(async () => {
    state.previewed = true;
    return {
      name: 'test.png',
      contentType: 'image/png',
      content: 'iVBORw0KGgo=',
    };
  });
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  app?.unmount();
  root.remove();
  app = undefined;
});
it('renders history action labels and refreshes history immediately after QR preview', async () => {
  app = createApp(Cooperation, { pageId: 'cooperation-qrcode' });
  app.mount(root);
  await settle();
  await click('查看/扫码记录');
  expect(root.textContent).toContain('创建');
  expect(state.history).toHaveBeenCalledOnce();
  await click('加载二维码预览（会记录操作）');
  expect(state.history).toHaveBeenCalledTimes(2);
  expect(root.textContent).toContain('预览/下载二维码');
  expect(state.image).toHaveBeenCalledWith('7');
});
