import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  uploadPublicImage,
  validatePublicImage,
  validatePublicImageFile,
} from '../publicImageUploadApi';
import { adminRequest, configureRealTokenProvider } from '../realAdminApi';
import { requireValue } from './testAssertions';

const fetchMock = vi.fn();
const hash = 'a'.repeat(64);
const file = new File(['png'], 'cover.png', { type: 'image/png' });
const actor = { userId: '28', merchantId: '27', role: 'MERCHANT' as const };
const image = {
  key: `images/merchants/27/${hash}.png`,
  url: `http://192.168.19.80:8080/puyu/images/merchants/27/${hash}.png`,
  name: 'cover.png',
  contentType: 'image/png',
  size: '3',
  sha256: hash,
};
const success = (data: unknown) => Response.json({ code: 0, data });
beforeEach(() => {
  fetchMock.mockReset();
  configureRealTokenProvider(() => 'test-session');
  vi.stubGlobal('fetch', fetchMock);
});
describe('public image gateway contract', () => {
  it('uses verified owner and only multipart file, leaving the browser to set its boundary', async () => {
    fetchMock
      .mockResolvedValueOnce(success(actor))
      .mockResolvedValueOnce(success(image));
    expect(await uploadPublicImage(file)).toEqual(image);
    const [url, request] = requireValue(fetchMock.mock.calls[1]);
    expect(url).toBe('/admin-api/v1/uploads/images');
    expect(request.method).toBe('POST');
    expect(request.headers).toEqual({ Authorization: 'Bearer test-session' });
    expect([...request.body.keys()]).toEqual(['file']);
    expect(request.body.get('file').name).toBe('cover.png');
  });
  it('only allows POST FormData to the exact new path', async () => {
    for (const [path, body, method] of [
      ['/uploads/images', undefined, 'GET'],
      ['/uploads/images', new FormData(), 'PUT'],
      ['/uploads/images', {}, 'POST'],
      ['/uploads/images/extra', new FormData(), 'POST'],
      ['/uploads/other', new FormData(), 'POST'],
    ] as const)
      await expect(adminRequest(path, body, method)).rejects.toThrow(
        'Unsupported admin surface',
      );
    configureRealTokenProvider(() => null);
    await expect(uploadPublicImage(file)).rejects.toMatchObject({
      code: '401',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([401, 413, 503])(
    'rejects HTTP %s without making up a URL',
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(success(actor))
        .mockResolvedValueOnce(Response.json({}, { status }));
      await expect(uploadPublicImage(file)).rejects.toThrow(
        `服务请求失败（HTTP ${status}）`,
      );
    },
  );
  it('rejects business failure on HTTP 200 and stale authentication', async () => {
    fetchMock
      .mockResolvedValueOnce(success(actor))
      .mockResolvedValueOnce(
        Response.json({ code: 20_000, msg: '存储未就绪' }),
      );
    await expect(uploadPublicImage(file)).rejects.toThrow('存储未就绪');
    let session = 'old';
    configureRealTokenProvider(() => session);
    fetchMock
      .mockResolvedValueOnce(success(actor))
      .mockImplementationOnce(() => {
        session = 'new';
        return Promise.resolve(success(image));
      });
    await expect(uploadPublicImage(file)).rejects.toThrow('登录身份已变化');
  });
  it('accepts three formats and exact bounds, rejects empty, GIF, wrong extension and oversize before fetch', () => {
    for (const [type, name] of [
      ['image/png', 'a.png'],
      ['image/jpeg', 'a.jpeg'],
      ['image/webp', 'a.webp'],
    ]) {
      expect(() =>
        validatePublicImageFile(new File(['x'], requireValue(name), { type })),
      ).not.toThrow();
    }
    expect(() =>
      validatePublicImageFile(
        new File([new Uint8Array(20 * 1024 * 1024)], 'a.png', {
          type: 'image/png',
        }),
      ),
    ).not.toThrow();
    for (const bad of [
      new File([], 'a.png', { type: 'image/png' }),
      new File(['x'], 'a.gif', { type: 'image/gif' }),
      new File(['x'], 'a.jpg', { type: 'image/png' }),
      new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'a.png', {
        type: 'image/png',
      }),
    ]) {
      expect(() => validatePublicImageFile(bad)).toThrow(
        /请选择后缀与类型一致|图片大小须为/,
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
describe('strict public image metadata', () => {
  it('requires size to remain a correct Long string and validates owner, key and URL as one result', () => {
    expect(validatePublicImage(image, file, actor)).toEqual(image);
    for (const patch of [
      { size: 3 },
      { size: '03' },
      { size: '4' },
      { sha256: 'x'.repeat(64) },
      { contentType: 'image/gif' },
      { key: image.key.replace('/27/', '/99/') },
      { name: '' },
      { name: 'different.png' },
      { url: `${image.url}?x=1` },
      { url: `${image.url}#x` },
      { url: image.url.replace('http://', 'ftp://') },
      { url: image.url.replace('http://', 'http://user:pass@') },
      { url: image.url.replace('/27/', '/99/') },
      { key: image.key.replace('/27/', '/027/') },
    ])
      expect(() =>
        validatePublicImage({ ...image, ...patch }, file, actor),
      ).toThrow('图片信息无效');
    const platformKey = `images/platform/28/${hash}.png`;
    expect(
      validatePublicImage(
        {
          ...image,
          key: platformKey,
          url: `https://cdn.test/puyu/${platformKey}`,
        },
        file,
        { ...actor, role: 'PLATFORM', merchantId: null },
      ).key,
    ).toBe(platformKey);
    expect(() =>
      validatePublicImage(image, file, {
        ...actor,
        role: 'PLATFORM',
        merchantId: null,
      }),
    ).toThrow('图片信息无效');
  });
});
