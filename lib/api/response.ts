import { NextResponse } from "next/server";
import { ZodSchema, ZodError } from "zod";

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    {
      error: message,
      ...(details ? { details } : {}),
    },
    { status }
  );
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
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      return {
        data: null,
        error: apiError(`Validation error: ${issueMessage}`, 400, parsed.error.format()),
      };
    }
    return { data: parsed.data, error: null };
  } catch (err) {
    return {
      data: null,
      error: apiError("Invalid JSON payload", 400),
    };
  }
}
