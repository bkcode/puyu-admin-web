import type { App } from 'vue';

import type { Merchant } from '../realAdminApi';

import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { RealAdminService } from '../../application/realAdminService';
import Merchants from '../../views/puyu-admin/real/Merchants.vue';
import { configureRealTokenProvider } from '../realAdminApi';
import { requireValue } from './testAssertions';
const state = vi.hoisted(() => ({ query: {} as { id?: string } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: state.query }),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('#/infrastructure/permission/permission', () => ({
  permission: { canManageMerchants: () => true },
}));
vi.mock('#/views/puyu-admin/real/ImageUpload.vue', () => ({
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
  const Form = Object.assign(
    defineComponent({
      setup: (_p, { slots, expose }) => {
        expose({ validate: async () => {} });
        return () => h('div', slots.default?.());
      },
    }),
    { Item: Container },
  );
  const Input = defineComponent({
    props: ['value', 'type', 'disabled'],
    emits: ['update:value'],
    setup:
      (p, { emit, attrs }) =>
      () =>
        h('input', {
          ...attrs,
          value: p.value,
          type: p.type,
          disabled: p.disabled,
          onInput: (e: Event) =>
            emit('update:value', (e.target as HTMLInputElement).value),
        }),
  });
  const Button = defineComponent({
    emits: ['click'],
    setup:
      (_p, { slots, emit }) =>
      () =>
        h('button', { onClick: () => emit('click') }, slots.default?.()),
  });
  const Alert = defineComponent({
    props: ['message'],
    setup: (p) => () => h('aside', p.message),
  });
  return {
    Alert,
    Button,
    Card: Container,
    Descriptions: Object.assign(Container, { Item: Container }),
    Form,
    Input: Object.assign(Input, { TextArea: Input }),
    Select: Container,
    Space: Container,
    Switch: Container,
    Table: Container,
    Tag: Container,
    message: { success: vi.fn() },
  };
});
const record: Merchant = {
  id: '27',
  accountId: '28',
  code: 'M-27',
  version: 2,
  serviceStatus: 'ACTIVE',
  content: {
    name: '合成商户',
    type: 'DEALER',
    loginPhone: '13900000001',
    storeName: '合成门店',
    address: '',
    contact: '测试',
    phone: '13900000001',
    serviceStart: '2026-10-23',
    serviceEnd: '2027-10-23',
    enabled: true,
    remark: '',
    introduction: '',
    logoFileId: null,
    wechatFileId: null,
  },
};
const fetchMock = vi.fn();
let app: App | undefined;
let root: HTMLDivElement;
async function settle() {
  for (let i = 0; i < 15; i++) await Promise.resolve();
  await nextTick();
}
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    Response.json({ code: 0, msg: 'ok', data: record }),
  );
  vi.stubGlobal('fetch', fetchMock);
  configureRealTokenProvider(() => 'synthetic-test');
  state.query = {};
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  root.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  configureRealTokenProvider(() => undefined);
});
it('rejects changed service end before any API request for an existing merchant', async () => {
  await expect(
    RealAdminService.saveMerchant(
      { ...record.content, serviceEnd: '2028-10-23' },
      record,
    ),
  ).rejects.toThrow('服务账单');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('preserves ordinary versioned edits with the same service end', async () => {
  await RealAdminService.saveMerchant(
    { ...record.content, storeName: '新门店' },
    record,
  );
  const [url, request] = requireValue(fetchMock.mock.calls[0]);
  expect(url).toBe('/admin-api/v1/business/merchants/27');
  expect(request.method).toBe('PUT');
  expect(JSON.parse(request.body)).toEqual({
    version: 2,
    content: { ...record.content, storeName: '新门店' },
  });
});
it('still allows the initial service end when onboarding', async () => {
  await RealAdminService.saveMerchant(record.content);
  const [url, request] = requireValue(fetchMock.mock.calls[0]);
  expect(url).toBe('/admin-api/v1/business/merchants');
  expect(request.method).toBe('POST');
  expect(JSON.parse(request.body).serviceEnd).toBe('2027-10-23');
});
it('propagates backend rejection rather than silently rewriting a requested end date', async () => {
  fetchMock.mockResolvedValue(
    Response.json({
      code: 20_000,
      msg: '服务到期日期只能通过服务账单确认调整',
      data: null,
    }),
  );
  await expect(
    RealAdminService.saveMerchant(record.content, record),
  ).rejects.toThrow('服务账单');
});
it('shows the existing end as disabled in merchant editing and explains the billing path', async () => {
  state.query = { id: '27' };
  vi.spyOn(RealAdminService, 'merchant').mockResolvedValue(
    structuredClone(record),
  );
  app = createApp(Merchants, { pageId: 'platform-merchant-form' });
  app.mount(root);
  await settle();
  const dates = root.querySelectorAll<HTMLInputElement>('input[type="date"]');
  expect(dates).toHaveLength(2);
  expect(requireValue(dates[1]).value).toBe('2027-10-23');
  expect(requireValue(dates[1]).disabled).toBe(true);
  expect(root.textContent).toContain('服务账单');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('leaves onboarding end editable without inventing an automatic bill submission', async () => {
  app = createApp(Merchants, { pageId: 'platform-merchant-form' });
  app.mount(root);
  await settle();
  const dates = root.querySelectorAll<HTMLInputElement>('input[type="date"]');
  expect(dates).toHaveLength(2);
  expect(requireValue(dates[1]).disabled).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});
