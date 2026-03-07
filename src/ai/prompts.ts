/**
 * Shared AI Prompts
 *
 * Centralized system prompts for AI providers. Extracted from individual
 * provider modules to ensure consistency across OpenAI, Bedrock, and Gemini.
 *
 * @module ai/prompts
 */

/**
 * System prompt for chat summarization.
 *
 * Instructs the LLM to return a JSON object with topics (each having a name
 * and highlights) and open questions. All providers share this prompt to
 * ensure consistent output.
 */
export const SUMMARY_SYSTEM_PROMPT = `You produce a structured thematic overview of a chat conversation. Return a JSON object with keys "t" (array of topic objects) and "q" (array of open question strings, empty array if none).

Each topic object has:
- "n": short topic name (2-5 words)
- "h": array of highlight strings (key points, decisions, actions for this topic)

RULES:
1. Each distinct topic gets its OWN object. Do NOT merge unrelated topics into one.
2. Keep 1-5 topics depending on conversation size. Each topic should have 1-4 highlights.
3. You MUST write in the dominant language of the chat. NEVER write in English unless the chat is in English. If messages are in Russian, translate to Ukrainian.
4. Mention key participants with @ prefix in highlights.
5. Prioritize decisions, action items, and disagreements.
6. Attribute forwarded messages to the original author.
7. Return ONLY valid JSON, no other text.

Example — a chat about cooking, a trip, and weekend plans:
{"t":[{"n":"Готування сирників","h":["@alice показала як Тіма готує сирники","@bob попередив про безпеку, але @alice вважає це корисним досвідом"]},{"n":"Поїздка в планетарій","h":["@carol повезла дитину в планетарій вперше","їхали 45 хвилин на велосипеді"]}],"q":["Чи підійде цей планетарій для малечі?"]}`;

/**
 * JSON schema for the summary response, used by providers that support
 * structured output (e.g. Gemini responseSchema).
 */
export const SUMMARY_RESPONSE_SCHEMA = {
  type: 'OBJECT' as const,
  properties: {
    t: {
      type: 'ARRAY' as const,
      items: {
        type: 'OBJECT' as const,
        properties: {
          n: {
            type: 'STRING' as const,
            description: 'Short topic name (2-5 words)',
          },
          h: {
            type: 'ARRAY' as const,
            items: { type: 'STRING' as const },
            description: 'Highlight bullet points for this topic',
          },
        },
        required: ['n', 'h'],
      },
      description: 'Array of topic objects with name and highlights',
    },
    q: {
      type: 'ARRAY' as const,
      items: { type: 'STRING' as const },
      description: 'Open questions (empty array if none)',
    },
  },
  required: ['t', 'q'],
};

/**
 * Combination prompt prefix for merging multiple chunk summaries.
 *
 * Used by the summary engine when a conversation is too long and must be
 * split into chunks that are summarized separately then combined.
 */
export const COMBINE_SUMMARIES_PROMPT = 'Merge these partial summaries into one. Deduplicate overlapping topics and combine their highlights. Return the same JSON format with "t" and "q" keys.';
