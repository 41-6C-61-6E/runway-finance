/**
 * fuzzy-match.ts
 *
 * Fuzzy category name matching for the import workflow.
 *
 * Strategy:
 *  1. Token-set Jaccard similarity — normalises both strings into word sets,
 *     removing punctuation connectors and stop-words, then computes
 *     intersection / union. Handles word reordering well, e.g.
 *     "Rent / Mortgage" ↔ "Mortgage and Rent".
 *
 *  2. Substring containment bonus — if every token of the shorter string
 *     appears in the longer string (e.g. "Dental" ⊆ "Dental & Vision"),
 *     add an extra weight.
 *
 *  Final score = jaccard * 0.7 + containment * 0.3
 *
 * Only returns a match when score >= FUZZY_THRESHOLD (0.55 by default).
 */

const FUZZY_THRESHOLD = 0.55;

/** Connector words that carry no semantic meaning for category matching. */
const STOP_WORDS = new Set(['and', 'or', 'the', 'a', 'an', 'of', 'for', 'in', 'to', 'at']);

/**
 * Normalise a category name into a set of meaningful tokens.
 * Steps:
 *   - Lowercase
 *   - Replace punctuation connectors (/ & - + , .) with spaces
 *   - Split on whitespace
 *   - Remove stop-words and empty strings
 */
export function tokenize(s: string): Set<string> {
  const tokens = s
    .toLowerCase()
    .replace(/[/&\-+,.()\[\]]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
  return new Set(tokens);
}

/** Jaccard index: |A ∩ B| / |A ∪ B|, returns 0 for empty sets. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Containment: 1 if every token in the *smaller* set is present in the
 * *larger* set, 0 otherwise. Handles truncated names like "Dental" ⊆ "Dental & Vision".
 */
function containment(a: Set<string>, b: Set<string>): number {
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  if (smaller.size === 0) return 0;
  for (const t of smaller) {
    if (!larger.has(t)) return 0;
  }
  return 1;
}

/**
 * Score a single (csvName, candidate) pair.
 * Returns a value in [0, 1].
 */
export function scoreMatch(csvName: string, candidateName: string): number {
  const a = tokenize(csvName);
  const b = tokenize(candidateName);
  if (a.size === 0 || b.size === 0) return 0;
  return jaccard(a, b) * 0.7 + containment(a, b) * 0.3;
}

export type FuzzyMatchResult = {
  id: string;
  name: string;
  /** Similarity score in [0, 1]. 1.0 = perfect token match. */
  score: number;
};

/**
 * Find the best-matching category for a CSV category name.
 *
 * @param csvName   - The raw category name from the CSV.
 * @param candidates - Existing categories to match against.
 * @param threshold  - Minimum score to accept (default 0.55).
 * @returns The best match, or null if nothing clears the threshold.
 */
export function fuzzyMatchCategory(
  csvName: string,
  candidates: { id: string; name: string }[],
  threshold = FUZZY_THRESHOLD,
): FuzzyMatchResult | null {
  let best: FuzzyMatchResult | null = null;

  for (const candidate of candidates) {
    const score = scoreMatch(csvName, candidate.name);
    if (score >= threshold && (!best || score > best.score)) {
      best = { id: candidate.id, name: candidate.name, score };
    }
  }

  return best;
}
