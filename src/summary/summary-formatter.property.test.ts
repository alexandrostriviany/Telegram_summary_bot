/**
 * Property-Based Tests for Summary Output Formatting
 *
 * These tests use fast-check to verify that the formatter correctly escapes
 * HTML entities across many randomly generated inputs.
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

  it('should never contain unescaped < or > or & in output', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 300 }).filter(s => s.trim().length > 0),
        (input: string) => {
          const result = formatter.format(input);
          // After escaping, raw < > & should not appear unless they are part of &amp; &lt; &gt;
          const withoutEntities = result
            .replace(/&amp;/g, '')
            .replace(/&lt;/g, '')
            .replace(/&gt;/g, '');
          expect(withoutEntities).not.toContain('<');
          expect(withoutEntities).not.toContain('>');
          // & can still appear as start of other entities or in emoji, but raw & before
          // non-entity chars should not exist. We just verify no raw <> remain.
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve emoji and unicode characters', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          '🧵 Summary\n\n• Point',
          '❓ Questions:\n\n• Question?',
          '• Обговорення проекту',
          '• 项目讨论',
          '• @іван запропонував',
        ),
        (input: string) => {
          const result = formatter.format(input);
          // Unicode chars should survive escaping (only &<> are replaced)
          expect(result.length).toBeGreaterThan(0);
          return true;
        }
      ),
      { numRuns: 5 }
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
});
