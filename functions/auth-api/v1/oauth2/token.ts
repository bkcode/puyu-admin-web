const ADMIN_ORIGIN = 'https://admin.zyyfdesign.top';
const TOKEN_PATH = '/auth-api/v1/oauth2/token';
const TOKEN_UPSTREAM = 'https://api.zyyfdesign.top/auth-api/v1/oauth2/token';
const REQUEST_LIMIT = 16 * 1024;
const RESPONSE_LIMIT = 64 * 1024;
const TIMEOUT_MS = 10_000;

interface TokenContext {
  env: { PUYU_ADMIN_CLIENT_SECRET?: string };
  request: Request;
}

class BridgeError extends Error {
  constructor(public status: number) {
    super('Token bridge request rejected');
  }
}

function jsonResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function failure(status: number): Response {
  // Never include exception messages, environment values or browser input.
  return jsonResponse(
    JSON.stringify({
      code: status,
      data: null,
      msg: '认证服务暂不可用，请稍后重试',
    }),
    status,
  );
}

async function readBounded(
  stream: null | ReadableStream<Uint8Array>,
  limit: number,
  deadline: Promise<never>,
  failureStatus: number,
): Promise<string> {
  if (!stream) throw new BridgeError(failureStatus);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new BridgeError(failureStatus);
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch (error) {
    // Do not await cancel: a broken stream's cancellation may never settle.
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function validForm(body: string): boolean {
  // URLSearchParams tolerates malformed percent escapes; reject those first.
  try {
    decodeURIComponent(body.replaceAll('+', ' '));
  } catch {
    return false;
  }
  const form = new URLSearchParams(body);
  const grant = form.get('grant_type');
  const allowed =
    grant === 'password'
      ? ['grant_type', 'username', 'password', 'scope']
      : ['grant_type', 'refresh_token'];
  if (grant !== 'password' && grant !== 'refresh_token') return false;
  if ([...form.keys()].length !== allowed.length) return false;
  if (
    !allowed.every(
      (key) => form.getAll(key).length === 1 && form.get(key) !== '',
    )
  )
    return false;
  return grant !== 'password' || form.get('scope') === 'profile';
}

/** Cloudflare Pages runtime only: no import from browser code or Vite configuration. */
export async function onRequest({
  request,
  env,
}: TokenContext): Promise<Response> {
  // Compare the complete URL so query markers, fragments and other origins fail closed.
  if (request.url !== `${ADMIN_ORIGIN}${TOKEN_PATH}`) return failure(404);
  if (request.method !== 'POST') return failure(405);
  const fetchSite = request.headers.get('Sec-Fetch-Site');
  if (
    request.headers.get('Origin') !== ADMIN_ORIGIN ||
    (fetchSite !== null && fetchSite !== 'same-origin')
  )
    return failure(403);
  if (
    !/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers.get('Content-Type') ?? '',
    )
  )
    return failure(415);

  const secret = env.PUYU_ADMIN_CLIENT_SECRET;
  if (typeof secret !== 'string' || /[\r\n\0]/.test(secret))
    return failure(503);
  const secretBytes = new TextEncoder().encode(secret);
  if (secretBytes.byteLength < 32 || secretBytes.byteLength > 72)
    return failure(503);
  const basicBytes = new TextEncoder().encode(`puyu-admin:${secret}`);
  const authorization = `Basic ${btoa(String.fromCodePoint(...basicBytes))}`;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // One total deadline covers incoming reads, fetch and upstream response reads.
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new BridgeError(502));
    }, TIMEOUT_MS);
  });
  try {
    const body = await readBounded(request.body, REQUEST_LIMIT, deadline, 413);
    if (!validForm(body)) return failure(400);
    const upstream = await Promise.race([
      fetch(TOKEN_UPSTREAM, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: authorization,
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body,
        redirect: 'manual',
        signal: controller.signal,
      }),
      deadline,
    ]);
    if (
      (upstream.status >= 300 && upstream.status < 400) ||
      upstream.headers
        .get('Content-Type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase() !== 'application/json'
    ) {
      void upstream.body?.cancel().catch(() => {});
      return failure(502);
    }
    const responseBody = await readBounded(
      upstream.body,
      RESPONSE_LIMIT,
      deadline,
      502,
    );
    const parsed: unknown = JSON.parse(responseBody);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return failure(502);
    return jsonResponse(responseBody, upstream.status);
  } catch (error) {
    return failure(error instanceof BridgeError ? error.status : 502);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
