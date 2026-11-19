import type { Actor } from './realAdminApi';

import { adminRequest, captureAdminSession, realAuthApi } from './realAdminApi';

export type PublicImage = {
  contentType: string;
  key: string;
  name: string;
  sha256: string;
  size: string;
  url: string;
};
const extensions: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
};
export function validatePublicImageFile(file: File) {
  if (
    !extensions[file.type]?.includes(
      file.name.split('.').pop()?.toLowerCase() ?? '',
    )
  )
    throw new Error('请选择后缀与类型一致的PNG、JPEG或WebP图片');
  if (file.size === 0 || file.size > 20 * 1024 * 1024)
    throw new Error('图片大小须为1字节到20MiB');
}
export function validatePublicImage(
  data: unknown,
  file: File,
  actor: Actor,
): PublicImage {
  const value = data as null | PublicImage;
  const invalid = () => {
    throw new Error('上传服务返回的图片信息无效，请重试');
  };
  if (!value || typeof value !== 'object') return invalid();
  if (
    typeof value.size !== 'string' ||
    !/^[1-9]\d*$/.test(value.size) ||
    value.size !== String(file.size) ||
    value.contentType !== file.type ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.name !== file.name ||
    typeof value.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    typeof value.key !== 'string' ||
    typeof value.url !== 'string'
  )
    return invalid();
  const match =
    /^images\/(merchants|platform)\/([1-9]\d*)\/([a-f0-9]{64})\.(png|jpg|webp)$/.exec(
      value.key,
    );
  const owner = actor.role === 'MERCHANT' ? actor.merchantId : actor.userId;
  if (
    !match ||
    match[1] !== (actor.role === 'MERCHANT' ? 'merchants' : 'platform') ||
    match[2] !== owner ||
    match[3] !== value.sha256 ||
    !extensions[value.contentType]?.includes(match[4] ?? '')
  )
    return invalid();
  try {
    const url = new URL(value.url);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      value.url.length > 512 ||
      url.pathname !== `/puyu/${value.key}` ||
      value.url !== `${url.origin}/puyu/${value.key}`
    )
      return invalid();
  } catch {
    return invalid();
  }
  return value;
}

export async function uploadPublicImage(file: File): Promise<PublicImage> {
  validatePublicImageFile(file);
  const current = captureAdminSession();
  const actor = await realAuthApi.actor();
  if (!current()) throw new Error('登录身份已变化，请重新选择图片');
  const body = new FormData();
  body.set('file', file);
  const result = await adminRequest<unknown>('/uploads/images', body);
  if (!current()) throw new Error('登录身份已变化，请重新选择图片');
  return validatePublicImage(result, file, actor);
}

// Existing values are retained in the model even if they cannot safely render.
export function publicImagePreview(value: string) {
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
