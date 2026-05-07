import { NextResponse } from 'next/server';

export function requireDeleteConfirmation(request: Request): void {
  if (request.headers.get('X-Confirm-Delete') !== 'true') {
    throw NextResponse.json(
      { error: 'confirmation_required', message: 'Include X-Confirm-Delete: true header' },
      { status: 400 }
    );
  }
}
