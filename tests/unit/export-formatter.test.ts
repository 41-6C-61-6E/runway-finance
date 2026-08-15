import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/utils/export-formatter';

describe('Export Formatter', () => {
  it('escapes CSV formula injection prefixes', () => {
    const rows = [
      { name: '=SUM(A1:A10)', description: '+12345', memo: '-cmd|/c calc' },
      { name: '@malicious', description: '\tcmd', memo: '|cmd' },
      { name: 'Normal Name', description: 'Normal, text with comma', memo: 'Normal text' },
    ];

    const csv = toCsv(rows);
    const lines = csv.split('\n');

    expect(lines[1]).toContain("'=SUM(A1:A10)");
    expect(lines[1]).toContain("'+12345");
    expect(lines[1]).toContain("'-cmd|/c calc");
    expect(lines[2]).toContain("'@malicious");
    expect(lines[3]).toContain('"Normal, text with comma"');
  });
});
