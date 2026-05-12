/**
 * Single source of truth for client → API HTTP calls. Encodes the project's
 * conventions in one place:
 *  - sends cookies (`credentials: 'include'`),
 *  - auto-serializes plain object bodies to JSON (FormData / Blob / string
 *    pass through untouched so the browser can set the right boundary),
 *  - parses problem+json (RFC 7807) error bodies and surfaces `detail`/`title`
 *    on the thrown error so toasts get the real reason — not a generic
 *    `Failed to X: 400`,
 *  - throws a typed {@link ApiError} carrying `status` and the raw `body` so
 *    callers can branch on HTTP status without casting through `any`.
 *
 * Network failures (`TypeError` from fetch) are wrapped with a stable, human
 * readable message so UI code can treat "offline" the same as "5xx".
 */

/** Thrown for any non-2xx HTTP response or transport failure. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** Stable status code we report for offline / DNS / CORS-blocked transports. */
const NETWORK_ERROR_STATUS = 0;

export type ApiResponseType = 'json' | 'blob' | 'text' | 'response';

export interface ApiFetchOptions {
  method?: string;
  /**
   * Request body. Plain objects are JSON-stringified and `Content-Type:
   * application/json` is set automatically. `FormData`, `Blob`, `ArrayBuffer`,
   * `URLSearchParams` and `string` values are passed through to `fetch` as-is.
   */
  body?: unknown;
  /** Extra headers; merged on top of the auto-derived ones. */
  headers?: HeadersInit;
  /** Adds an `Idempotency-Key` header when set (see fazy 5 idempotency middleware). */
  idempotencyKey?: string;
  /** How to decode a 2xx response. Defaults to `'json'`. */
  responseType?: ApiResponseType;
  signal?: AbortSignal;
}

function isPassThroughBody(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return true;
  if (value instanceof FormData) return true;
  if (value instanceof Blob) return true;
  if (value instanceof ArrayBuffer) return true;
  if (value instanceof URLSearchParams) return true;
  if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) return true;
  return false;
}

function buildRequestInit(opts: ApiFetchOptions | undefined): RequestInit {
  const headers = new Headers(opts?.headers);
  let body: BodyInit | null | undefined;

  if (opts?.body !== undefined) {
    if (isPassThroughBody(opts.body)) {
      body = opts.body as BodyInit | null;
    } else if (typeof opts.body === 'object') {
      body = JSON.stringify(opts.body);
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
    } else {
      // Numbers, booleans, symbols — coerce to string. This branch exists so the
      // type system doesn't have to be defensive at call sites; in practice no
      // call site sends a primitive body.
      body = String(opts.body);
    }
  }

  if (opts?.idempotencyKey) {
    headers.set('Idempotency-Key', opts.idempotencyKey);
  }

  return {
    method: opts?.method,
    credentials: 'include',
    headers,
    body,
    signal: opts?.signal,
  };
}

/**
 * Parses a problem+json (or legacy `{ error }`) body and returns the best
 * available human-readable message. Order matches RFC 7807: `detail` first
 * (specific to *this* occurrence), then `title` (generic for the type), then
 * legacy `error`, then a fallback derived from the status.
 */
function pickErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const b = body as { detail?: unknown; title?: unknown; error?: unknown };
    if (typeof b.detail === 'string' && b.detail.length > 0) return b.detail;
    if (typeof b.title === 'string' && b.title.length > 0) return b.title;
    if (typeof b.error === 'string' && b.error.length > 0) return b.error;
  }
  return `Request failed: ${status}`;
}

async function readErrorBody(response: Response): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    // Reading a response body can fail if it's already been consumed or the
    // stream errored. Returning null is the only honest answer here — the
    // caller will use the status-based fallback message.
    return null;
  }
  if (text.length === 0) return null;
  // Try JSON regardless of Content-Type. Backends occasionally forget to set
  // `application/problem+json` on legacy `{ error }` payloads, but the body is
  // still structured data we can extract a message from.
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function decodeSuccess<T>(response: Response, responseType: ApiResponseType): Promise<T> {
  if (responseType === 'response') {
    return response as unknown as T;
  }
  if (response.status === 204 || response.headers.get('Content-Length') === '0') {
    return undefined as T;
  }
  if (responseType === 'blob') {
    return (await response.blob()) as unknown as T;
  }
  if (responseType === 'text') {
    return (await response.text()) as unknown as T;
  }
  // Default: JSON. An empty body for `responseType: 'json'` resolves to
  // undefined — useful for endpoints that return 200 with no payload.
  const text = await response.text();
  if (text.length === 0) return undefined as T;
  return JSON.parse(text) as T;
}

export async function apiFetch<T>(path: string, opts?: ApiFetchOptions): Promise<T> {
  const init = buildRequestInit(opts);

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Aborts are intentional — propagate so TanStack Query can recognise them.
      throw err;
    }
    const cause = err instanceof Error ? err.message : String(err);
    throw new ApiError(`Network error: ${cause}`, NETWORK_ERROR_STATUS, null);
  }

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ApiError(pickErrorMessage(body, response.status), response.status, body);
  }

  return decodeSuccess<T>(response, opts?.responseType ?? 'json');
}
