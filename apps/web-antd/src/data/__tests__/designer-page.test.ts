import type { App } from 'vue';

import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import Designers from '../../views/puyu-admin/real/Designers.vue';
import { requireValue } from './testAssertions';

const state = vi.hoisted(() => ({
  record: {} as any,
  get: vi.fn(),
  save: vi.fn(),
  overview: vi.fn(),
  relations: vi.fn(),
  push: vi.fn(),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { id: '28' } }),
  useRouter: () => ({ push: state.push }),
}));
vi.mock('#/application/adminBusinessService', () => ({
  AdminBusinessService: {
    designer: state.get,
    saveDesigner: state.save,
    designerOverview: state.overview,
    designerRelations: state.relations,
  },
}));
vi.mock('#/infrastructure/permission/permission', () => ({
  permission: { canManageDesigners: () => true },
}));
vi.mock('#/views/puyu-admin/real/BusinessFiles.vue', () => ({
  default: { render: () => null },
}));
vi.mock('#/views/puyu-admin/real/ImageUpload.vue', () => ({
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
  const Form = Object.assign(
    defineComponent({
      setup: (_p, { slots, expose }) => {
        expose({ validate: async () => {} });
        return () => h('div', slots.default?.());
      },
    }),
    { Item: Container },
  );
  const Descriptions = Object.assign(Container, { Item: Container });
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
          ? h('section', { 'data-test': 'confirmation' }, [
              slots.default?.(),
              h('button', { onClick: () => emit('ok') }, '确认保存'),
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
    Table: Container,
    Tag: Container,
    message: { success: vi.fn() },
  };
});
let app: App | undefined;
let root: HTMLDivElement;
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
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
  state.record = {
    id: '28',
    accountId: '29',
    version: 0,
    createdAt: '2026-10-23T09:00:00+08:00',
    updatedAt: '2026-10-23T09:00:00+08:00',
    content: {
      name: '验收设计师',
      loginPhone: '13910239912',
      phone: '13910239912',
      city: '上海',
      styles: '现代',
      introduction: '',
      level: 'NORMAL',
      status: 'COOPERATING',
      avatarFileId: null,
      wechatFileId: null,
      certificationFileIds: [],
      cooperatingMerchantId: '27',
    },
  };
  state.get.mockImplementation(async () => ({
    ...state.record,
    content: { ...state.record.content },
  }));
  state.save.mockImplementation(async (content: any, old: any) => {
    if (old.version !== state.record.version)
      throw new Error('expected the current designer version');
    state.record = {
      ...state.record,
      version: old.version + 1,
      content: { ...content },
    };
    return { ...state.record };
  });
  state.overview.mockResolvedValue({
    worksCount: null,
    credits: { balance: '0' },
    merchants: [],
  });
  state.relations.mockResolvedValue([]);
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  app?.unmount();
  root.remove();
  app = undefined;
});
it('returns an edited detail to display mode and reloads the current version before the next save', async () => {
  app = createApp(Designers, { pageId: 'platform-designer-detail' });
  app.mount(root);
  await settle();
  expect(root.textContent).toContain('验收设计师');
  await click('编辑设计师');
  await click('保存设计师');
  await click('确认保存');
  expect(root.textContent).toContain('编辑设计师');
  expect(root.textContent).not.toContain('保存设计师');
  expect(state.push).not.toHaveBeenCalled();
  expect(state.get).toHaveBeenCalledTimes(2);
  expect(state.record.version).toBe(1);
  await click('编辑设计师');
  await click('保存设计师');
  await click('确认保存');
  expect(state.save).toHaveBeenCalledTimes(2);
  expect(state.record.version).toBe(2);
  expect(state.get).toHaveBeenCalledTimes(3);
});
