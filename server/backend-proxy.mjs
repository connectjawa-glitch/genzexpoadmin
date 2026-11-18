// The existing Worker owns authentication and D1. Keep its secrets server-only.
const DEFAULT_BACKEND = 'https://erode-genz-agri-expo-2027.surprisingiris2.chatgpt.site';
const SESSION_COOKIE = '__Host-expo_admin';
const BODY_LIMIT = 4096;
const METHODS = new Map([
  ['/api/bookings', 'GET'],
  ['/api/admin/session', 'GET'],
  ['/api/admin/login', 'POST'],
  ['/api/admin/logout', 'POST'],
]);

function header(request, name) {
  const value = request.headers?.[name];
  return typeof value === 'string' ? value : '';
}

function reply(response, status, body) {
  response.statusCode = status;
  response.end(JSON.stringify(body));
}

function sessionCookie(value) {
  const cookies = value.split(';').map(part => part.trim()).filter(part => part.startsWith(SESSION_COOKIE + '='));
  return cookies.length === 1 && new RegExp(`^${SESSION_COOKIE}=[a-f0-9]{64}$`).test(cookies[0]) ? cookies[0] : '';
}

function safeSetCookie(value) {
  // Host-only cookies returned by the backend become host-only on this portal.
  const parts = value.split(';').map(part => part.trim());
  if (!new RegExp(`^${SESSION_COOKIE}=([a-f0-9]{64})?$`).test(parts[0])) return false;
  const attributes = parts.slice(1).map(part => part.toLowerCase());
  return attributes.includes('path=/') && attributes.includes('secure') && attributes.includes('httponly')
    && attributes.includes('samesite=strict') && !attributes.some(part => part.startsWith('domain='))
    && attributes.every(part => /^(path=\/|secure|httponly|samesite=strict|max-age=\d+)$/.test(part));
}

async function readJSON(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(header(request, 'content-type'))) throw { status: 415, message: 'Send JSON data.' };
  if (Number(header(request, 'content-length')) > BODY_LIMIT) throw { status: 413, message: 'Request is too large.' };
  let raw;
  // Vercel normally parses JSON before invoking Node handlers. Also support streams.
  if (request.body !== undefined && request.body !== null) {
    raw = Buffer.isBuffer(request.body) ? request.body.toString('utf8')
      : typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  } else {
    const parts = [];
    let size = 0;
    for await (const chunk of request) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > BODY_LIMIT) throw { status: 413, message: 'Request is too large.' };
      parts.push(bytes);
    }
    raw = Buffer.concat(parts).toString('utf8');
  }
  if (Buffer.byteLength(raw) > BODY_LIMIT) throw { status: 413, message: 'Request is too large.' };
  let value;
  try { value = JSON.parse(raw); } catch { throw { status: 400, message: 'Invalid request data.' }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw { status: 400, message: 'Invalid request data.' };
  return JSON.stringify(value);
}

async function backendJSON(upstream) {
  if (Number(upstream.headers.get('content-length')) > 1024 * 1024) throw new Error('Backend response is too large');
  const reader = upstream.body?.getReader();
  if (!reader) throw new Error('Missing backend response');
  let size = 0;
  const parts = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1024 * 1024) {
      await reader.cancel();
      throw new Error('Backend response is too large');
    }
    parts.push(Buffer.from(value));
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}

export async function proxyToBackend(request, response, {
  fetcher = globalThis.fetch,
  backendOrigin = process.env.EXPO_BACKEND_ORIGIN || DEFAULT_BACKEND,
  timeoutMs = 12000,
} = {}) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Vary', 'Cookie');
  let timer;
  try {
    const host = header(request, 'host');
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/i.test(host)) return reply(response, 400, { error: 'Invalid request host.' });
    const origin = `https://${host}`;
    const path = new URL(request.url, origin).pathname;
    const match = path.match(/^\/api\/admin\/bookings\/([1-9]\d{0,2})$/);
    const expectedMethod = METHODS.get(path) || (match && Number(match[1]) <= 193 ? 'PUT' : null);
    if (!expectedMethod) return reply(response, 404, { error: 'Not found.' });
    if (request.method !== expectedMethod) {
      response.setHeader('Allow', expectedMethod);
      return reply(response, 405, { error: 'Method is not allowed.' });
    }
    const unsafe = expectedMethod !== 'GET';
    // Check the browser-to-portal boundary before translating the upstream Origin.
    if ((path.startsWith('/api/admin/') && header(request, 'sec-fetch-site') === 'cross-site')
      || (unsafe && header(request, 'origin') !== origin)) {
      return reply(response, 403, { error: 'This request is not permitted.' });
    }
    const backend = new URL(backendOrigin);
    if (backend.protocol !== 'https:' || backend.username || backend.password || backend.origin !== backendOrigin) {
      return reply(response, 503, { error: 'Booking management is temporarily unavailable.' });
    }
    const headers = { Accept: 'application/json' };
    let body;
    if (unsafe) {
      headers.Origin = backend.origin;
      headers['Sec-Fetch-Site'] = 'same-origin';
      if (path !== '/api/admin/logout') {
        body = await readJSON(request);
        headers['Content-Type'] = 'application/json';
      }
    }
    if (path !== '/api/bookings' && path !== '/api/admin/login') {
      const cookie = sessionCookie(header(request, 'cookie'));
      if (cookie) headers.Cookie = cookie;
    }
    const userAgent = header(request, 'user-agent');
    if (userAgent) headers['User-Agent'] = userAgent;
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);
    const upstream = await fetcher(backend.origin + path, {
      method: expectedMethod, headers, ...(body === undefined ? {} : { body }),
      redirect: 'manual', signal: controller.signal,
    });
    if (upstream.status >= 300 && upstream.status < 400) throw new Error('Unexpected backend redirect');
    if (!/^application\/json(?:\s*;|$)/i.test(upstream.headers.get('content-type') || '')) throw new Error('Unexpected backend response');
    const data = await backendJSON(upstream);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Unexpected backend data');
    if (path !== '/api/bookings') {
      const cookies = upstream.headers.getSetCookie?.() || [upstream.headers.get('set-cookie')].filter(Boolean);
      const safeCookies = cookies.filter(safeSetCookie);
      if (safeCookies.length === 1) response.setHeader('Set-Cookie', safeCookies);
    }
    const retryAfter = upstream.headers.get('retry-after');
    if (upstream.status === 429 && /^\d{1,5}$/.test(retryAfter || '')) response.setHeader('Retry-After', retryAfter);
    reply(response, upstream.status, data);
  } catch (error) {
    const status = [400, 413, 415].includes(error?.status) ? error.status : 502;
    reply(response, status, { error: status === 502 ? 'Could not reach the booking service. Please try again.' : error.message });
  } finally {
    clearTimeout(timer);
  }
}

export default function handler(request, response) {
  return proxyToBackend(request, response);
}
