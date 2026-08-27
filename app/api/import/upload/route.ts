import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { parseCsv } from '@/lib/utils/csv-parser';
import { handleApiError } from '@/lib/api/response';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // M-5 (2026-08-27 security review): reject oversized CSVs before spending
    // CPU parsing them. Mirrors the 50 MB cap in import/execute.
    const MAX_CSV_BYTES = 50 * 1024 * 1024; // 50 MB
    if (file.size > MAX_CSV_BYTES) {
      return NextResponse.json(
        { error: 'CSV file is too large. The maximum size is 50 MB.' },
        { status: 413 }
      );
    }

    const text = await file.text();
    const result = parseCsv(text);

    if (result.headers.length === 0) {
      return NextResponse.json({ error: 'Could not parse CSV headers', details: result.errors }, { status: 400 });
    }

    return NextResponse.json({
      fileName: file.name,
      headers: result.headers,
      preview: result.rows,
      totalRows: result.totalRows,
      delimiter: result.delimiter,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to parse CSV');
  }
}
