/**
 * Safe fetch wrapper that handles network and HTTP errors.
 * Automatically throws an Error when the response is not OK (e.g. 500, 400).
 */
export async function apiFetch<T = any>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    let errMsg = `Request failed with status ${response.status}`;
    let errorDetails: any = null;
    try {
      const data = await response.json();
      errorDetails = data;
      errMsg = data.error || data.message || errMsg;
    } catch {
      // Body is not JSON
    }
    const err = new Error(errMsg);
    (err as any).status = response.status;
    (err as any).statusText = response.statusText;
    (err as any).details = errorDetails;
    throw err;
  }

  // Handle empty or non-JSON responses gracefully
  try {
    return await response.json() as T;
  } catch (err) {
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return {} as T;
    }
    throw err;
  }
}
