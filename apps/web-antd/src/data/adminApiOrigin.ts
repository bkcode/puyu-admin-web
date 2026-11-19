/** Production uses the public Gateway; development retains the trusted Vite proxy. */
export function adminApiUrl(path: string): string {
  const apiPath = `/admin-api/v1${path}`;
  if (!import.meta.env.PROD) return apiPath;

  const configured = import.meta.env.VITE_GLOB_API_URL?.trim();
  const invalid = () =>
    new Error('正式API地址必须是无凭据、路径或查询的HTTPS根origin');
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
  return `${origin.origin}${apiPath}`;
}
