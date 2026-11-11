/** Local Vite bridge only. Never use as a production CORS policy. */
export function allowLocalProxyRequest(headers: {
  host?: string;
  origin?: string;
  'sec-fetch-site'?: string;
}): boolean {
  if (!['127.0.0.1:5666', 'localhost:5666'].includes(headers.host ?? ''))
    return false;
  if (headers['sec-fetch-site'] === 'cross-site') return false;
  return (
    headers.origin === undefined ||
    ['http://127.0.0.1:5666', 'http://localhost:5666'].includes(headers.origin)
  );
}
