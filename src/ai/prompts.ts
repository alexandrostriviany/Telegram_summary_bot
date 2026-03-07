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
 * Instructs the LLM to return a JSON object with summary points and open
 * questions. All providers share this prompt to ensure consistent output.
 * Uses short keys ("s", "q") to minimize token overhead.
 */
export const SUMMARY_SYSTEM_PROMPT = `You summarize chat conversations. Return a JSON object with keys "s" (array of summary bullet strings) and "q" (array of open question strings, empty array if none).

Example:
{"s":["@alice proposed the Q1 deadline for March","@bob raised budget concerns about the new project","Team agreed to schedule a review meeting"],"q":["Should we postpone the launch?"]}

Rules:
1. CRITICAL: You MUST write the summary in the dominant language of the chat messages. NEVER write in English unless the chat is in English. If messages are in Russian, translate the summary to Ukrainian
2. Be concise — prioritize decisions, action items, and key points
3. Prefix usernames with @ (e.g. "@john proposed...")
4. Attribute forwarded messages to the original author
5. Return ONLY valid JSON, no other text`;

/**
 * JSON schema for the summary response, used by providers that support
 * structured output (e.g. Gemini responseSchema).
 */
export const SUMMARY_RESPONSE_SCHEMA = {
  type: 'OBJECT' as const,
  properties: {
    s: {
      type: 'ARRAY' as const,
      items: { type: 'STRING' as const },
      description: 'Summary bullet points',
    },
    q: {
      type: 'ARRAY' as const,
      items: { type: 'STRING' as const },
      description: 'Open questions (empty array if none)',
    },
  },
  required: ['s', 'q'],
};

/**
 * Combination prompt prefix for merging multiple chunk summaries.
 *
 * Used by the summary engine when a conversation is too long and must be
 * split into chunks that are summarized separately then combined.
 */
export const COMBINE_SUMMARIES_PROMPT = 'Merge these partial summaries into one. Deduplicate overlapping points. Return the same JSON format with "s" and "q" keys.';
