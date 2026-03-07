/**
 * Unit Tests for Summary Formatter
 *
 * Tests the DefaultSummaryFormatter that parses JSON summaries from AI
 * providers and renders them as Telegram-friendly HTML-escaped text.
 *
 * @module summary/summary-formatter.test
 */

import {
  SummaryFormatter,
  DefaultSummaryFormatter,
  createSummaryFormatter,
  tryParseSummaryJson,
  renderSummary,
} from './summary-formatter';

describe('tryParseSummaryJson', () => {
  it('should parse valid summary JSON', () => {
    const json = '{"s":["point 1","point 2"],"q":["question?"]}';
    const result = tryParseSummaryJson(json);
    expect(result).toEqual({ s: ['point 1', 'point 2'], q: ['question?'] });
  });

  it('should handle missing q array', () => {
    const json = '{"s":["point 1"]}';
    const result = tryParseSummaryJson(json);
    expect(result).toEqual({ s: ['point 1'], q: [] });
  });

  it('should filter out non-string items', () => {
    const json = '{"s":["valid",123,null,"also valid"],"q":[true,"real question"]}';
    const result = tryParseSummaryJson(json);
    expect(result).toEqual({ s: ['valid', 'also valid'], q: ['real question'] });
  });

  it('should return null for invalid JSON', () => {
    expect(tryParseSummaryJson('not json')).toBeNull();
  });

  it('should return null when s is not an array', () => {
    expect(tryParseSummaryJson('{"s":"not array","q":[]}')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(tryParseSummaryJson('')).toBeNull();
  });
});

describe('renderSummary', () => {
  it('should render summary with points and questions', () => {
    const data = { s: ['@alice proposed deadline', '@bob agreed'], q: ['When is launch?'] };
    const result = renderSummary(data);
    expect(result).toBe(
      '🧵 Summary\n\n• @alice proposed deadline\n\n• @bob agreed\n\n❓ Open questions:\n\n• When is launch?'
    );
  });

  it('should omit questions section when empty', () => {
    const data = { s: ['@alice proposed deadline'], q: [] };
    const result = renderSummary(data);
    expect(result).toBe('🧵 Summary\n\n• @alice proposed deadline');
    expect(result).not.toContain('❓');
  });

  it('should escape HTML in content', () => {
    const data = { s: ['@alice said x < y & z > w'], q: [] };
    const result = renderSummary(data);
    expect(result).toContain('x &lt; y &amp; z &gt; w');
  });

  it('should preserve unicode characters', () => {
    const data = { s: ['@іван запропонував дедлайн', '项目讨论'], q: [] };
    const result = renderSummary(data);
    expect(result).toContain('@іван запропонував дедлайн');
    expect(result).toContain('项目讨论');
  });
});

describe('DefaultSummaryFormatter', () => {
  let formatter: SummaryFormatter;

  beforeEach(() => {
    formatter = new DefaultSummaryFormatter();
  });

  describe('JSON parsing and rendering', () => {
    it('should parse JSON and render formatted summary', () => {
      const json = '{"s":["@alice proposed Q1 deadline","@bob agreed"],"q":["Should we postpone?"]}';
      const result = formatter.format(json);
      expect(result).toContain('🧵 Summary');
      expect(result).toContain('• @alice proposed Q1 deadline');
      expect(result).toContain('• @bob agreed');
      expect(result).toContain('❓ Open questions:');
      expect(result).toContain('• Should we postpone?');
    });

    it('should render without questions section when q is empty', () => {
      const json = '{"s":["@alice proposed deadline"],"q":[]}';
      const result = formatter.format(json);
      expect(result).toContain('🧵 Summary');
      expect(result).toContain('• @alice proposed deadline');
      expect(result).not.toContain('❓');
    });

    it('should return empty summary for empty JSON arrays', () => {
      const json = '{"s":[],"q":[]}';
      const result = formatter.format(json);
      expect(result).toContain('🧵');
      expect(result).toContain('No significant topics to summarize.');
    });
  });

  describe('intelligent truncation', () => {
    it('should truncate by removing bullets from end when too long', () => {
      const longPoints = Array.from({ length: 100 }, (_, i) => `Point ${i}: ${'A'.repeat(80)}`);
      const json = JSON.stringify({ s: longPoints, q: ['Question?'] });
      const result = formatter.format(json);
      expect(result.length).toBeLessThanOrEqual(4000);
      expect(result).toContain('🧵 Summary');
      // Should keep at least the first point
      expect(result).toContain('Point 0');
    });

    it('should remove questions before removing summary points', () => {
      // Create summary that fits without questions but not with them
      const points = Array.from({ length: 40 }, (_, i) => `Point ${i}: ${'B'.repeat(80)}`);
      const questions = Array.from({ length: 10 }, (_, i) => `Long question ${i}? ${'C'.repeat(80)}`);
      const json = JSON.stringify({ s: points, q: questions });
      const result = formatter.format(json);
      expect(result.length).toBeLessThanOrEqual(4000);
    });
  });

  describe('fallback for non-JSON input', () => {
    it('should escape HTML in raw text fallback', () => {
      const raw = '🧵 Summary\n\n• @alice said x < y & z > w';
      const result = formatter.format(raw);
      expect(result).toContain('x &lt; y &amp; z &gt; w');
    });

    it('should pass through plain text with HTML escaping', () => {
      const raw = 'Some plain text summary';
      const result = formatter.format(raw);
      expect(result).toBe('Some plain text summary');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string input', () => {
      const result = formatter.format('');
      expect(result).toContain('🧵');
      expect(result).toContain('No significant topics to summarize.');
    });

    it('should handle whitespace-only input', () => {
      const result = formatter.format('   \n\t\n   ');
      expect(result).toContain('🧵');
      expect(result).toContain('No significant topics to summarize.');
    });

    it('should handle null-like input gracefully', () => {
      const result = formatter.format(null as unknown as string);
      expect(result).toContain('🧵');
      expect(result).toContain('No significant topics to summarize.');
    });

    it('should handle undefined input gracefully', () => {
      const result = formatter.format(undefined as unknown as string);
      expect(result).toContain('🧵');
      expect(result).toContain('No significant topics to summarize.');
    });

    it('should escape HTML tags in JSON content', () => {
      const json = '{"s":["Discussed <script> injection"],"q":[]}';
      const result = formatter.format(json);
      expect(result).toContain('&lt;script&gt;');
    });
  });
});

describe('createSummaryFormatter', () => {
  it('should create a DefaultSummaryFormatter instance', () => {
    const formatter = createSummaryFormatter();
    expect(formatter).toBeInstanceOf(DefaultSummaryFormatter);
  });

  it('should create a working formatter', () => {
    const formatter = createSummaryFormatter();
    const result = formatter.format('{"s":["Test point"],"q":[]}');
    expect(result).toContain('🧵');
    expect(result).toContain('Test point');
  });
});
