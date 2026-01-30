# API Reference

This document provides detailed API documentation for the Telegram AI Summary Bot, including interfaces, types, and usage examples.

---

## Table of Contents

- [Core Types](#core-types)
- [Message Store](#message-store)
- [AI Provider](#ai-provider)
- [Command System](#command-system)
- [Summary Engine](#summary-engine)
- [Telegram Client](#telegram-client)
- [Error Handling](#error-handling)

---

## Core Types

### TelegramUpdate

Represents an incoming update from Telegram's webhook.

```typescript
interface TelegramUpdate {
  /** Unique identifier for this update */
  update_id: number;
  /** New incoming message (text, photo, sticker, etc.) */
  message?: Message;
}
```

### Message

Represents a Telegram message.

```typescript
interface Message {
  /** Unique message identifier within the chat */
  message_id: number;
  /** Chat the message belongs to */
  chat: Chat;
  /** Sender of the message */
  from?: User;
  /** Date sent in Unix time (seconds) */
  date: number;
  /** Text content (for text messages) */
  text?: string;
  /** Caption for media messages (photo, video, etc.) */
  caption?: string;
  /** Photo sizes array (when message contains a photo) */
  photo?: PhotoSize[];
  /** New members added to the group */
  new_chat_members?: User[];
  /** Original message being replied to */
  reply_to_message?: Message;
  /** Forum topic ID (supergroups with topics) */
  message_thread_id?: number;
}
```

### PhotoSize

Represents a photo size in Telegram.

```typescript
interface PhotoSize {
  /** Identifier for this file */
  file_id: string;
  /** Unique identifier for this file */
  file_unique_id: string;
  /** Photo width */
  width: number;
  /** Photo height */
  height: number;
  /** File size in bytes (optional) */
  file_size?: number;
}
```

### Chat

Represents a Telegram chat.

```typescript
interface Chat {
  /** Unique identifier for the chat */
  id: number;
  /** Type: 'group', 'supergroup', or 'private' */
  type: 'group' | 'supergroup' | 'private';
  /** Title (for groups and supergroups) */
  title?: string;
}
```

### User

Represents a Telegram user.

```typescript
interface User {
  /** Unique identifier for the user */
  id: number;
  /** Username (optional) */
  username?: string;
  /** First name */
  first_name: string;
}
```

### StoredMessage

Represents a message stored in DynamoDB.

```typescript
interface StoredMessage {
  /** Telegram chat ID (partition key) */
  chatId: number;
  /** Message timestamp in milliseconds (sort key) */
  timestamp: number;
  /** Telegram message ID */
  messageId: number;
  /** Sender's Telegram user ID */
  userId: number;
  /** Sender's username or first name */
  username: string;
  /** Message text content */
  text: string;
  /** TTL timestamp in epoch seconds (72h from creation) */
  expireAt: number;
  /** ID of message being replied to (optional) */
  replyToMessageId?: number;
  /** Forum topic ID (optional) */
  threadId?: number;
  /** Original author name for forwarded messages (optional) */
  forwardFromName?: string;
}
```

### MessageQuery

Query parameters for retrieving messages.

```typescript
interface MessageQuery {
  /** Telegram chat ID to query */
  chatId: number;
  /** Start of time range in milliseconds */
  startTime?: number;
  /** End of time range in milliseconds */
  endTime?: number;
  /** Maximum number of messages to return */
  limit?: number;
}
```

### MessageRange

Defines the range of messages for a summary.

```typescript
interface MessageRange {
  /** 'time' for hours, 'count' for message count */
  type: 'time' | 'count';
  /** Hours (for time) or count (for count) */
  value: number;
}
```

**Examples:**

```typescript
// Time-based: summarize last 2 hours
const timeRange: MessageRange = { type: 'time', value: 2 };

// Count-based: summarize last 50 messages
const countRange: MessageRange = { type: 'count', value: 50 };
```

---

## Message Store

### Interface

```typescript
interface MessageStore {
  /**
   * Store a message in DynamoDB
   * @param message - The message to store
   */
  store(message: StoredMessage): Promise<void>;

  /**
   * Query messages based on filters
   * @param query - Query parameters
   * @returns Array of stored messages
   */
  query(query: MessageQuery): Promise<StoredMessage[]>;

  /**
   * Delete all messages for a chat
   * @param chatId - The chat ID
   */
  deleteAll(chatId: number): Promise<void>;
}
```

### DynamoDBMessageStore

Implementation using AWS DynamoDB.

```typescript
class DynamoDBMessageStore implements MessageStore {
  constructor(
    client?: DynamoDBClient,
    tableName?: string,
    ttlHours?: number
  );
}
```

**Constructor Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `client` | `DynamoDBClient` | Auto-created | DynamoDB client instance |
| `tableName` | `string` | `DYNAMODB_TABLE` env | Table name |
| `ttlHours` | `number` | `72` | TTL in hours |

### Usage Examples

```typescript
import { DynamoDBMessageStore } from './store/message-store';

// Create store with defaults
const store = new DynamoDBMessageStore();

// Store a message
await store.store({
  chatId: -1001234567890,
  timestamp: Date.now(),
  messageId: 12345,
  userId: 987654321,
  username: 'john_doe',
  text: 'Hello, world!',
  expireAt: 0, // Auto-calculated
});

// Query by time range
const messages = await store.query({
  chatId: -1001234567890,
  startTime: Date.now() - (2 * 60 * 60 * 1000), // 2 hours ago
  endTime: Date.now(),
});

// Query by count
const recentMessages = await store.query({
  chatId: -1001234567890,
  limit: 50,
});

// Delete all messages for a chat
await store.deleteAll(-1001234567890);
```

---

## AI Provider

### Interface

```typescript
interface AIProvider {
  /**
   * Generate a summary of messages
   * @param messages - Array of message strings
   * @param options - Summarization options
   * @returns Generated summary text
   */
  summarize(messages: string[], options?: SummarizeOptions): Promise<string>;

  /**
   * Get maximum context tokens supported
   * @returns Maximum token count
   */
  getMaxContextTokens(): number;
}
```

### SummarizeOptions

```typescript
interface SummarizeOptions {
  /** Maximum tokens to generate (default varies by provider) */
  maxTokens?: number;
  /** Temperature 0.0-1.0 (default: 0.3) */
  temperature?: number;
}
```

### OpenAIProvider

Implementation using OpenAI GPT-3.5-turbo.

```typescript
class OpenAIProvider implements AIProvider {
  constructor(
    apiKey?: string,
    apiUrl?: string,
    model?: string
  );
  
  static estimateTokens(text: string): number;
}
```

**Constructor Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `apiKey` | `string` | `OPENAI_API_KEY` env | OpenAI API key |
| `apiUrl` | `string` | OpenAI endpoint | API URL |
| `model` | `string` | `gpt-3.5-turbo` | Model ID |

### BedrockProvider

Implementation using AWS Bedrock Claude 3 Haiku.

```typescript
class BedrockProvider implements AIProvider {
  constructor(
    region?: string,
    modelId?: string,
    client?: BedrockRuntimeClient
  );
  
  static estimateTokens(text: string): number;
}
```

**Constructor Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `region` | `string` | `AWS_REGION` env | AWS region |
| `modelId` | `string` | `anthropic.claude-3-haiku-20240307-v1:0` | Model ID |
| `client` | `BedrockRuntimeClient` | Auto-created | Bedrock client |

### Factory Function

```typescript
function createAIProvider(providerType?: AIProviderType): AIProvider;

type AIProviderType = 'openai' | 'bedrock';
```

### Usage Examples

```typescript
import { createAIProvider, OpenAIProvider, BedrockProvider } from './ai/ai-provider';

// Create from environment variable (LLM_PROVIDER)
const provider = createAIProvider();

// Create specific provider
const openai = createAIProvider('openai');
const bedrock = createAIProvider('bedrock');

// Direct instantiation
const customOpenAI = new OpenAIProvider('sk-...', undefined, 'gpt-4');

// Generate summary
const summary = await provider.summarize([
  '[10:00] Alice: Has anyone reviewed the PR?',
  '[10:05] Bob: I\'ll take a look now',
  '[10:15] Bob: LGTM, approved!',
], {
  maxTokens: 500,
  temperature: 0.3,
});

// Check token limits
const maxTokens = provider.getMaxContextTokens();
const estimatedTokens = OpenAIProvider.estimateTokens(text);
```

---

## Command System

### CommandHandler Interface

```typescript
interface CommandHandler {
  /**
   * Execute the command
   * @param message - Original Telegram message
   * @param args - Parsed arguments
   */
  execute(message: Message, args: string[]): Promise<void>;
}
```

### CommandRouter

Routes commands to appropriate handlers.

```typescript
class CommandRouter {
  constructor(sendMessage: (chatId: number, text: string) => Promise<void>);
  
  /** Register a command handler */
  register(command: string, handler: CommandHandler): void;
  
  /** Check if handler exists */
  hasHandler(command: string): boolean;
  
  /** Get registered commands */
  getRegisteredCommands(): string[];
  
  /** Route a message to handler */
  route(message: Message): Promise<void>;
}
```

### ParsedCommand

```typescript
interface ParsedCommand {
  /** Full command (e.g., '/summary') */
  command: string;
  /** Command name without slash (e.g., 'summary') */
  commandName: string;
  /** Array of arguments */
  args: string[];
  /** Raw text after command */
  rawArgs: string;
}
```

### Helper Functions

```typescript
/** Parse command from message text */
function parseCommand(text: string): ParsedCommand | null;

/** Create a CommandRouter */
function createCommandRouter(
  sendMessage: (chatId: number, text: string) => Promise<void>
): CommandRouter;
```

### Usage Examples

```typescript
import { createCommandRouter, parseCommand } from './commands/command-router';
import { createHelpHandler } from './commands/help-handler';
import { createSummaryHandler } from './commands/summary-handler';

// Create router
const router = createCommandRouter(
  (chatId, text) => telegramClient.sendMessage(chatId, text)
);

// Register handlers
router.register('help', createHelpHandler(sendMessage));
router.register('summary', createSummaryHandler(sendMessage, generateSummary));

// Route a message
await router.route(message);

// Parse command manually
const parsed = parseCommand('/summary 2h');
// { command: '/summary', commandName: 'summary', args: ['2h'], rawArgs: '2h' }
```

### HelpHandler

```typescript
class HelpHandler implements CommandHandler {
  constructor(sendMessage: (chatId: number, text: string) => Promise<void>);
}

function createHelpHandler(
  sendMessage: (chatId: number, text: string) => Promise<void>
): HelpHandler;

const HELP_MESSAGE: string;
const DATA_RETENTION_HOURS: number; // 72
```

### SummaryHandler

```typescript
class SummaryHandler implements CommandHandler {
  constructor(
    sendMessage: (chatId: number, text: string) => Promise<void>,
    generateSummary: (chatId: number, range: MessageRange) => Promise<string>
  );
}

function createSummaryHandler(
  sendMessage: (chatId: number, text: string) => Promise<void>,
  generateSummary: (chatId: number, range: MessageRange) => Promise<string>
): SummaryHandler;

/** Parse time parameter (e.g., "1h", "30m") */
function parseTimeParameter(arg: string): number | null;

/** Parse count parameter (e.g., "50") */
function parseCountParameter(arg: string): number | null;

/** Parse any summary parameter */
function parseSummaryParameter(arg?: string): MessageRange | null;

const DEFAULT_SUMMARY_HOURS: number; // 24
```

---

## Summary Engine

### Interface

```typescript
interface SummaryEngine {
  /**
   * Generate a summary for a chat
   * @param chatId - Telegram chat ID
   * @param range - Message range
   * @returns Generated summary
   */
  generateSummary(chatId: number, range: MessageRange): Promise<string>;
}
```

### DefaultSummaryEngine

```typescript
class DefaultSummaryEngine implements SummaryEngine {
  constructor(messageStore: MessageStore, aiProvider: AIProvider);
  
  /** Fetch messages based on range */
  fetchMessages(chatId: number, range: MessageRange): Promise<StoredMessage[]>;
  
  /** Format messages for AI prompt */
  formatMessagesForAI(messages: StoredMessage[]): string[];
  
  /** Estimate token count */
  estimateTokenCount(messages: string[]): number;
  
  /** Split messages into chunks */
  splitIntoChunks(messages: string[]): string[][];
  
  /** Summarize chunks separately */
  summarizeChunks(chunks: string[][]): Promise<string[]>;
  
  /** Combine chunk summaries */
  combineChunkSummaries(chunkSummaries: string[]): Promise<string>;
  
  /** Hierarchical summarization for long conversations */
  hierarchicalSummarize(messages: string[]): Promise<string>;
}
```

### Factory Function

```typescript
function createSummaryEngine(
  messageStore: MessageStore,
  aiProvider: AIProvider
): SummaryEngine;
```

### Usage Examples

```typescript
import { createSummaryEngine } from './summary/summary-engine';
import { createMessageStore } from './store/message-store';
import { createAIProvider } from './ai/ai-provider';

const messageStore = createMessageStore();
const aiProvider = createAIProvider();
const engine = createSummaryEngine(messageStore, aiProvider);

// Generate summary for last 2 hours
const summary = await engine.generateSummary(
  -1001234567890,
  { type: 'time', value: 2 }
);

// Generate summary for last 50 messages
const summary2 = await engine.generateSummary(
  -1001234567890,
  { type: 'count', value: 50 }
);
```

### SummaryFormatter

```typescript
interface SummaryFormatter {
  /**
   * Format raw AI output for Telegram
   * @param rawSummary - Raw summary from AI
   * @returns Formatted summary with emojis
   */
  format(rawSummary: string): string;
}

class DefaultSummaryFormatter implements SummaryFormatter;

function createSummaryFormatter(): SummaryFormatter;

const EMOJI: {
  HEADER: '🧵';
  BULLET: '•';
  QUESTION: '❓';
};
```

---

## Telegram Client

### Interface

```typescript
interface TelegramClient {
  /**
   * Send a message to a chat
   * @param chatId - Chat ID
   * @param text - Message text (supports Markdown)
   */
  sendMessage(chatId: number, text: string): Promise<void>;
}
```

### TelegramBotClient

```typescript
interface TelegramClientConfig {
  /** Bot API token */
  botToken: string;
  /** Retry attempts (default: 2) */
  maxRetries?: number;
  /** Base delay in ms (default: 500) */
  baseDelayMs?: number;
  /** API base URL */
  apiBaseUrl?: string;
}

class TelegramBotClient implements TelegramClient {
  constructor(config: TelegramClientConfig);
}
```

### Factory Function

```typescript
function createTelegramClient(botToken?: string): TelegramClient;
```

### TelegramApiError

```typescript
class TelegramApiError extends Error {
  constructor(
    message: string,
    statusCode: number,
    errorDescription?: string
  );
  
  readonly statusCode: number;
  readonly errorDescription?: string;
}
```

### Usage Examples

```typescript
import { createTelegramClient, TelegramBotClient } from './telegram/telegram-client';

// Create from environment variable
const client = createTelegramClient();

// Create with explicit token
const client2 = createTelegramClient('123456:ABC-DEF...');

// Create with custom config
const client3 = new TelegramBotClient({
  botToken: '123456:ABC-DEF...',
  maxRetries: 3,
  baseDelayMs: 1000,
});

// Send message
await client.sendMessage(-1001234567890, '🧵 *Summary*\n• Topic 1\n• Topic 2');
```

---

## Error Handling

### Error Classes

```typescript
/** Base class for bot errors */
abstract class BotError extends Error {
  readonly errorCode: ErrorCode;
  readonly cause?: Error;
}

/** No messages found for summarization */
class NoMessagesError extends BotError;

/** AI provider operation failed */
class AIProviderError extends BotError {
  readonly provider?: string;
}

/** AI provider timed out */
class AIProviderTimeoutError extends BotError {
  readonly provider?: string;
}

/** DynamoDB operation failed */
class DynamoDBError extends BotError {
  readonly operation?: string;
}

/** Invalid command syntax */
class InvalidCommandError extends BotError {
  readonly command?: string;
}

/** Telegram API call failed */
class TelegramAPIError extends BotError {
  readonly method?: string;
}

/** Configuration invalid or missing */
class ConfigurationError extends BotError {
  readonly configKey?: string;
}
```

### ErrorCode Enum

```typescript
enum ErrorCode {
  NO_MESSAGES = 'NO_MESSAGES',
  AI_PROVIDER_ERROR = 'AI_PROVIDER_ERROR',
  AI_PROVIDER_TIMEOUT = 'AI_PROVIDER_TIMEOUT',
  DYNAMODB_ERROR = 'DYNAMODB_ERROR',
  INVALID_COMMAND = 'INVALID_COMMAND',
  TELEGRAM_API_ERROR = 'TELEGRAM_API_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
```

### ErrorResponse

```typescript
interface ErrorResponse {
  success: false;
  /** User-friendly message (safe to display) */
  userMessage: string;
  /** Internal error code */
  errorCode: string;
  /** Original error (not sent to user) */
  originalError?: Error;
}
```

### Helper Functions

```typescript
/** Handle error and return standardized response */
function handleError(error: Error): ErrorResponse;

/** Format error for Telegram message */
function formatErrorForTelegram(response: ErrorResponse): string;

/** Get error code for an error */
function getErrorCode(error: Error): ErrorCode;

/** Get user-friendly message for error code */
function getUserFriendlyMessage(errorCode: ErrorCode): string;

/** Check if string contains sensitive data */
function containsSensitiveData(text: string): boolean;

/** Remove sensitive data from string */
function sanitizeMessage(text: string): string;

/** Check if error is a BotError */
function isBotError(error: unknown): error is BotError;

/** Check if error indicates no messages */
function isNoMessagesError(error: unknown): boolean;

/** Check if error is retryable */
function isRetryableError(error: Error): boolean;
```

### Usage Examples

```typescript
import {
  handleError,
  formatErrorForTelegram,
  NoMessagesError,
  AIProviderError,
} from './errors/error-handler';

try {
  const summary = await engine.generateSummary(chatId, range);
  await sendMessage(chatId, summary);
} catch (error) {
  const errorResponse = handleError(error);
  const userMessage = formatErrorForTelegram(errorResponse);
  await sendMessage(chatId, userMessage);
  // User sees: "❌ No recent messages to summarize. Try a longer time range."
}

// Throw specific errors
throw new NoMessagesError('No messages in the last 2 hours');
throw new AIProviderError('API rate limited', 'openai');
```

---

## Lambda Handler

### Main Handler

```typescript
/**
 * Lambda handler for Telegram webhook
 * @param event - API Gateway HTTP API event
 * @returns API Gateway response
 */
export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2>;
```

### Internal Functions

```typescript
/** Handle bot added to group */
export async function handleBotAdded(
  message: Message,
  telegramClient: TelegramClient
): Promise<void>;

/** Handle bot command */
export async function handleCommand(
  message: Message,
  commandRouter: CommandRouter
): Promise<void>;

/** Store text message */
export async function storeMessage(
  message: Message,
  messageStore: MessageStore
): Promise<void>;

/** Check if message has text or caption */
export function isTextMessage(message: Message): boolean;

/** Get text content from message (text or caption with photo prefix) */
export function getMessageText(message: Message): string;

/** Check if bot was added */
export function isBotAddedEvent(message: Message): boolean;

/** Check if message is command */
export function isCommand(message: Message): boolean;

/** Process webhook update */
export async function handleWebhook(
  update: TelegramUpdate,
  messageStore: MessageStore,
  commandRouter: CommandRouter,
  telegramClient: TelegramClient
): Promise<void>;

/** Reset cached instances (testing) */
export function resetCachedInstances(): void;
```

### Usage Example

```typescript
// The handler is invoked by API Gateway
// Example event:
{
  "body": "{\"update_id\":123,\"message\":{\"message_id\":456,\"chat\":{\"id\":-1001234567890,\"type\":\"supergroup\"},\"from\":{\"id\":987654321,\"first_name\":\"John\"},\"date\":1699999999,\"text\":\"/summary 2h\"}}"
}

// Response:
{
  "statusCode": 200,
  "body": "{\"ok\":true}"
}
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | - | Bot API token |
| `LLM_PROVIDER` | Yes | - | `openai` or `bedrock` |
| `OPENAI_API_KEY` | If OpenAI | - | OpenAI API key |
| `DYNAMODB_TABLE` | No | `telegram-summary-messages` | Table name |
| `DYNAMODB_ENDPOINT` | No | - | Local DynamoDB endpoint |
| `MESSAGE_TTL_HOURS` | No | `72` | Message retention |
| `DEFAULT_SUMMARY_HOURS` | No | `24` | Default summary window |
| `AWS_REGION` | No | `us-east-1` | AWS region |
