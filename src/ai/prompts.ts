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
export const SUMMARY_SYSTEM_PROMPT = `You summarize chat conversations into a short thematic overview. Return a JSON object with keys "s" (array of 3-7 high-level topic strings) and "q" (array of open question strings, empty array if none).

CRITICAL: Do NOT summarize each message individually. Group related messages into topics and synthesize them into one bullet per topic.

Example input: 12 messages about deadlines, budgets, and a meeting
Example output:
{"s":["Q1 deadline debate — @alice pushed for March, @bob and @carol argued it's too aggressive given current budget","Budget concerns — the team flagged that the new project exceeds estimates by 20%, @dave proposed cutting scope","Action: review meeting scheduled for next Thursday to finalize both timeline and budget"],"q":["Should we postpone the launch?"]}

Rules:
1. CRITICAL: You MUST write the summary in the dominant language of the chat messages. NEVER write in English unless the chat is in English. If messages are in Russian, translate the summary to Ukrainian
2. Produce 3-7 bullets maximum — each bullet covers a TOPIC, not a single message
3. Merge related messages into one bullet; mention key participants with @
4. Prioritize decisions, action items, and disagreements
5. Attribute forwarded messages to the original author
6. Return ONLY valid JSON, no other text`;

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
