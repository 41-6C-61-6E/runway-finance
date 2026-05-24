import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { parseCsv } from '@/lib/utils/csv-parser';

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
    return NextResponse.json(
      { error: 'Failed to parse CSV', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
