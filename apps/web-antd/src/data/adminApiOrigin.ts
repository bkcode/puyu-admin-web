function httpsOrigin(value: string | undefined, name: string): string {
  const configured = value?.trim();
  const invalid = () =>
    new Error(`正式${name}地址必须是无凭据、路径或查询的HTTPS根origin`);
  if (!configured || !/^https:\/\/[^\\/?#@\s]+\/*$/iu.test(configured))
    throw invalid();
  let origin: URL;
  try {
    origin = new URL(configured);
  } catch {
    throw invalid();
  }
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    !/^\/+$/u.test(origin.pathname)
  )
    throw invalid();
  return origin.origin;
}

/** Production uses the public Gateway; development retains the trusted Vite proxy. */
export function adminApiUrl(path: string): string {
  const apiPath = `/admin-api/v1${path}`;
  if (!import.meta.env.PROD) return apiPath;
  return `${httpsOrigin(import.meta.env.VITE_GLOB_API_URL, 'API')}${apiPath}`;
}

/** Password and refresh grants use Auth directly; its client secret stays server-side. */
export function adminAuthUrl(): string {
  if (!import.meta.env.PROD) return '/auth-api/v1/oauth2/token';
  return `${httpsOrigin(import.meta.env.VITE_AUTH_API_URL, 'Auth')}/oauth2/token`;
}
