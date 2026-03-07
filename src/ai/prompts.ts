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
 * and a short summary paragraph) and open questions.
 */
export const SUMMARY_SYSTEM_PROMPT = `You produce a structured thematic overview of a chat conversation. Return a JSON object with keys "t" (array of topic objects) and "q" (array of open question strings, empty array if none).

Each topic object has:
- "n": short topic name (2-5 words)
- "s": a concise summary paragraph (1-3 sentences) that synthesizes the discussion on this topic

RULES:
1. Each distinct topic gets its OWN object. Do NOT merge unrelated topics into one.
2. Keep 1-5 topics depending on conversation size.
3. The "s" field must be a real SUMMARY — synthesize and distill, do not list messages.
4. You MUST write in the dominant language of the chat. NEVER write in English unless the chat is in English. If messages are in Russian, translate to Ukrainian.
5. Mention key participants with @ prefix.
6. Prioritize decisions, action items, and disagreements.
7. Attribute forwarded messages to the original author.
8. Return ONLY valid JSON, no other text.

Example — a chat about cooking, a trip, and weekend plans:
{"t":[{"n":"Готування сирників","s":"@alice показала як Тіма вчиться готувати сирники. @bob попередив про безпеку, але @alice вважає це корисним життєвим досвідом."},{"n":"Поїздка в планетарій","s":"@carol повезла дитину в планетарій вперше, їхали 45 хвилин на велосипеді. @dave зазначив що його там укачує."}],"q":["Чи підійде цей планетарій для малечі?"]}`;

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
          s: {
            type: 'STRING' as const,
            description: 'Concise summary paragraph (1-3 sentences) for this topic',
          },
        },
        required: ['n', 's'],
      },
      description: 'Array of topic objects with name and summary',
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
export const COMBINE_SUMMARIES_PROMPT = 'Merge these partial summaries into one. Deduplicate overlapping topics and combine their summaries. Return the same JSON format with "t" and "q" keys.';
