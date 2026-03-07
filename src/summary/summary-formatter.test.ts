/**
 * Unit Tests for Summary Formatter
 *
 * Tests the DefaultSummaryFormatter that parses JSON summaries from AI
 * providers and renders them as Telegram-friendly HTML text with bold
 * topic names and blockquote summaries.
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
  it('should parse valid topic-based JSON with summary strings', () => {
    const json = '{"t":[{"n":"Topic 1","s":"Summary paragraph here."}],"q":["question?"]}';
    const result = tryParseSummaryJson(json);
    expect(result).toEqual({
      t: [{ n: 'Topic 1', s: 'Summary paragraph here.' }],
      q: ['question?'],
    });
  });

  it('should parse multiple topics', () => {
    const json = '{"t":[{"n":"A","s":"Summary A."},{"n":"B","s":"Summary B."}],"q":[]}';
    const result = tryParseSummaryJson(json);
    expect(result).toEqual({
      t: [{ n: 'A', s: 'Summary A.' }, { n: 'B', s: 'Summary B.' }],
      q: [],
    });
  });

  it('should handle missing q array', () => {
    const json = '{"t":[{"n":"Topic","s":"Summary."}]}';
    const result = tryParseSummaryJson(json);
    expect(result).toEqual({ t: [{ n: 'Topic', s: 'Summary.' }], q: [] });
  });

  it('should skip invalid topic objects', () => {
    const json = '{"t":[{"n":"Good","s":"ok"},{"bad":"data"},{"n":123,"s":"nope"}],"q":[]}';
    const result = tryParseSummaryJson(json);
    expect(result).toEqual({ t: [{ n: 'Good', s: 'ok' }], q: [] });
  });

  it('should return null for invalid JSON', () => {
    expect(tryParseSummaryJson('not json')).toBeNull();
  });

  it('should return null when t is not an array and no s fallback', () => {
    expect(tryParseSummaryJson('{"t":"not array","q":[]}')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(tryParseSummaryJson('')).toBeNull();
  });

  // Previous h-array format backward compatibility
  it('should convert previous h-array format to summary string', () => {
    const json = '{"t":[{"n":"Topic","h":["point 1","point 2"]}],"q":["q?"]}';
    const result = tryParseSummaryJson(json);
    expect(result).toEqual({
      t: [{ n: 'Topic', s: 'point 1. point 2' }],
      q: ['q?'],
    });
  });

  // Legacy flat s-format backward compatibility
  it('should convert legacy s-format to topic format', () => {
    const json = '{"s":["point 1","point 2"],"q":["question?"]}';
    const result = tryParseSummaryJson(json);
    expect(result).toEqual({
      t: [{ n: '', s: 'point 1' }, { n: '', s: 'point 2' }],
      q: ['question?'],
    });
  });

  it('should handle legacy format with missing q', () => {
    const json = '{"s":["point 1"]}';
    const result = tryParseSummaryJson(json);
    expect(result).toEqual({ t: [{ n: '', s: 'point 1' }], q: [] });
  });
});

describe('renderSummary', () => {
  it('should render topics with bold names and blockquote summaries', () => {
    const data = {
      t: [{ n: 'Deadline', s: '@alice proposed March. @bob agreed.' }],
      q: ['When is launch?'],
    };
    const result = renderSummary(data);
    expect(result).toBe(
      '🧵 <b>Summary</b>\n\n<b>Deadline</b>\n<blockquote>@alice proposed March. @bob agreed.</blockquote>\n\n❓ <b>Open questions</b>\n• When is launch?'
    );
  });

  it('should render multiple topics', () => {
    const data = {
      t: [
        { n: 'Topic A', s: 'Summary A.' },
        { n: 'Topic B', s: 'Summary B.' },
      ],
      q: [],
    };
    const result = renderSummary(data);
    expect(result).toContain('<b>Topic A</b>');
    expect(result).toContain('<blockquote>Summary A.</blockquote>');
    expect(result).toContain('<b>Topic B</b>');
    expect(result).toContain('<blockquote>Summary B.</blockquote>');
    expect(result).not.toContain('❓');
  });

  it('should omit bold name when topic name is empty (legacy)', () => {
    const data = { t: [{ n: '', s: 'legacy point' }], q: [] };
    const result = renderSummary(data);
    expect(result).toContain('<blockquote>legacy point</blockquote>');
    expect(result).not.toContain('<b></b>');
  });

  it('should omit questions section when empty', () => {
    const data = { t: [{ n: 'Topic', s: 'Summary.' }], q: [] };
    const result = renderSummary(data);
    expect(result).not.toContain('❓');
  });

  it('should escape HTML in content', () => {
    const data = { t: [{ n: 'x < y', s: 'a & b > c' }], q: [] };
    const result = renderSummary(data);
    expect(result).toContain('<b>x &lt; y</b>');
    expect(result).toContain('a &amp; b &gt; c');
  });

  it('should preserve unicode characters', () => {
    const data = { t: [{ n: 'Тема', s: '@іван запропонував дедлайн. 项目讨论.' }], q: [] };
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

  describe('topic-based JSON', () => {
    it('should parse and render topic-based summary', () => {
      const json = '{"t":[{"n":"Deadline","s":"@alice proposed Q1. @bob agreed."},{"n":"Budget","s":"Over by 20%."}],"q":["Should we postpone?"]}';
      const result = formatter.format(json);
      expect(result).toContain('🧵 <b>Summary</b>');
      expect(result).toContain('<b>Deadline</b>');
      expect(result).toContain('<blockquote>@alice proposed Q1. @bob agreed.</blockquote>');
      expect(result).toContain('<b>Budget</b>');
      expect(result).toContain('<blockquote>Over by 20%.</blockquote>');
      expect(result).toContain('❓ <b>Open questions</b>');
      expect(result).toContain('• Should we postpone?');
    });

    it('should render without questions section when q is empty', () => {
      const json = '{"t":[{"n":"Topic","s":"Summary paragraph."}],"q":[]}';
      const result = formatter.format(json);
      expect(result).toContain('🧵 <b>Summary</b>');
      expect(result).toContain('<b>Topic</b>');
      expect(result).toContain('<blockquote>Summary paragraph.</blockquote>');
      expect(result).not.toContain('❓');
    });

    it('should return empty summary for empty topic summaries', () => {
      const json = '{"t":[{"n":"Empty","s":""}],"q":[]}';
      const result = formatter.format(json);
      expect(result).toContain('🧵');
      expect(result).toContain('No significant topics to summarize.');
    });
  });

  describe('backward compatibility', () => {
    it('should render previous h-array format via blockquote', () => {
      const json = '{"t":[{"n":"Topic","h":["point 1","point 2"]}],"q":[]}';
      const result = formatter.format(json);
      expect(result).toContain('<b>Topic</b>');
      expect(result).toContain('<blockquote>point 1. point 2</blockquote>');
    });

    it('should render legacy s-format as blockquotes', () => {
      const json = '{"s":["@alice proposed deadline"],"q":[]}';
      const result = formatter.format(json);
      expect(result).toContain('🧵 <b>Summary</b>');
      expect(result).toContain('<blockquote>@alice proposed deadline</blockquote>');
    });

    it('should fall back to raw text for empty legacy arrays', () => {
      const json = '{"s":[],"q":[]}';
      const result = formatter.format(json);
      expect(result).toBe('{"s":[],"q":[]}');
    });
  });

  describe('intelligent truncation', () => {
    it('should truncate by removing topics from end when too long', () => {
      const topics = Array.from({ length: 50 }, (_, i) => ({
        n: `Topic ${i}`,
        s: 'A'.repeat(80),
      }));
      const json = JSON.stringify({ t: topics, q: ['Question?'] });
      const result = formatter.format(json);
      expect(result.length).toBeLessThanOrEqual(4000);
      expect(result).toContain('🧵 <b>Summary</b>');
      expect(result).toContain('Topic 0');
    });

    it('should remove questions before removing topics', () => {
      const topics = Array.from({ length: 30 }, (_, i) => ({
        n: `Topic ${i}`,
        s: 'B'.repeat(100),
      }));
      const questions = Array.from({ length: 10 }, (_, i) => `Long question ${i}? ${'C'.repeat(80)}`);
      const json = JSON.stringify({ t: topics, q: questions });
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
      const json = '{"t":[{"n":"Security","s":"Discussed <script> injection."}],"q":[]}';
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
    const result = formatter.format('{"t":[{"n":"Test","s":"Test summary."}],"q":[]}');
    expect(result).toContain('🧵');
    expect(result).toContain('<b>Test</b>');
    expect(result).toContain('<blockquote>Test summary.</blockquote>');
  });
});
