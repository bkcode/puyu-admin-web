import type { App } from 'vue';

import { createApp, h, nextTick, ref } from 'vue';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import PublicImageUpload from '../../views/puyu-admin/real/PublicImageUpload.vue';
import { configureRealTokenProvider } from '../realAdminApi';
import { requireValue } from './testAssertions';

const state = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('#/application/publicImageService', () => ({
  PublicImageService: { upload: state.upload },
}));
let app: App;
let root: HTMLDivElement;
const urls = ref<string[]>([]);
const scope = ref(1);
const busy = vi.fn();
const error = vi.fn();
function deferred() {
  let resolve!: (v: { url: string }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ url: string }>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await nextTick();
}
function mount(max = 20, legacyCount = 0) {
  app = createApp({
    setup: () => () =>
      h(PublicImageUpload, {
        modelValue: urls.value,
        scope: scope.value,
        max,
        legacyCount,
        onBusy: busy,
        onError: error,
        'onUpdate:modelValue': (value) => {
          urls.value = value;
        },
      }),
  });
  app.mount(root);
}
async function select(count = 1) {
  const input = requireValue(root.querySelector('input'));
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: Array.from(
      { length: count },
      (_, i) => new File(['x'], `${i}.png`, { type: 'image/png' }),
    ),
  });
  input.dispatchEvent(new Event('change'));
  await settle();
}
beforeEach(() => {
  state.upload.mockReset();
  urls.value = [];
  scope.value = 1;
  busy.mockReset();
  error.mockReset();
  configureRealTokenProvider(() => 'session');
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  app?.unmount();
  root.remove();
});
it('previews appended URLs while preserving prior external URLs; removes only the selected URL', async () => {
  urls.value = ['https://old.test/image.png'];
  state.upload.mockResolvedValue({ url: 'http://cdn.test/puyu/new.png' });
  mount();
  await select();
  expect(urls.value).toEqual([
    'https://old.test/image.png',
    'http://cdn.test/puyu/new.png',
  ]);
  expect(root.querySelectorAll('img')).toHaveLength(2);
  expect(root.textContent).toContain('需保存业务资料');
  (root.querySelector('button') as HTMLButtonElement).click();
  await settle();
  expect(urls.value).toEqual(['http://cdn.test/puyu/new.png']);
});
it('reserves total ID+URL capacity before I/O and preserves oversized history without truncating', async () => {
  urls.value = ['https://old.test/a'];
  mount(20, 19);
  await select();
  expect(state.upload).not.toHaveBeenCalled();
  expect(urls.value).toHaveLength(1);
  urls.value = Array.from({ length: 22 }, (_, i) => `https://old.test/${i}`);
  await settle();
  expect(urls.value).toHaveLength(22);
});
it('serializes a selection, rejects new work while busy, keeps successful siblings and surfaces failures', async () => {
  const first = deferred();
  state.upload
    .mockReturnValueOnce(first.promise)
    .mockRejectedValueOnce(new Error('第二张失败'));
  mount();
  await select(2);
  expect(busy).toHaveBeenLastCalledWith(true);
  expect(state.upload).toHaveBeenCalledTimes(1);
  await select();
  expect(state.upload).toHaveBeenCalledTimes(1);
  first.resolve({ url: 'https://cdn.test/one.png' });
  await settle();
  expect(urls.value).toEqual(['https://cdn.test/one.png']);
  expect(error).toHaveBeenCalledWith('第二张失败');
  expect(busy).toHaveBeenLastCalledWith(false);
});
it('deduplicates same-scope hash URLs returned by repeated content', async () => {
  state.upload.mockResolvedValue({ url: 'https://cdn.test/same.png' });
  mount();
  await select(2);
  expect(urls.value).toEqual(['https://cdn.test/same.png']);
});
it.each(['success', 'failure'])(
  'discards late %s after changing editor scope and can start a fresh upload',
  async (outcome) => {
    const old = deferred();
    state.upload.mockReturnValueOnce(old.promise);
    mount();
    await select();
    scope.value += 1;
    urls.value = ['https://new.test/kept'];
    await settle();
    if (outcome === 'success') old.resolve({ url: 'https://old.test/late' });
    else old.reject(new Error('旧错误'));
    await settle();
    expect(urls.value).toEqual(['https://new.test/kept']);
    expect(error).not.toHaveBeenCalled();
    state.upload.mockResolvedValue({ url: 'https://new.test/new' });
    await select();
    expect(urls.value).toContain('https://new.test/new');
  },
);
it('discards late results after session changes or component unmount', async () => {
  const old = deferred();
  state.upload.mockReturnValueOnce(old.promise);
  let session = 'one';
  configureRealTokenProvider(() => session);
  mount();
  await select();
  session = 'two';
  old.resolve({ url: 'https://old.test/late' });
  await settle();
  expect(urls.value).toEqual([]);
  const second = deferred();
  state.upload.mockReturnValueOnce(second.promise);
  await select();
  app.unmount();
  second.resolve({ url: 'https://old.test/unmounted' });
  await settle();
  expect(urls.value).toEqual([]);
});

it.each([
  [
    'https://cdn.test/b.png',
    [
      'https://cdn.test/a.png',
      'https://cdn.test/a.png',
      'https://cdn.test/b.png',
    ],
  ],
  [
    'https://cdn.test/a.png',
    ['https://cdn.test/a.png', 'https://cdn.test/a.png'],
  ],
])(
  'preserves duplicate persisted URLs when uploading %s',
  async (resultUrl, expected) => {
    urls.value = ['https://cdn.test/a.png', 'https://cdn.test/a.png'];
    state.upload.mockResolvedValue({ url: resultUrl });
    mount();
    await select();
    expect(urls.value).toEqual(expected);
  },
);
