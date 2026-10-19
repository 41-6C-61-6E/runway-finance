// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AdviceMarkdown } from '@/components/features/advice/AdviceMarkdown';

vi.mock('@/components/privacy-mode-provider', () => ({
  usePrivacyMode: () => ({ privacyMode: false }),
}));

describe('AdviceMarkdown', () => {
  it('renders headings as h3 or h4 and never h1 or h2', () => {
    const markdown = '# Main Heading\n## Sub Heading\n### Section Heading';
    const { container } = render(<AdviceMarkdown content={markdown} />);

    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelector('h2')).toBeNull();
    expect(container.querySelectorAll('h3').length).toBe(2); // level 1 and 2 become h3
    expect(container.querySelectorAll('h4').length).toBe(1); // level 3 becomes h4
  });

  it('prevents HTML and script injection, displaying tags as text', () => {
    const malicious = '<script>alert("xss")</script><img src="x" onerror="alert(1)" />';
    const { container } = render(<AdviceMarkdown content={malicious} />);

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<script>alert("xss")</script>');
  });

  it('renders allowlisted internal links with Next.js Link but plain text for external links', () => {
    const content = 'Check [Retirement Plans](/plans) or visit [Evil](https://evil.com) and [Other](ftp://bad).';
    const { container } = render(<AdviceMarkdown content={content} />);

    // Internal allowlisted link should render as an <a> tag
    const internalLink = container.querySelector('a[href="/plans"]');
    expect(internalLink).not.toBeNull();
    expect(internalLink?.textContent).toBe('Retirement Plans');

    // External link should NOT render as an <a> tag
    const externalLink = container.querySelector('a[href="https://evil.com"]');
    expect(externalLink).toBeNull();
    expect(container.textContent).toContain('Evil (https://evil.com)');
  });

  it('renders GFM pipe tables with headers and data rows', () => {
    const tableMarkdown = `
| Category | Budgeted | Actual |
|---|---|---|
| Groceries | $600 | $550 |
| Dining | $300 | $380 |
`;
    const { container } = render(<AdviceMarkdown content={tableMarkdown} />);

    const table = container.querySelector('table');
    expect(table).not.toBeNull();

    const headers = container.querySelectorAll('th');
    expect(headers.length).toBe(3);
    expect(headers[0].textContent).toBe('Category');

    const cells = container.querySelectorAll('td');
    expect(cells.length).toBe(6);
    expect(cells[0].textContent).toBe('Groceries');
    expect(cells[1].textContent).toBe('$600');
  });

  it('renders bold, italic, and inline code formatting', () => {
    const text = 'Here is **bold text**, *italic text*, and `code snippet`.';
    const { container } = render(<AdviceMarkdown content={text} />);

    expect(container.querySelector('strong')?.textContent).toBe('bold text');
    expect(container.querySelector('em')?.textContent).toBe('italic text');
    expect(container.querySelector('code')?.textContent).toBe('code snippet');
  });
});
