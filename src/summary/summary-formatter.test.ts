/**
 * Unit Tests for Summary Formatter
 *
 * Tests the DefaultSummaryFormatter that escapes AI-generated plain-text
 * summaries for Telegram HTML mode.
 *
 * @module summary/summary-formatter.test
 */

import {
  SummaryFormatter,
  DefaultSummaryFormatter,
  createSummaryFormatter,
} from './summary-formatter';

describe('DefaultSummaryFormatter', () => {
  let formatter: SummaryFormatter;

  beforeEach(() => {
    formatter = new DefaultSummaryFormatter();
  });

  describe('passthrough formatting', () => {
    it('should pass through plain text summary', () => {
      const raw = '🧵 Summary of recent discussion\n\n• @alice proposed Q1 deadline\n\n• @bob agreed';
      const result = formatter.format(raw);
      expect(result).toContain('🧵 Summary of recent discussion');
      expect(result).toContain('• @alice proposed Q1 deadline');
      expect(result).toContain('• @bob agreed');
    });

    it('should trim whitespace', () => {
      const raw = '  🧵 Summary of recent discussion\n\n• Point  \n';
      const result = formatter.format(raw);
      expect(result).toBe('🧵 Summary of recent discussion\n\n• Point');
    });

    it('should preserve bullet format with empty lines', () => {
      const raw = '🧵 Summary of recent discussion\n\n• First point\n\n• Second point\n\n❓ Open questions:\n\n• Question?';
      const result = formatter.format(raw);
      expect(result).toContain('• First point\n\n• Second point');
      expect(result).toContain('❓ Open questions:\n\n• Question?');
    });
  });

  describe('HTML escaping', () => {
    it('should escape & < > in summary text', () => {
      const raw = '🧵 Summary\n\n• @alice said x < y & z > w';
      const result = formatter.format(raw);
      expect(result).toContain('x &lt; y &amp; z &gt; w');
    });

    it('should escape HTML tags', () => {
      const raw = '🧵 Summary\n\n• Discussed <script> injection';
      const result = formatter.format(raw);
      expect(result).toContain('&lt;script&gt;');
    });

    it('should preserve unicode characters', () => {
      const raw = '🧵 Summary\n\n• @іван запропонував дедлайн\n\n• 项目讨论';
      const result = formatter.format(raw);
      expect(result).toContain('@іван запропонував дедлайн');
      expect(result).toContain('项目讨论');
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
  });
});

describe('createSummaryFormatter', () => {
  it('should create a DefaultSummaryFormatter instance', () => {
    const formatter = createSummaryFormatter();
    expect(formatter).toBeInstanceOf(DefaultSummaryFormatter);
  });

  it('should create a working formatter', () => {
    const formatter = createSummaryFormatter();
    const result = formatter.format('🧵 Summary\n\n• Test point');
    expect(result).toContain('🧵');
    expect(result).toContain('Test point');
  });
});
