import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { downloadExport } from '../../views/puyu-admin/real/businessUi';
import { saveFile } from '../../views/puyu-admin/real/operationsUi';
import { requireValue } from './testAssertions';

const blobs: Blob[] = [];
const clicks: {
  connected: boolean;
  hidden: boolean;
  href: string;
  name: string;
}[] = [];
const createUrl = vi.fn((blob: Blob) => {
  blobs.push(blob);
  return `blob:download-${blobs.length}`;
});
const revokeUrl = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  blobs.length = 0;
  clicks.length = 0;
  createUrl.mockClear();
  revokeUrl.mockClear();
  vi.stubGlobal('URL', {
    createObjectURL: createUrl,
    revokeObjectURL: revokeUrl,
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
    function (this: HTMLAnchorElement) {
      clicks.push({
        connected: this.isConnected,
        hidden: this.hidden === true,
        name: this.download,
        href: this.href,
      });
    },
  );
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  ['credit-ledger.csv', 'text/csv;charset=UTF-8'],
  [
    'products.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  ['code.png', 'image/png'],
])(
  'preserves MIME and attaches one temporary download anchor for %s',
  (name, contentType) => {
    downloadExport({ name, contentType, content: btoa('synthetic bytes') });
    expect(requireValue(blobs[0]).type).toBe(contentType.toLowerCase());
    expect(clicks).toEqual([
      { connected: true, hidden: true, name, href: 'blob:download-1' },
    ]);
    expect(document.querySelector('a[download]')).toBeNull();
  },
);

it('preserves synthetic UTF-8 BOM, Chinese CSV, quotes and CRLF bytes while cleaning only the filename', async () => {
  const csv = '\uFEFF"流水ID","原因"\r\n"14","验收,含""引号"""\r\n';
  const bytes = new TextEncoder().encode(csv);
  downloadExport({
    name: '../验收\u0000.csv',
    contentType: 'text/csv;charset=UTF-8',
    content: btoa(String.fromCodePoint(...bytes)),
  });
  expect(new Uint8Array(await requireValue(blobs[0]).arrayBuffer())).toEqual(
    bytes,
  );
  expect(requireValue(clicks[0]).name).toBe('.._验收_.csv');
});

it('keeps binary fallback for existing attachment and model callers', async () => {
  const bytes = new Uint8Array([0, 255, 128, 42]);
  saveFile({ name: 'model.bin', bytes });
  expect(requireValue(blobs[0]).type).toBe('application/octet-stream');
  expect(new Uint8Array(await requireValue(blobs[0]).arrayBuffer())).toEqual(
    bytes,
  );
});

it('revokes the object URL only after the existing one-second delay', () => {
  saveFile({ name: 'a.bin', bytes: new Uint8Array([1]) });
  expect(revokeUrl).not.toHaveBeenCalled();
  vi.advanceTimersByTime(999);
  expect(revokeUrl).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:download-1');
});

it('releases each independent URL exactly once without leaving anchors', () => {
  saveFile({ name: 'a.bin', bytes: new Uint8Array([1]) });
  saveFile({ name: 'b.bin', bytes: new Uint8Array([2]) });
  vi.runOnlyPendingTimers();
  expect(revokeUrl.mock.calls).toEqual([
    ['blob:download-1'],
    ['blob:download-2'],
  ]);
  expect(document.querySelector('a[download]')).toBeNull();
});

it('propagates click failure and still removes the anchor and schedules URL cleanup', () => {
  vi.mocked(HTMLAnchorElement.prototype.click).mockImplementationOnce(
    function (this: HTMLAnchorElement) {
      expect(this.isConnected).toBe(true);
      throw new Error('synthetic click failure');
    },
  );
  expect(() => saveFile({ name: 'a.bin', bytes: new Uint8Array([1]) })).toThrow(
    'synthetic click failure',
  );
  expect(document.querySelector('a[download]')).toBeNull();
  expect(revokeUrl).not.toHaveBeenCalled();
  vi.runOnlyPendingTimers();
  expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:download-1');
});

it('propagates DOM attachment failure without leaking the URL or clicking', () => {
  vi.spyOn(document.body, 'append').mockImplementationOnce(() => {
    throw new Error('synthetic DOM failure');
  });
  expect(() => saveFile({ name: 'a.bin', bytes: new Uint8Array([1]) })).toThrow(
    'synthetic DOM failure',
  );
  expect(clicks).toEqual([]);
  expect(document.querySelector('a[download]')).toBeNull();
  vi.runOnlyPendingTimers();
  expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:download-1');
});

it('does not allocate a URL or trigger a click when Base64 decoding fails', () => {
  expect(() =>
    downloadExport({
      name: 'bad.csv',
      contentType: 'text/csv;charset=UTF-8',
      content: '!',
    }),
  ).toThrow('Invalid character');
  expect(createUrl).not.toHaveBeenCalled();
  expect(clicks).toEqual([]);
});
