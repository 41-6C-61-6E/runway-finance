export function isSimilarDescription(desc1: string, desc2: string): boolean {
  if (desc1.toLowerCase().trim() === desc2.toLowerCase().trim()) return true;

  const normalize = (desc: string) => {
    return desc
      .toLowerCase()
      // Remove common prefix/suffix tokens / noise words
      .replace(/\b(pending|withdrawal|pos|purchase|debit|credit|card|payment|check|transaction|auth|authorization|atm|eft|hold|temp|temporary|ref|id|seq)\b/gi, '')
      // Remove dates like 12/25 or 12-25
      .replace(/\b\d{1,2}[\/-]\d{1,2}\b/g, '')
      // Remove random numeric codes or card numbers (e.g. #1234, x1234, 4567, 123456789)
      .replace(/\b(x|#)?\d{3,}\b/g, '')
      // Strip special chars and replace with space
      .replace(/[^a-z0-9 ]/g, ' ')
      // Collapse whitespace
      .trim()
      .replace(/\s+/g, ' ');
  };

  const n1 = normalize(desc1);
  const n2 = normalize(desc2);

  if (!n1 || !n2) return false;
  if (n1 === n2) return true;

  // Match if they are identical when stripping all spaces (handles punctuation/apostrophe spacing variations like McDonald's vs McDonalds)
  if (n1.replace(/\s+/g, '') === n2.replace(/\s+/g, '')) return true;

  // Substring match: one contains the other. We require both normalized strings to be at least 4 characters to avoid matching short noise words.
  const len1 = n1.length;
  const len2 = n2.length;
  if (len1 >= 4 && len2 >= 4) {
    if (n1.includes(n2) || n2.includes(n1)) return true;
  }

  return false;
}
