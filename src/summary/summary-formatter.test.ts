/**
 * Unit Tests for Summary Formatter
 *
 * Tests the DefaultSummaryFormatter that parses JSON summaries from AI
 * providers and renders them as Telegram-friendly HTML text with bold
 * topic names and bullet highlights.
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
  it('should parse valid topic-based JSON', () => {
    const json = '{"t":[{"n":"Topic 1","h":["highlight 1","highlight 2"]}],"q":["question?"]}';
    const result = tryParseSummaryJson(json);
    expect(result).toEqual({
      t: [{ n: 'Topic 1', h: ['highlight 1', 'highlight 2'] }],
      q: ['question?'],
    });
  });

  it('should parse multiple topics', () => {
    const json = '{"t":[{"n":"A","h":["a1"]},{"n":"B","h":["b1","b2"]}],"q":[]}';
    const result = tryParseSummaryJson(json);
    expect(result).toEqual({
      t: [{ n: 'A', h: ['a1'] }, { n: 'B', h: ['b1', 'b2'] }],
      q: [],
    });
  });

  it('should handle missing q array', () => {
    const json = '{"t":[{"n":"Topic","h":["point 1"]}]}';
    const result = tryParseSummaryJson(json);
    expect(result).toEqual({ t: [{ n: 'Topic', h: ['point 1'] }], q: [] });
  });

  it('should filter out non-string highlights', () => {
    const json = '{"t":[{"n":"Topic","h":["valid",123,null,"also valid"]}],"q":[true,"real question"]}';
    const result = tryParseSummaryJson(json);
    expect(result).toEqual({
      t: [{ n: 'Topic', h: ['valid', 'also valid'] }],
      q: ['real question'],
    });
  });

  it('should skip invalid topic objects', () => {
    const json = '{"t":[{"n":"Good","h":["ok"]},{"bad":"data"},{"n":123,"h":["nope"]}],"q":[]}';
    const result = tryParseSummaryJson(json);
    expect(result).toEqual({ t: [{ n: 'Good', h: ['ok'] }], q: [] });
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

  // Legacy format backward compatibility
  it('should convert legacy s-format to topic format', () => {
    const json = '{"s":["point 1","point 2"],"q":["question?"]}';
    const result = tryParseSummaryJson(json);
    expect(result).toEqual({
      t: [{ n: '', h: ['point 1'] }, { n: '', h: ['point 2'] }],
      q: ['question?'],
    });
  });

  it('should handle legacy format with missing q', () => {
    const json = '{"s":["point 1"]}';
    const result = tryParseSummaryJson(json);
    expect(result).toEqual({ t: [{ n: '', h: ['point 1'] }], q: [] });
  });
});

describe('renderSummary', () => {
  it('should render topics with bold names and highlights', () => {
    const data = {
      t: [
        { n: 'Deadline', h: ['@alice proposed March', '@bob agreed'] },
      ],
      q: ['When is launch?'],
    };
    const result = renderSummary(data);
    expect(result).toBe(
      '🧵 <b>Summary</b>\n\n<b>Deadline</b>\n• @alice proposed March\n• @bob agreed\n\n❓ <b>Open questions</b>\n• When is launch?'
    );
  });

  it('should render multiple topics', () => {
    const data = {
      t: [
        { n: 'Topic A', h: ['point 1'] },
        { n: 'Topic B', h: ['point 2'] },
      ],
      q: [],
    };
    const result = renderSummary(data);
    expect(result).toContain('<b>Topic A</b>');
    expect(result).toContain('<b>Topic B</b>');
    expect(result).toContain('• point 1');
    expect(result).toContain('• point 2');
    expect(result).not.toContain('❓');
  });

  it('should omit bold name when topic name is empty (legacy)', () => {
    const data = { t: [{ n: '', h: ['legacy point'] }], q: [] };
    const result = renderSummary(data);
    expect(result).toBe('🧵 <b>Summary</b>\n\n• legacy point');
    expect(result).not.toContain('<b></b>');
  });

  it('should omit questions section when empty', () => {
    const data = { t: [{ n: 'Topic', h: ['point'] }], q: [] };
    const result = renderSummary(data);
    expect(result).not.toContain('❓');
  });

  it('should escape HTML in content', () => {
    const data = { t: [{ n: 'x < y', h: ['a & b > c'] }], q: [] };
    const result = renderSummary(data);
    expect(result).toContain('<b>x &lt; y</b>');
    expect(result).toContain('a &amp; b &gt; c');
  });

  it('should preserve unicode characters', () => {
    const data = { t: [{ n: 'Тема', h: ['@іван запропонував дедлайн', '项目讨论'] }], q: [] };
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

  describe('new topic-based JSON', () => {
    it('should parse and render topic-based summary', () => {
      const json = '{"t":[{"n":"Deadline","h":["@alice proposed Q1","@bob agreed"]},{"n":"Budget","h":["over by 20%"]}],"q":["Should we postpone?"]}';
      const result = formatter.format(json);
      expect(result).toContain('🧵 <b>Summary</b>');
      expect(result).toContain('<b>Deadline</b>');
      expect(result).toContain('• @alice proposed Q1');
      expect(result).toContain('• @bob agreed');
      expect(result).toContain('<b>Budget</b>');
      expect(result).toContain('• over by 20%');
      expect(result).toContain('❓ <b>Open questions</b>');
      expect(result).toContain('• Should we postpone?');
    });

    it('should render without questions section when q is empty', () => {
      const json = '{"t":[{"n":"Topic","h":["point"]}],"q":[]}';
      const result = formatter.format(json);
      expect(result).toContain('🧵 <b>Summary</b>');
      expect(result).toContain('<b>Topic</b>');
      expect(result).toContain('• point');
      expect(result).not.toContain('❓');
    });

    it('should return empty summary for empty topics and questions', () => {
      const json = '{"t":[{"n":"Empty","h":[]}],"q":[]}';
      const result = formatter.format(json);
      expect(result).toContain('🧵');
      expect(result).toContain('No significant topics to summarize.');
    });
  });

  describe('legacy s-format backward compatibility', () => {
    it('should render legacy format as plain bullets', () => {
      const json = '{"s":["@alice proposed deadline"],"q":[]}';
      const result = formatter.format(json);
      expect(result).toContain('🧵 <b>Summary</b>');
      expect(result).toContain('• @alice proposed deadline');
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
        h: [`${'A'.repeat(80)}`],
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
        h: [`${'B'.repeat(100)}`],
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
      const json = '{"t":[{"n":"Security","h":["Discussed <script> injection"]}],"q":[]}';
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
    const result = formatter.format('{"t":[{"n":"Test","h":["Test point"]}],"q":[]}');
    expect(result).toContain('🧵');
    expect(result).toContain('<b>Test</b>');
    expect(result).toContain('Test point');
  });
});
