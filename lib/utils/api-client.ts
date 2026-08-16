/**
 * Safe fetch wrapper that handles network and HTTP errors.
 * Automatically throws an ApiError when the response is not OK (e.g. 500, 401, 400).
 */

export class ApiError extends Error {
  status: number;
  statusText: string;
  details?: unknown;

  constructor(message: string, status: number, statusText: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.details = details;
  }
}

export async function apiFetch<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);

  // If payload is provided and not FormData, ensure Content-Type is application/json
  if (init?.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(input, {
    credentials: 'include',
    ...init,
    headers,
  });

  if (!response.ok) {
    let errMsg = `Request failed with status ${response.status}`;
    let errorDetails: any = null;
    try {
      const data = await response.json();
      errorDetails = data;
      errMsg = data.message || data.error || errMsg;
    } catch {
      // Body is not JSON
    }

    throw new ApiError(errMsg, response.status, response.statusText, errorDetails);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return {} as T;
  }

  try {
    return (await response.json()) as T;
  } catch (err) {
    return {} as T;
  }
}

export const api = {
  get: <T>(url: string, init?: RequestInit) =>
    apiFetch<T>(url, { method: 'GET', ...init }),
  post: <T>(url: string, body?: unknown, init?: RequestInit) =>
    apiFetch<T>(url, {
      method: 'POST',
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      ...init,
    }),
  put: <T>(url: string, body?: unknown, init?: RequestInit) =>
    apiFetch<T>(url, {
      method: 'PUT',
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      ...init,
    }),
  patch: <T>(url: string, body?: unknown, init?: RequestInit) =>
    apiFetch<T>(url, {
      method: 'PATCH',
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      ...init,
    }),
  delete: <T>(url: string, init?: RequestInit) =>
    apiFetch<T>(url, { method: 'DELETE', ...init }),
};
