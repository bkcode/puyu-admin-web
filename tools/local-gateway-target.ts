/** Trusted development-server setting only. Never take this from a browser request. */
export function localGatewayTarget(value: string | undefined): string {
  if (value === undefined) return 'http://127.0.0.1:9988';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('PUYU_GATEWAY_URL must be an HTTP(S) origin');
  }
  if (
    // Check the input too: URL normalizes dot segments and empty query/fragment markers.
    !/^https?:\/\/[^\\/?#@\s]+\/?$/i.test(value) ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'PUYU_GATEWAY_URL must be an HTTP(S) origin without credentials, path, query or fragment',
    );
  return url.origin;
}

/** Match the raw request before Vite's prefix proxy can forward client credentials. */
export function allowLocalTokenRequest(request: {
  method?: string;
  url?: string;
}): boolean {
  return (
    request.method === 'POST' && request.url === '/auth-api/v1/oauth2/token'
  );
}
