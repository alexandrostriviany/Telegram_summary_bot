/**
 * Unit Tests for Summary Formatter
 *
 * Tests the DefaultSummaryFormatter that parses structured JSON from AI
 * providers and renders Telegram-friendly HTML output.
 *
 * @module summary/summary-formatter.test
 *
 * **Validates: Requirements 3.4**
 */

import {
  SummaryFormatter,
  DefaultSummaryFormatter,
  createSummaryFormatter,
  EMOJI,
  DEFAULT_HEADER,
  OPEN_QUESTIONS_HEADER,
} from './summary-formatter';

describe('DefaultSummaryFormatter', () => {
  let formatter: SummaryFormatter;

  beforeEach(() => {
    formatter = new DefaultSummaryFormatter();
  });

  // -------------------------------------------------------------------------
  // Valid JSON parsing
  // -------------------------------------------------------------------------

  describe('JSON parsing', () => {
    it('should parse valid JSON and render HTML', () => {
      const json = JSON.stringify({
        overview: 'Team discussed deadlines.',
        topics: [
          { title: 'Deadlines', points: ['@alice proposed Q1', '@bob agreed'] },
        ],
        questions: ['When is the final review?'],
      });

      const result = formatter.format(json);

      expect(result).toContain(`${EMOJI.HEADER} <b>${DEFAULT_HEADER}</b>`);
      expect(result).toContain('Team discussed deadlines.');
      expect(result).toContain('<b>Deadlines</b>');
      expect(result).toContain(`${EMOJI.BULLET} @alice proposed Q1`);
      expect(result).toContain(`${EMOJI.BULLET} @bob agreed`);
      expect(result).toContain(`${EMOJI.QUESTION} <b>${OPEN_QUESTIONS_HEADER}</b>`);
      expect(result).toContain(`${EMOJI.BULLET} When is the final review?`);
    });

    it('should parse JSON wrapped in code fences', () => {
      const raw = '```json\n' + JSON.stringify({
        overview: 'Overview text',
        topics: [{ title: 'Topic', points: ['point'] }],
        questions: [],
      }) + '\n```';

      const result = formatter.format(raw);
      expect(result).toContain('<b>Topic</b>');
      expect(result).toContain('Overview text');
    });

    it('should parse JSON wrapped in plain code fences (no json tag)', () => {
      const raw = '```\n' + JSON.stringify({
        overview: 'Overview',
        topics: [{ title: 'T', points: ['p'] }],
        questions: [],
      }) + '\n```';

      const result = formatter.format(raw);
      expect(result).toContain('<b>T</b>');
    });

    it('should extract JSON from surrounding text', () => {
      const json = JSON.stringify({
        overview: 'Extracted',
        topics: [{ title: 'Topic', points: ['point'] }],
        questions: [],
      });
      const raw = `Here is the summary: ${json} Hope that helps!`;

      const result = formatter.format(raw);
      expect(result).toContain('Extracted');
      expect(result).toContain('<b>Topic</b>');
    });
  });

  // -------------------------------------------------------------------------
  // HTML rendering details
  // -------------------------------------------------------------------------

  describe('HTML rendering', () => {
    it('should render topic titles in bold', () => {
      const json = JSON.stringify({
        overview: 'overview',
        topics: [
          { title: 'First Topic', points: ['point'] },
          { title: 'Second Topic', points: ['point'] },
        ],
        questions: [],
      });

      const result = formatter.format(json);
      expect(result).toContain('<b>First Topic</b>');
      expect(result).toContain('<b>Second Topic</b>');
    });

    it('should render bullet points with bullet emoji', () => {
      const json = JSON.stringify({
        overview: 'overview',
        topics: [{ title: 'T', points: ['alpha', 'beta'] }],
        questions: [],
      });

      const result = formatter.format(json);
      expect(result).toContain(`${EMOJI.BULLET} alpha`);
      expect(result).toContain(`${EMOJI.BULLET} beta`);
    });

    it('should render questions section only when questions exist', () => {
      const withQ = JSON.stringify({
        overview: 'o',
        topics: [{ title: 'T', points: ['p'] }],
        questions: ['Q?'],
      });
      const withoutQ = JSON.stringify({
        overview: 'o',
        topics: [{ title: 'T', points: ['p'] }],
        questions: [],
      });

      expect(formatter.format(withQ)).toContain(OPEN_QUESTIONS_HEADER);
      expect(formatter.format(withoutQ)).not.toContain(OPEN_QUESTIONS_HEADER);
    });

    it('should not end with blank lines', () => {
      const json = JSON.stringify({
        overview: 'o',
        topics: [{ title: 'T', points: ['p'] }],
        questions: [],
      });

      const result = formatter.format(json);
      expect(result).not.toMatch(/\n$/);
    });
  });

  // -------------------------------------------------------------------------
  // HTML escaping
  // -------------------------------------------------------------------------

  describe('HTML escaping', () => {
    it('should escape & < > in overview', () => {
      const json = JSON.stringify({
        overview: 'Use <script> tags & "entities"',
        topics: [{ title: 'T', points: ['p'] }],
        questions: [],
      });

      const result = formatter.format(json);
      expect(result).toContain('&lt;script&gt;');
      expect(result).toContain('&amp;');
    });

    it('should escape HTML in topic titles and points', () => {
      const json = JSON.stringify({
        overview: 'o',
        topics: [{ title: '<b>Attack</b>', points: ['a > b & c < d'] }],
        questions: [],
      });

      const result = formatter.format(json);
      expect(result).toContain('<b>&lt;b&gt;Attack&lt;/b&gt;</b>');
      expect(result).toContain('a &gt; b &amp; c &lt; d');
    });

    it('should escape HTML in questions', () => {
      const json = JSON.stringify({
        overview: 'o',
        topics: [{ title: 'T', points: ['p'] }],
        questions: ['Is x < y?'],
      });

      const result = formatter.format(json);
      expect(result).toContain('Is x &lt; y?');
    });
  });

  // -------------------------------------------------------------------------
  // Legacy fallback
  // -------------------------------------------------------------------------

  describe('legacy fallback', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
      warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('should render plain text under header when JSON parsing fails', () => {
      const raw = 'This is a plain text summary with no JSON.';
      const result = formatter.format(raw);

      expect(result).toContain(`${EMOJI.HEADER} <b>${DEFAULT_HEADER}</b>`);
      expect(result).toContain(raw);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('JSON parsing failed')
      );
    });

    it('should escape HTML in legacy fallback text', () => {
      const raw = 'Summary with <html> & stuff';
      const result = formatter.format(raw);

      expect(result).toContain('&lt;html&gt;');
      expect(result).toContain('&amp;');
    });

    it('should fall back for invalid JSON structure', () => {
      const json = JSON.stringify({ foo: 'bar' });
      const result = formatter.format(json);

      // Should use fallback since validation fails
      expect(warnSpy).toHaveBeenCalled();
      expect(result).toContain(`${EMOJI.HEADER} <b>${DEFAULT_HEADER}</b>`);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle empty string input', () => {
      const result = formatter.format('');
      expect(result).toContain(EMOJI.HEADER);
      expect(result).toContain('No significant topics to summarize.');
    });

    it('should handle whitespace-only input', () => {
      const result = formatter.format('   \n\t\n   ');
      expect(result).toContain(EMOJI.HEADER);
      expect(result).toContain('No significant topics to summarize.');
    });

    it('should handle null-like input gracefully', () => {
      const result = formatter.format(null as unknown as string);
      expect(result).toContain(EMOJI.HEADER);
      expect(result).toContain('No significant topics to summarize.');
    });

    it('should handle undefined input gracefully', () => {
      const result = formatter.format(undefined as unknown as string);
      expect(result).toContain(EMOJI.HEADER);
      expect(result).toContain('No significant topics to summarize.');
    });

    it('should handle empty topics array', () => {
      const json = JSON.stringify({
        overview: 'Nothing happened.',
        topics: [],
        questions: [],
      });

      const result = formatter.format(json);
      expect(result).toContain('Nothing happened.');
      expect(result).not.toContain(OPEN_QUESTIONS_HEADER);
    });

    it('should handle empty points array in a topic', () => {
      const json = JSON.stringify({
        overview: 'o',
        topics: [{ title: 'Empty', points: [] }],
        questions: [],
      });

      const result = formatter.format(json);
      expect(result).toContain('<b>Empty</b>');
      expect(result).not.toContain(EMOJI.BULLET);
    });

    it('should handle unicode characters', () => {
      const json = JSON.stringify({
        overview: 'Обговорення проекту. 项目讨论。',
        topics: [{ title: 'Проект', points: ['@іван запропонував дедлайн'] }],
        questions: ['Коли фінальний реліз?'],
      });

      const result = formatter.format(json);
      expect(result).toContain('Обговорення проекту');
      expect(result).toContain('项目讨论');
      expect(result).toContain('@іван запропонував дедлайн');
      expect(result).toContain('Коли фінальний реліз?');
    });

    it('should handle multiple topics', () => {
      const json = JSON.stringify({
        overview: 'Busy day.',
        topics: [
          { title: 'Topic A', points: ['p1'] },
          { title: 'Topic B', points: ['p2'] },
          { title: 'Topic C', points: ['p3'] },
        ],
        questions: [],
      });

      const result = formatter.format(json);
      expect(result).toContain('<b>Topic A</b>');
      expect(result).toContain('<b>Topic B</b>');
      expect(result).toContain('<b>Topic C</b>');
    });
  });

  // -------------------------------------------------------------------------
  // Output structure
  // -------------------------------------------------------------------------

  describe('output structure', () => {
    it('should have header, overview, topics, questions in correct order', () => {
      const json = JSON.stringify({
        overview: 'Overview text here',
        topics: [{ title: 'TopicTitle', points: ['PointContent'] }],
        questions: ['QuestionContent?'],
      });

      const result = formatter.format(json);

      const headerIdx = result.indexOf(EMOJI.HEADER);
      const overviewIdx = result.indexOf('Overview text here');
      const topicIdx = result.indexOf('TopicTitle');
      const pointIdx = result.indexOf('PointContent');
      const questionHeaderIdx = result.indexOf(OPEN_QUESTIONS_HEADER);
      const questionIdx = result.indexOf('QuestionContent?');

      expect(headerIdx).toBeLessThan(overviewIdx);
      expect(overviewIdx).toBeLessThan(topicIdx);
      expect(topicIdx).toBeLessThan(pointIdx);
      expect(pointIdx).toBeLessThan(questionHeaderIdx);
      expect(questionHeaderIdx).toBeLessThan(questionIdx);
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
    const json = JSON.stringify({
      overview: 'Test',
      topics: [{ title: 'T', points: ['p'] }],
      questions: [],
    });
    const result = formatter.format(json);
    expect(result).toContain(EMOJI.HEADER);
    expect(result).toContain('Test');
  });
});

describe('EMOJI constants', () => {
  it('should have correct emoji values', () => {
    expect(EMOJI.HEADER).toBe('🧵');
    expect(EMOJI.BULLET).toBe('•');
    expect(EMOJI.QUESTION).toBe('❓');
  });
});
