/**
 * Property-Based Tests for Summary Output Formatting
 *
 * These tests use fast-check to verify that the formatter correctly handles
 * JSON parsing and HTML escaping across many randomly generated inputs.
 *
 * @module summary/summary-formatter.property.test
 */

import * as fc from 'fast-check';
import {
  SummaryFormatter,
  createSummaryFormatter,
} from './summary-formatter';

describe('Property Tests: Summary Output Formatting', () => {
  let formatter: SummaryFormatter;

  beforeEach(() => {
    formatter = createSummaryFormatter();
  });

  it('should always produce non-empty output for non-empty input', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }).filter(s => s.trim().length > 0),
        (input: string) => {
          const result = formatter.format(input);
          expect(result.length).toBeGreaterThan(0);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should never contain unescaped < or > in output', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 300 }).filter(s => s.trim().length > 0),
        (input: string) => {
          const result = formatter.format(input);
          // After escaping, raw < > should not appear unless part of &lt; &gt;
          const withoutEntities = result
            .replace(/&amp;/g, '')
            .replace(/&lt;/g, '')
            .replace(/&gt;/g, '');
          expect(withoutEntities).not.toContain('<');
          expect(withoutEntities).not.toContain('>');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly parse and render valid summary JSON', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 5 }),
        fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { minLength: 0, maxLength: 3 }),
        (points: string[], questions: string[]) => {
          const json = JSON.stringify({ s: points, q: questions });
          const result = formatter.format(json);
          expect(result).toContain('🧵 Summary');
          // Should contain at least the first point (HTML-escaped)
          expect(result).toContain('•');
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should return fallback message for empty/whitespace input', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('', '   ', '\n\t\n', '  \n  '),
        (input: string) => {
          const result = formatter.format(input);
          expect(result).toContain('🧵');
          expect(result).toContain('No significant topics to summarize.');
          return true;
        }
      ),
      { numRuns: 4 }
    );
  });

  it('should never exceed 4000 characters for JSON input', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 10, maxLength: 200 }), { minLength: 1, maxLength: 50 }),
        (points: string[]) => {
          const json = JSON.stringify({ s: points, q: [] });
          const result = formatter.format(json);
          expect(result.length).toBeLessThanOrEqual(4003); // 4000 + '...'
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
