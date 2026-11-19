import type { App } from 'vue';

import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import Settings from '../../views/puyu-admin/real/MerchantStoreSettings.vue';
import { requireValue } from './testAssertions';

const state = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  allowed: true,
}));
vi.mock('#/application/merchantStoreSettingsService', () => ({
  merchantStoreSettingsService: { get: state.get, save: state.save },
}));
vi.mock('#/infrastructure/permission/permission', () => ({
  permission: { canManageStoreSettings: () => state.allowed },
}));
vi.mock('ant-design-vue', async () => {
  const { defineComponent, h } = await import('vue');
  const Wrap = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  });
  return {
    Card: Wrap,
    Space: Wrap,
    Alert: defineComponent({
      props: ['message'],
      setup: (p) => () => h('div', p.message),
    }),
    Button: defineComponent({
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
    }),
    Switch: defineComponent({
      props: ['checked', 'disabled'],
      emits: ['update:checked'],
      setup:
        (p, { emit }) =>
        () =>
          h('input', {
            type: 'checkbox',
            checked: p.checked,
            disabled: p.disabled,
            onChange: (e: Event) =>
              emit('update:checked', (e.target as HTMLInputElement).checked),
          }),
    }),
    Modal: { confirm: (options: any) => options.onOk() },
  };
});
let app: App, host: HTMLDivElement;
const record = (enabled = true, version = 3, merchantId = '27') => ({
  merchantId,
  version,
  bannerDisplayEnabled: enabled,
});
async function settle() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await nextTick();
  }
}
async function mount() {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(Settings);
  app.mount(host);
  await settle();
}
function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(
    (b) => b.textContent === label,
  );
  expect(button).toBeTruthy();
  requireValue(button).click();
}
beforeEach(() => {
  state.allowed = true;
  state.get.mockReset().mockResolvedValue(record());
  state.save
    .mockReset()
    .mockResolvedValue({ requestId: 'cmd-1', appliedVersion: 4 });
  vi.stubGlobal('crypto', { randomUUID: () => 'cmd-1' });
});
afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.unstubAllGlobals();
});
it.each([true, false])(
  'does not save an unchanged %s switch, including after reverting the draft',
  async (initial) => {
    state.get.mockResolvedValue(record(initial));
    await mount();
    const input = requireValue(host.querySelector('input'));
    const button = requireValue(
      [...host.querySelectorAll('button')].find(
        (b) => b.textContent === '保存门店设置',
      ),
    );
    expect(button.disabled).toBe(true);
    // Dispatch directly to exercise the save guard even if disabled UI is bypassed.
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(state.save).not.toHaveBeenCalled();
    input.checked = !initial;
    input.dispatchEvent(new Event('change'));
    await nextTick();
    expect(button.disabled).toBe(false);
    input.checked = initial;
    input.dispatchEvent(new Event('change'));
    await nextTick();
    expect(button.disabled).toBe(true);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(state.save).not.toHaveBeenCalled();
    expect(state.get).toHaveBeenCalledTimes(1);
  },
);
it('saves only this merchant switch and keeps the form consistent with authoritative readback', async () => {
  state.get
    .mockResolvedValueOnce(record())
    .mockResolvedValueOnce(record(false, 4));
  await mount();
  const input = requireValue(host.querySelector('input'));
  input.checked = false;
  input.dispatchEvent(new Event('change'));
  await nextTick();
  click('保存门店设置');
  await settle();
  expect(state.save).toHaveBeenCalledWith({
    requestId: 'cmd-1',
    version: 3,
    bannerDisplayEnabled: false,
  });
  expect(host.textContent).toContain('门店设置已保存');
  expect(requireValue(host.querySelector('input')).checked).toBe(false);
});
it('unknown result locks draft and retries the exact original command', async () => {
  state.save
    .mockRejectedValueOnce(new Error('网络中断'))
    .mockResolvedValueOnce({ requestId: 'cmd-1', appliedVersion: 4 });
  state.get
    .mockResolvedValueOnce(record())
    .mockResolvedValueOnce(record(false, 4));
  await mount();
  const input = requireValue(host.querySelector('input'));
  input.checked = false;
  input.dispatchEvent(new Event('change'));
  await nextTick();
  click('保存门店设置');
  await settle();
  expect(requireValue(host.querySelector('input')).disabled).toBe(true);
  click('重试原保存');
  await settle();
  expect(state.save.mock.calls[1]?.[0]).toEqual(state.save.mock.calls[0]?.[0]);
  expect(host.textContent).toContain('门店设置已保存');
});
it('aCK followed by failed read only retries the read, never PUT again', async () => {
  state.get
    .mockResolvedValueOnce(record())
    .mockRejectedValueOnce(new Error('读取失败'))
    .mockResolvedValueOnce(record(false, 4));
  await mount();
  const input = requireValue(host.querySelector('input'));
  input.checked = false;
  input.dispatchEvent(new Event('change'));
  await nextTick();
  click('保存门店设置');
  await settle();
  click('核对保存结果');
  await settle();
  expect(state.save).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('门店设置已保存');
});
it('owner mismatch is not reported saved and nonmerchant cannot submit', async () => {
  state.get
    .mockResolvedValueOnce(record())
    .mockResolvedValueOnce(record(false, 4, '99'));
  await mount();
  const input = requireValue(host.querySelector('input'));
  input.checked = false;
  input.dispatchEvent(new Event('change'));
  await nextTick();
  click('保存门店设置');
  await settle();
  expect(host.textContent).toContain('本人门店不一致');
  expect(host.textContent).not.toContain('门店设置已保存');
});
it('hides save and disables switch without merchant permission', async () => {
  state.allowed = false;
  await mount();
  expect(requireValue(host.querySelector('input')).disabled).toBe(true);
  expect(host.textContent).not.toContain('保存门店设置');
  expect(state.save).not.toHaveBeenCalled();
});
