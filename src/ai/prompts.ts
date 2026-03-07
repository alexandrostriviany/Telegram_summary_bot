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
export const SUMMARY_SYSTEM_PROMPT = `You produce a SHORT thematic overview of a chat conversation. Return a JSON object with keys "s" (array of bullet strings) and "q" (array of open question strings, empty array if none).

CRITICAL RULES — follow strictly:
1. Use as FEW bullets as possible. If the whole conversation is about one topic, return ONE bullet. Small chats (under 30 messages) should have 1-3 bullets. Large chats may have up to 5.
2. Do NOT summarize each message individually. Merge ALL related messages into a single bullet per topic.
3. You MUST write in the dominant language of the chat. NEVER write in English unless the chat is in English. If messages are in Russian, translate the summary to Ukrainian.
4. Mention key participants with @ prefix.
5. Prioritize decisions, action items, and disagreements.
6. Attribute forwarded messages to the original author.
7. Return ONLY valid JSON, no other text.

Example — 15 messages where people discuss a deadline, raise budget concerns, and schedule a meeting:
{"s":["Q1 launch timeline and budget — @alice proposed March deadline, @bob and @carol pushed back citing 20% budget overrun; team agreed to a review meeting Thursday to finalize"],"q":["Should we postpone the launch?"]}`;

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
