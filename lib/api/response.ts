import { NextResponse } from 'next/server';
import { type ZodSchema } from 'zod';

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(
  errorOrMessage: string,
  statusOrMessage: number | string = 400,
  statusOrDetails: number | unknown = 400,
  details?: unknown
) {
  let error = errorOrMessage;
  let message = errorOrMessage;
  let status = 400;
  let finalDetails = details;

  if (typeof statusOrMessage === 'number') {
    status = statusOrMessage;
    finalDetails = statusOrDetails;
  } else if (typeof statusOrMessage === 'string') {
    message = statusOrMessage;
    if (typeof statusOrDetails === 'number') {
      status = statusOrDetails;
    }
  }

  return NextResponse.json(
    {
      error,
      message,
      ...(finalDetails !== undefined ? { details: finalDetails } : {}),
    },
    { status }
  );
}

export function apiUnauthorized(message = 'Authentication required') {
  return apiError('unauthorized', message, 401);
}

export function apiForbidden(message = 'Access denied') {
  return apiError('forbidden', message, 403);
}

export function apiNotFound(message = 'Resource not found') {
  return apiError('not_found', message, 404);
}

export function apiBadRequest(message = 'Bad request', details?: unknown) {
  return apiError('bad_request', message, 400, details);
}

export function apiInternalError(message = 'Internal server error') {
  return apiError('internal_error', message, 500);
}

export async function parseAndValidateBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  try {
    const rawBody = await req.json();
    const parsed = schema.safeParse(rawBody);
    if (!parsed.success) {
      const issueMessage = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return {
        data: null,
        error: apiBadRequest(`Validation error: ${issueMessage}`, parsed.error.format()),
      };
    }
    return { data: parsed.data, error: null };
  } catch {
    return {
      data: null,
      error: apiBadRequest('Invalid JSON payload'),
    };
  }
}
