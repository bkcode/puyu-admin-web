import type { App } from 'vue';

import type { Bill, BillInput } from '../adminBusinessApi';

import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import Billing from '../../views/puyu-admin/real/Billing.vue';
import { configureRealTokenProvider } from '../realAdminApi';
import { requireValue } from './testAssertions';

const state = vi.hoisted(() => ({ allowed: true }));
vi.mock('#/infrastructure/permission/permission', () => ({
  permission: { canManageBilling: () => state.allowed },
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
            'data-test': 'merchant',
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
            ? h('aside', { 'data-test': 'error' }, [
                p.message,
                h('button', { onClick: () => emit('close') }, '关闭错误'),
              ])
            : null,
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
  const Item = defineComponent({
    props: ['label'],
    setup:
      (p, { slots }) =>
      () =>
        h('label', [p.label, slots.default?.()]),
  });
  const Button = defineComponent({
    props: ['disabled', 'loading'],
    emits: ['click'],
    setup:
      (p, { emit, slots }) =>
      () =>
        h(
          'button',
          { disabled: p.disabled || p.loading, onClick: () => emit('click') },
          slots.default?.(),
        ),
  });
  const input = (tag: string) =>
    defineComponent({
      props: ['value', 'disabled', 'type'],
      emits: ['update:value'],
      setup:
        (p, { emit, attrs }) =>
        () =>
          h(tag, {
            ...attrs,
            type: p.type,
            value: p.value ?? '',
            disabled: p.disabled,
            onInput: (e: Event) =>
              emit('update:value', (e.target as HTMLInputElement).value),
          }),
    });
  const Drawer = defineComponent({
    props: ['open', 'title'],
    setup:
      (p, { slots }) =>
      () =>
        p.open
          ? h('section', { 'data-test': 'drawer' }, [
              h('h2', p.title),
              slots.default?.(),
            ])
          : null,
  });
  const Modal = defineComponent({
    props: ['open', 'title', 'confirmLoading'],
    emits: ['ok', 'cancel'],
    setup:
      (p, { emit, slots }) =>
      () =>
        p.open
          ? h('section', { 'data-test': p.title }, [
              slots.default?.(),
              h(
                'button',
                {
                  'data-test': 'modal-ok',
                  disabled: p.confirmLoading,
                  onClick: () => emit('ok'),
                },
                '确认保存',
              ),
              h('button', { onClick: () => emit('cancel') }, '关闭保存确认'),
            ])
          : null,
  });
  return {
    Alert: Container,
    Button,
    Card: Container,
    Drawer,
    Modal,
    Select: Container,
    Form: Object.assign(Container, { Item }),
    Descriptions: Object.assign(Container, { Item }),
    Input: Object.assign(input('input'), { TextArea: input('textarea') }),
    Space: Container,
    Table: Container,
    Tag: Container,
    message: { success: vi.fn() },
  };
});

type SaveBody = { content: BillInput; requestId: string; version?: number };
const requests: { body: SaveBody; method: string; url: string }[] = [];
const records = new Map<string, Bill>();
const commands = new Map<string, { id: string; payload: string }>();
const fetchMock = vi.fn();
let failure: 'after' | 'before' | undefined;
let historyFailure = false;
let pageFailure = false;
let pauseSave = false;
let releaseSave: (() => void) | undefined;
let app: App | undefined;
let root: HTMLDivElement;
const ok = (data: unknown) => Response.json({ code: 0, msg: 'ok', data });

// Synthetic in-memory BFF model only: it makes command replay observable without business writes.
function write(url: string, body: SaveBody): Bill {
  const operation = url === '/admin-api/v1/business/bills' ? 'create' : url;
  const key = `${operation}:${body.requestId}`;
  const payload = JSON.stringify(body);
  const remembered = commands.get(key);
  if (remembered) {
    if (remembered.payload !== payload)
      throw new Error('same command changed payload');
    return requireValue(records.get(remembered.id));
  }
  const id =
    operation === 'create'
      ? String(100 + records.size)
      : requireValue(url.split('/').at(-1));
  const old = records.get(id);
  if (old && old.version !== body.version)
    throw new Error('synthetic version conflict');
  const record: Bill = {
    id,
    code: `BILL-${id}`,
    content: { ...body.content },
    oldServiceEnd: '2027-10-23',
    status: 'PENDING',
    receivedAt: null,
    creditLedgerId: null,
    version: old ? old.version + 1 : 0,
    operatorId: '1',
    createdAt: '2026-10-30T09:00:00',
    updatedAt: '2026-10-30T09:00:00',
  };
  records.set(id, record);
  commands.set(key, { payload, id });
  return record;
}
async function settle() {
  for (let i = 0; i < 25; i++) await Promise.resolve();
  await nextTick();
}
function button(text: string) {
  const found = [...root.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text,
  );
  return requireValue(found, `missing button ${text}`);
}
async function click(text: string) {
  button(text).click();
  await settle();
}
async function fill(selector: string, value: string) {
  const element = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    selector,
  );
  const input = requireValue(element, `missing input ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}
async function create(remark = '合成账单，不是真实入账') {
  await click('新增待入账');
  await fill('[data-test="drawer"] [data-test="merchant"]', '27');
  await fill('[data-test="drawer"] textarea', remark);
}
async function save() {
  await click('保存待入账');
  await click('确认保存');
}
async function closeAndCreate(remark?: string) {
  if (root.querySelector('[data-test="确认保存待入账"]'))
    await click('关闭保存确认');
  if (root.querySelector('[data-test="error"]')) await click('关闭错误');
  await click('取消/返回');
  await create(remark);
}
beforeEach(async () => {
  state.allowed = true;
  requests.length = 0;
  records.clear();
  commands.clear();
  failure = undefined;
  historyFailure = false;
  pageFailure = false;
  pauseSave = false;
  releaseSave = undefined;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    const method = init.method ?? 'GET';
    if (url === '/admin-api/v1/business/bills/page') {
      if (pageFailure) {
        pageFailure = false;
        throw new Error('synthetic list refresh failure');
      }
      return ok({ total: String(records.size), items: [...records.values()] });
    }
    if (url.startsWith('/admin-api/v1/business/bills/monthly/'))
      return ok({
        month: '2026-10',
        confirmedCount: '0',
        confirmedAmount: '0.00',
        pendingCount: String(records.size),
        pendingAmount: '0.00',
        voidCount: '0',
        voidAmount: '0.00',
      });
    if (url.endsWith('/history')) {
      if (historyFailure) {
        historyFailure = false;
        throw new Error('synthetic history refresh failure');
      }
      return ok([]);
    }
    if (
      url === '/admin-api/v1/business/bills' ||
      (method === 'PUT' && /\/bills\/\d+$/.test(url))
    ) {
      const body: SaveBody = JSON.parse(String(init.body));
      requests.push({ url, method, body });
      const fail = failure;
      failure = undefined;
      if (fail === 'before') throw new Error('synthetic request failure');
      if (pauseSave)
        await new Promise<void>((resolve) => {
          releaseSave = resolve;
        });
      const result = write(url, body);
      if (fail === 'after') throw new Error('synthetic response lost');
      return ok(result);
    }
    throw new Error(`unexpected endpoint ${method} ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  configureRealTokenProvider(() => 'synthetic-test-token');
  root = document.createElement('div');
  document.body.append(root);
  app = createApp(Billing);
  app.mount(root);
  await settle();
});
afterEach(() => {
  app?.unmount();
  root.remove();
  app = undefined;
  configureRealTokenProvider(() => undefined);
  vi.unstubAllGlobals();
});

it('saves a nonzero bill without voucher but blocks confirmation before sending any transition', async () => {
  await create();
  await fill('[aria-label="入账金额"]', '12.50');
  await save();
  expect(records.size).toBe(1);
  expect(requireValue(requests[0]).body.content.voucherFileId).toBeNull();
  await click('确认入账');
  await fill('[data-test="确认真实入账"] textarea', '核对入账');
  await fill(
    '[data-test="确认真实入账"] input[type="datetime-local"]',
    '2026-10-01T09:00',
  );
  await click('确认保存');
  expect(root.querySelector('[data-test="error"]')?.textContent).toContain(
    '有效凭证',
  );
  expect(
    fetchMock.mock.calls.some(([url]) => String(url).endsWith('/transition')),
  ).toBe(false);
  expect(requireValue([...records.values()][0]).status).toBe('PENDING');
});
it('creates distinct bills and command IDs for consecutive identical successful new entries', async () => {
  await create();
  await save();
  await closeAndCreate();
  await save();
  expect(requests).toHaveLength(2);
  expect(requireValue(requests[0]).body.content).toEqual(
    requireValue(requests[1]).body.content,
  );
  expect(requireValue(requests[0]).body.requestId).not.toBe(
    requireValue(requests[1]).body.requestId,
  );
  expect(records.size).toBe(2);
  expect(root.textContent).toContain('BILL-101');
});

it('reuses the same command for an unchanged save after request failure', async () => {
  await create();
  failure = 'before';
  await save();
  expect(records.size).toBe(0);
  expect(root.textContent).toContain('synthetic request failure');
  await click('关闭错误');
  await click('确认保存');
  expect(requireValue(requests[0]).body).toEqual(
    requireValue(requests[1]).body,
  );
  expect(records.size).toBe(1);
});

it('recovers an uncertain write after close/reopen without duplication, then rotates for the next new bill', async () => {
  await create();
  failure = 'after';
  await save();
  expect(records.size).toBe(1);
  expect(root.textContent).toContain('synthetic response lost');
  await closeAndCreate();
  await save();
  expect(requireValue(requests[0]).body).toEqual(
    requireValue(requests[1]).body,
  );
  expect(records.size).toBe(1);
  await closeAndCreate();
  await save();
  expect(requireValue(requests[2]).body.requestId).not.toBe(
    requireValue(requests[1]).body.requestId,
  );
  expect(records.size).toBe(2);
});

it.each(['history', 'list'])(
  'ends a confirmed save before a subsequent %s refresh failure',
  async (kind) => {
    await create();
    if (kind === 'history') historyFailure = true;
    else pageFailure = true;
    await save();
    expect(records.size).toBe(1);
    expect(root.textContent).toContain(`synthetic ${kind} refresh failure`);
    await closeAndCreate();
    await save();
    expect(requireValue(requests[0]).body.requestId).not.toBe(
      requireValue(requests[1]).body.requestId,
    );
    expect(records.size).toBe(2);
  },
);

it('changes the command when the failed save payload changes', async () => {
  await create();
  failure = 'before';
  await save();
  await click('关闭错误');
  await click('关闭保存确认');
  await fill('[data-test="drawer"] textarea', '另一份合成备注');
  await save();
  expect(requireValue(requests[0]).body.requestId).not.toBe(
    requireValue(requests[1]).body.requestId,
  );
  expect(records.size).toBe(1);
});

it('does not save on opening or cancelling the save confirmation, and never confirms income automatically', async () => {
  await create();
  await click('保存待入账');
  expect(requests).toHaveLength(0);
  await click('关闭保存确认');
  expect(requests).toHaveLength(0);
  await save();
  expect(requests).toHaveLength(1);
  expect(requireValue(requests[0]).method).toBe('POST');
  expect(requireValue(requests[0]).body).not.toHaveProperty('version');
  expect(requireValue([...records.values()][0]).status).toBe('PENDING');
  expect(
    fetchMock.mock.calls.some(([url]) => String(url).endsWith('/transition')),
  ).toBe(false);
});

it('ignores duplicate confirmation events while the same save is pending', async () => {
  await create();
  await click('保存待入账');
  pauseSave = true;
  const confirm = button('确认保存');
  confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await settle();
  expect(requests).toHaveLength(1);
  expect(confirm.disabled).toBe(true);
  pauseSave = false;
  requireValue(releaseSave)();
  await settle();
  expect(records.size).toBe(1);
  expect(root.textContent).toContain('编辑记录');
});

it('preserves record ID/version and command for uncertain edit retries, then advances after success', async () => {
  await create();
  await save();
  await click('编辑记录');
  await fill('[data-test="drawer"] textarea', '合成编辑1');
  failure = 'after';
  await save();
  expect(requireValue(records.get('100')).version).toBe(1);
  await click('关闭错误');
  await click('确认保存');
  expect(requireValue(requests[1]).body).toEqual(
    requireValue(requests[2]).body,
  );
  expect(requireValue(requests[2]).method).toBe('PUT');
  expect(requireValue(requests[2]).url).toBe(
    '/admin-api/v1/business/bills/100',
  );
  expect(requireValue(requests[2]).body.version).toBe(0);
  expect(requireValue(records.get('100')).version).toBe(1);
  await click('编辑记录');
  await fill('[data-test="drawer"] textarea', '合成编辑2');
  await save();
  expect(requireValue(requests[3]).body.version).toBe(1);
  expect(requireValue(requests[3]).body.requestId).not.toBe(
    requireValue(requests[2]).body.requestId,
  );
  expect(requireValue(records.get('100')).version).toBe(2);
  expect(records.size).toBe(1);
});
