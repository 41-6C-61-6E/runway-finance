import { NextResponse } from 'next/server';
import { type ZodSchema } from 'zod';
import { logger } from '@/lib/logger';

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

export function apiValidation(details?: unknown, message = 'Request validation failed') {
  return apiError('validation_error', message, 400, details);
}

export function apiTooManyRequests(message = 'Too many requests') {
  return apiError('too_many_requests', message, 429);
}

export function apiUpstream(message = 'Upstream service error') {
  return apiError('upstream_error', message, 502);
}

export function apiInternalError(message = 'Internal server error') {
  return apiError('internal_error', message, 500);
}

const PG_MAP: Record<string, { status: number; code: string; message: string }> = {
  '23503': { status: 409, code: 'conflict', message: 'A reference in your data is invalid or missing. Check your mapping and try again.' },
  '23505': { status: 409, code: 'duplicate', message: 'Duplicate record detected. The record or key already exists.' },
  '22P02': { status: 400, code: 'invalid_value', message: 'A value in your request could not be parsed into the expected type.' },
  '22023': { status: 400, code: 'invalid_value', message: 'A parameter or value in your data is out of range.' },
  '22007': { status: 400, code: 'invalid_date', message: 'An invalid date or time format was supplied.' },
  '42703': { status: 500, code: 'internal_error', message: 'A database query error occurred.' },
  '42P01': { status: 500, code: 'internal_error', message: 'A database table error occurred.' },
};

export function handleApiError(e: unknown, fallback = 'An unexpected error occurred'): NextResponse {
  if (e instanceof NextResponse || (typeof Response !== 'undefined' && e instanceof Response)) {
    return e as NextResponse;
  }

  const errCode = (e as any)?.code;
  if (typeof errCode === 'string' && PG_MAP[errCode]) {
    const mapped = PG_MAP[errCode];
    logger.error('[api] Postgres error', {
      pgCode: errCode,
      message: (e as Error)?.message,
      stack: (e as Error)?.stack,
    });
    return apiError(mapped.code, mapped.message, mapped.status);
  }

  if (e instanceof Error && e.message.includes('Failed query:')) {
    logger.error('[api] Query execution failed', { message: e.message, stack: e.stack });
    if (e.message.includes('violates foreign key constraint')) {
      return apiError('conflict', 'A reference in your data is invalid. Check your mapping and try again.', 409);
    }
    if (e.message.includes('violates unique constraint') || e.message.includes('duplicate key')) {
      return apiError('duplicate', 'Duplicate records detected. Some rows may already exist.', 409);
    }
    if (e.message.includes('invalid input syntax for type date')) {
      return apiError('invalid_date', 'Some dates could not be understood. Check your date format.', 400);
    }
    if (e.message.includes('invalid input syntax for type uuid')) {
      return apiError('invalid_uuid', 'An invalid ID format was provided.', 400);
    }
    return apiError('query_error', 'A database error occurred. Please check your data and try again.', 500);
  }

  logger.error('[api] Unhandled error', {
    error: e instanceof Error ? e.message : String(e),
    stack: e instanceof Error ? e.stack : undefined,
  });

  return apiInternalError(fallback);
}

export function guarded<TArgs extends any[]>(
  fn: (...args: TArgs) => Promise<NextResponse | Response>
): (...args: TArgs) => Promise<NextResponse | Response> {
  return async (...args: TArgs) => {
    try {
      return await fn(...args);
    } catch (err) {
      return handleApiError(err);
    }
  };
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
        error: apiValidation(parsed.error.format(), `Validation error: ${issueMessage}`),
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
