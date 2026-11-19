// @vitest-environment node
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { onRequest } from '../../../../../functions/auth-api/v1/oauth2/token';

const ORIGIN = 'https://admin.zyyfdesign.top';
const PATH = '/auth-api/v1/oauth2/token';
const UPSTREAM = 'https://api.zyyfdesign.top/auth-api/v1/oauth2/token';
const SECRET = 'sentinel-server-only-secret-for-isolated-tests';
const FORM =
  'grant_type=password&username=admin%2Btest&password=+pass%26word+&scope=profile';
const TOKENS = {
  code: 0,
  data: { access_token: 'sentinel-access', refresh_token: 'sentinel-refresh' },
};
const fetchMock = vi.fn<typeof fetch>();

function request(
  options: {
    body?: ReadableStream<Uint8Array> | string;
    headers?: Record<string, null | string>;
    method?: string;
    url?: string;
  } = {},
): Request {
  const method = options.method ?? 'POST';
  const headers = new Headers({
    Origin: ORIGIN,
    'Sec-Fetch-Site': 'same-origin',
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
  });
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (value === null) headers.delete(name);
    else headers.set(name, value);
  }
  const init: RequestInit & { duplex: 'half' } = {
    method,
    headers,
    duplex: 'half',
  };
  if (!['GET', 'HEAD'].includes(method)) init.body = options.body ?? FORM;
  return new Request(options.url ?? `${ORIGIN}${PATH}`, init);
}
function handle(incoming = request(), secret = SECRET) {
  return onRequest({
    request: incoming,
    env: { PUYU_ADMIN_CLIENT_SECRET: secret },
  });
}
function upstream(
  body: unknown = TOKENS,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(body, {
    status,
    headers: { 'Content-Type': 'application/json;charset=UTF-8', ...headers },
  });
}
function streamBody(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
}
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(upstream());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function rejectedStatus(incoming: Request) {
  const result = await handle(incoming);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await result.json()).toMatchObject({
    code: result.status,
    data: null,
  });
  return result.status;
}

describe('production Pages token bridge', () => {
  it('enables only the exact function path in the static build manifest', () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL('../../../public/_routes.json', import.meta.url),
        'utf8',
      ),
    );
    expect(manifest).toEqual({ version: 1, include: [PATH], exclude: [] });
  });
  it.each([
    FORM,
    'grant_type=refresh_token&refresh_token=+sentinel%2Brefresh%26token+',
  ])(
    'forwards supported form bytes with server-only authentication (%#)',
    async (body) => {
      const result = await handle(
        request({
          body,
          headers: {
            Authorization: 'Bearer browser-sentinel',
            Cookie: 'private=browser-cookie',
            Forwarded: 'host=evil.test',
            'X-Forwarded-Host': 'evil.test',
            'X-Forwarded-For': '203.0.113.1',
            'X-Client-Id': 'other-client',
          },
        }),
      );
      expect(result.status).toBe(200);
      expect(await result.json()).toEqual(TOKENS);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] ?? [];
      expect(url).toBe(UPSTREAM);
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(body);
      expect(init?.redirect).toBe('manual');
      expect([...new Headers(init?.headers).entries()]).toEqual([
        ['accept', 'application/json'],
        [
          'authorization',
          `Basic ${Buffer.from(`puyu-admin:${SECRET}`, 'utf8').toString('base64')}`,
        ],
        ['content-type', 'application/x-www-form-urlencoded;charset=UTF-8'],
      ]);
      expect(result.headers.get('Cache-Control')).toBe('no-store');
      expect(result.headers.get('Pragma')).toBe('no-cache');
      expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff');
    },
  );
  it('encodes server Basic authentication as UTF-8 without altering the secret', async () => {
    const secret = '测'.repeat(12);
    await handle(request(), secret);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      `Basic ${Buffer.from(`puyu-admin:${secret}`, 'utf8').toString('base64')}`,
    );
  });
  it.each(['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'])(
    'rejects %s',
    async (method) => {
      expect(await rejectedStatus(request({ method }))).toBe(405);
    },
  );
  it.each([
    `${ORIGIN}${PATH}/`,
    `${ORIGIN}${PATH}-extra`,
    `${ORIGIN}${PATH}/other`,
    `${ORIGIN}${PATH}?`,
    `${ORIGIN}${PATH}?target=https://evil.test`,
    `${ORIGIN}${PATH}%2fother`,
    `${ORIGIN}${PATH}%3faudience=other`,
    `https://preview.pages.dev${PATH}`,
    `http://admin.zyyfdesign.top${PATH}`,
    `https://other.test${PATH}`,
    `${ORIGIN}${PATH}#fragment`,
  ])('rejects unsupported complete URL: %s', async (url) => {
    expect(await rejectedStatus(request({ url }))).toBe(404);
  });
  it.each([
    null,
    'null',
    'https://evil.test',
    'http://admin.zyyfdesign.top',
    `${ORIGIN}/`,
    'https://preview.pages.dev',
  ])('requires the exact production Origin: %s', async (origin) => {
    expect(await rejectedStatus(request({ headers: { Origin: origin } }))).toBe(
      403,
    );
  });
  it.each(['cross-site', 'same-site', 'none', 'unknown'])(
    'rejects conflicting Fetch Metadata: %s',
    async (site) => {
      expect(
        await rejectedStatus(request({ headers: { 'Sec-Fetch-Site': site } })),
      ).toBe(403);
    },
  );
  it('allows missing Fetch Metadata only with matching Origin', async () => {
    const result = await handle(
      request({ headers: { 'Sec-Fetch-Site': null } }),
    );
    expect(result.status).toBe(200);
  });
  it.each([
    null,
    'application/json',
    'text/plain',
    'multipart/form-data;boundary=x',
    'application/x-www-form-urlencoded;charset=iso-8859-1',
    'application/x-www-form-urlencoded;foo=bar',
  ])('rejects unsupported request media type: %s', async (contentType) => {
    expect(
      await rejectedStatus(
        request({ headers: { 'Content-Type': contentType } }),
      ),
    ).toBe(415);
  });
  it.each([
    'grant_type=client_credentials',
    'grant_type=authorization_code&code=sentinel',
    'grant_type=password&username=x&password=y',
    'grant_type=password&username=x&password=y&scope=admin',
    'grant_type=password&username=x&password=&scope=profile',
    'grant_type=password&username=&password=y&scope=profile',
    `${FORM}&client_id=other`,
    `${FORM}&client_secret=sentinel`,
    `${FORM}&target=https://evil.test`,
    `${FORM}&scope=profile`,
    `${FORM}&%75sername=second`,
    `${FORM}&grant_type=password`,
    `${FORM}&unknown=value`,
    `${FORM}&password=second`,
    'grant_type=refresh_token&refresh_token=',
    'grant_type=refresh_token&refresh_token=x&scope=profile',
    'grant_type=refresh_token&refresh_token=x&username=admin',
    'grant_type=refresh_token&refresh_token=x&refresh_token=y',
    'grant_type=refresh_token&refresh_token=%invalid',
    'grant_type=refresh_token&refresh_token=%FF',
    '',
  ])(
    'rejects malformed, unknown or repeated form fields (%#)',
    async (body) => {
      expect(await rejectedStatus(request({ body }))).toBe(400);
    },
  );
  it('bounds streamed request bytes despite false Content-Length', async () => {
    expect(
      await rejectedStatus(
        request({
          body: streamBody(FORM, 'x'.repeat(16 * 1024)),
          headers: { 'Content-Length': '1' },
        }),
      ),
    ).toBe(413);
  });
  it.each([
    undefined,
    '',
    'x'.repeat(31),
    'x'.repeat(73),
    '测'.repeat(25),
    `${SECRET}\n`,
    `${SECRET}\r`,
    `${SECRET}\0`,
  ])('fails closed on invalid runtime configuration (%#)', async (secret) => {
    const result = await onRequest({
      request: request(),
      env: { PUYU_ADMIN_CLIENT_SECRET: secret },
    });
    expect(result.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await result.text()).not.toContain(SECRET);
  });
  it('preserves upstream JSON errors and status while excluding response headers', async () => {
    const error = { code: 401, data: null, msg: 'Invalid credentials' };
    fetchMock.mockResolvedValue(
      upstream(error, 401, {
        'Set-Cookie': 'secret=sentinel',
        Location: 'https://evil.test',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public,max-age=3600',
      }),
    );
    const result = await handle();
    expect(result.status).toBe(401);
    expect(await result.json()).toEqual(error);
    for (const name of [
      'Set-Cookie',
      'Location',
      'Access-Control-Allow-Origin',
    ])
      expect(result.headers.has(name)).toBe(false);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
  });
  it.each([301, 302, 303, 307, 308])(
    'rejects upstream redirect %s',
    async (status) => {
      fetchMock.mockResolvedValue(
        upstream({ msg: 'redirect' }, status, {
          Location: 'https://evil.test',
        }),
      );
      const result = await handle();
      expect(result.status).toBe(502);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    new Response('<html>gateway error</html>', {
      headers: { 'Content-Type': 'text/html' },
    }),
    new Response('{broken-json', {
      headers: { 'Content-Type': 'application/json' },
    }),
    upstream(null),
    upstream('html'),
    upstream([]),
    new Response('{}'),
    new Response(null, { status: 204 }),
  ])('fails closed on invalid upstream response (%#)', async (response) => {
    fetchMock.mockResolvedValue(response);
    const result = await handle();
    expect(result.status).toBe(502);
  });
  it('limits response stream bytes despite false Content-Length', async () => {
    fetchMock.mockResolvedValue(
      new Response(streamBody('{"msg":"', 'x'.repeat(64 * 1024), '"}'), {
        headers: { 'Content-Type': 'application/json', 'Content-Length': '2' },
      }),
    );
    const result = await handle();
    expect(result.status).toBe(502);
  });
  it('does not expose upstream exceptions or submitted credentials', async () => {
    fetchMock.mockRejectedValue(new Error(`${SECRET} pass&word admin+test`));
    const result = await handle();
    expect(result.status).toBe(502);
    const body = await result.text();
    for (const value of [SECRET, 'pass&word', 'admin+test'])
      expect(body).not.toContain(value);
  });
  it.each(['request', 'fetch', 'response'])(
    'enforces the total deadline during stalled %s',
    async (stage) => {
      vi.useFakeTimers();
      const cancel = vi.fn();
      const pending = new ReadableStream<Uint8Array>({ cancel });
      let incoming = request();
      if (stage === 'request') incoming = request({ body: pending });
      if (stage === 'fetch')
        fetchMock.mockImplementation(() => new Promise(() => {}));
      if (stage === 'response')
        fetchMock.mockResolvedValue(
          new Response(pending, {
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      const resultPromise = handle(incoming);
      await vi.advanceTimersByTimeAsync(10_001);
      const result = await resultPromise;
      expect(result.status).toBe(502);
      expect(fetchMock).toHaveBeenCalledTimes(stage === 'request' ? 0 : 1);
      const [, init] = fetchMock.mock.calls[0] ?? [];
      expect(init?.signal?.aborted).toBe(
        stage === 'request' ? undefined : true,
      );
      expect(cancel).toHaveBeenCalledTimes(stage === 'fetch' ? 0 : 1);
    },
  );
});
