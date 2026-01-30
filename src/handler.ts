/**
 * Main Lambda handler for Telegram Summary Bot
 * 
 * This is the entry point for all incoming Telegram webhook requests.
 * The handler processes updates and routes them to appropriate handlers.
 * 
 * @module handler
 */

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { TelegramUpdate, Message, StoredMessage, User } from './types';
import { DynamoDBMessageStore, MessageStore } from './store/message-store';
import { CommandRouter, createCommandRouter } from './commands/command-router';
import { createHelpHandler } from './commands/help-handler';
import { createSummaryHandler } from './commands/summary-handler';
import { TelegramClient, createTelegramClient } from './telegram/telegram-client';
import { createSummaryEngine } from './summary/summary-engine';
import { createSummaryFormatter } from './summary/summary-formatter';
import { createAIProvider, isAIProviderConfigured } from './ai/ai-provider';
import { handleError, formatErrorForTelegram } from './errors/error-handler';

// ============================================================================
// Lambda Cold Start Optimization
// Dependencies are initialized once outside the handler for reuse across invocations
// ============================================================================

/** Cached Telegram client instance */
let cachedTelegramClient: TelegramClient | null = null;

/** Cached message store instance */
let cachedMessageStore: MessageStore | null = null;

/**
 * Reset cached instances (for testing purposes)
 * @internal
 */
export function resetCachedInstances(): void {
  cachedTelegramClient = null;
  cachedMessageStore = null;
}

/**
 * Get or create the Telegram client (singleton pattern for Lambda reuse)
 */
function getTelegramClient(): TelegramClient {
  if (!cachedTelegramClient) {
    cachedTelegramClient = createTelegramClient();
  }
  return cachedTelegramClient;
}

/**
 * Get or create the message store (singleton pattern for Lambda reuse)
 */
function getMessageStore(): MessageStore {
  if (!cachedMessageStore) {
    cachedMessageStore = new DynamoDBMessageStore();
  }
  return cachedMessageStore;
}

/**
 * Welcome message sent when the bot is added to a group
 * 
 * **Validates: Requirements 1.1, 1.2**
 */
const WELCOME_MESSAGE = `🤖 *Hello! I'm the Summary Bot*

I help you catch up on missed discussions by generating AI-powered summaries of your group chat.

*Available Commands:*
• \`/summary\` - Summarize the last 24 hours
• \`/summary 2h\` - Summarize the last 2 hours
• \`/summary 50\` - Summarize the last 50 messages
• \`/help\` - Show help and privacy info

*Privacy & Data Usage:*
📝 I only store text messages temporarily (72 hours)
🔒 Messages are automatically deleted after expiration
🚫 I ignore stickers, media, and system messages
🔐 Your data is stored securely and never shared

_Note: For me to work properly, please ensure Privacy Mode is disabled in BotFather settings._`;

/**
 * Get the bot token from environment variables
 */
function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
  }
  return token;
}

/**
 * Get the bot's user ID from the bot token
 * The bot ID is the first part of the token before the colon
 */
function getBotId(): number {
  const token = getBotToken();
  const botIdStr = token.split(':')[0];
  return parseInt(botIdStr, 10);
}

/**
 * Check if the bot was added to the group in this update
 * 
 * @param newMembers - Array of new chat members
 * @returns true if the bot is among the new members
 */
function isBotAddedToGroup(newMembers: User[]): boolean {
  try {
    const botId = getBotId();
    return newMembers.some(member => member.id === botId);
  } catch {
    // If we can't get the bot ID, assume any new_chat_members event with the bot
    // is a bot-added event (fallback behavior)
    return true;
  }
}

/**
 * Handle the bot being added to a group
 * Sends a welcome message with usage instructions and privacy information
 * 
 * @param message - The message containing the new_chat_members event
 * @param telegramClient - The Telegram client for sending messages
 * 
 * **Validates: Requirements 1.1** - Send introductory message when added to group
 * **Validates: Requirements 1.2** - Include data usage and privacy information
 */
export async function handleBotAdded(
  message: Message,
  telegramClient: TelegramClient
): Promise<void> {
  console.log('Bot added to group:', message.chat.id, message.chat.title);
  await telegramClient.sendMessage(message.chat.id, WELCOME_MESSAGE);
}

/**
 * Handle a bot command (messages starting with /)
 * Routes to appropriate command handlers using the CommandRouter
 * 
 * @param message - The message containing the command
 * @param commandRouter - The command router instance
 * 
 * **Validates: Requirements 3.1, 4.1** - Handle /summary and /help commands
 */
export async function handleCommand(
  message: Message,
  commandRouter: CommandRouter
): Promise<void> {
  console.log('Received command:', message.text, 'in chat:', message.chat.id);
  
  // Route the command to the appropriate handler
  await commandRouter.route(message);
}

/**
 * Store a text message in DynamoDB
 * 
 * @param message - The Telegram message to store
 * @param messageStore - The message store instance
 * 
 * **Validates: Requirements 2.1** - Store message with required fields
 */
export async function storeMessage(
  message: Message,
  messageStore: MessageStore
): Promise<void> {
  // Use message.date (Unix seconds) converted to milliseconds, plus message_id
  // to ensure uniqueness when multiple messages arrive in the same second.
  // message_id is unique within a chat, so adding it as microseconds ensures
  // no collisions while maintaining chronological order.
  const baseTimestamp = message.date * 1000;
  const uniqueTimestamp = baseTimestamp + (message.message_id % 1000);
  
  // Extract forward_from name for attribution in summaries
  let forwardFromName: string | undefined;
  if (message.forward_from) {
    forwardFromName = message.forward_from.username ?? message.forward_from.first_name;
  } else if (message.forward_sender_name) {
    forwardFromName = message.forward_sender_name;
  } else if (message.forward_from_chat) {
    forwardFromName = message.forward_from_chat.title ?? 'Channel';
  }
  
  const storedMessage: StoredMessage = {
    chatId: message.chat.id,
    timestamp: uniqueTimestamp,
    messageId: message.message_id,
    userId: message.from?.id ?? 0,
    username: message.from?.username ?? message.from?.first_name ?? 'Unknown',
    text: getMessageText(message),
    expireAt: 0, // Will be calculated by MessageStore
    replyToMessageId: message.reply_to_message?.message_id,
    threadId: message.message_thread_id,
    forwardFromName,
  };

  await messageStore.store(storedMessage);
  console.log('Stored message:', message.message_id, 'in chat:', message.chat.id);
}

/**
 * Check if a message is a text message that should be stored
 * 
 * @param message - The message to check
 * @returns true if the message contains text and should be stored
 * 
 * **Validates: Requirements 2.2** - Ignore non-text messages
 */
export function isTextMessage(message: Message): boolean {
  // Must have text content (either text or caption for media messages)
  const content = message.text ?? message.caption;
  if (!content) {
    return false;
  }
  
  // Ignore commands (they are handled separately)
  if (content.startsWith('/')) {
    return false;
  }
  
  return true;
}

/**
 * Get the text content from a message (text or caption)
 * 
 * @param message - The message to extract text from
 * @returns The text content, with [📷 Photo] prefix for captioned images
 */
export function getMessageText(message: Message): string {
  if (message.text) {
    return message.text;
  }
  if (message.caption) {
    // Prefix with photo indicator so summaries know this was an image
    return `[📷 Photo] ${message.caption}`;
  }
  return '';
}

/**
 * Check if a message is a bot-added-to-group event
 * 
 * @param message - The message to check
 * @returns true if this is a new_chat_members event with the bot
 */
export function isBotAddedEvent(message: Message): boolean {
  if (!message.new_chat_members || message.new_chat_members.length === 0) {
    return false;
  }
  
  return isBotAddedToGroup(message.new_chat_members);
}

/**
 * Check if a message is a command
 * 
 * @param message - The message to check
 * @returns true if the message is a bot command
 */
export function isCommand(message: Message): boolean {
  return !!message.text && message.text.startsWith('/');
}

/**
 * Main webhook handler function
 * Routes incoming Telegram updates to appropriate handlers
 * 
 * @param update - The Telegram update to process
 * @param messageStore - The message store instance
 * @param commandRouter - The command router instance
 * @param telegramClient - The Telegram client for sending messages
 * 
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
 */
export async function handleWebhook(
  update: TelegramUpdate,
  messageStore: MessageStore,
  commandRouter: CommandRouter,
  telegramClient: TelegramClient
): Promise<void> {
  // Check if we have a message to process
  if (!update.message) {
    console.log('Update has no message, skipping');
    return;
  }

  const message = update.message;

  // Route based on message type
  // Priority: bot added > command > text message > ignore
  
  if (isBotAddedEvent(message)) {
    // Bot was added to a group - send welcome message
    await handleBotAdded(message, telegramClient);
  } else if (isCommand(message)) {
    // Handle bot commands using the command router
    await handleCommand(message, commandRouter);
  } else if (isTextMessage(message)) {
    // Store text messages for later summarization
    await storeMessage(message, messageStore);
  } else {
    // Ignore non-text messages (stickers, media, join/leave notifications)
    // **Validates: Requirements 2.2**
    console.log('Ignoring non-text message type in chat:', message.chat.id);
  }
}

/**
 * Lambda handler function for processing Telegram webhook updates
 * 
 * @param event - API Gateway HTTP API event containing the Telegram update
 * @returns API Gateway response with status code and body
 */
export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  console.log('Received webhook event');

  try {
    // Parse the incoming Telegram update
    if (!event.body) {
      console.warn('Missing request body');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    let update: TelegramUpdate;
    try {
      update = JSON.parse(event.body);
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      };
    }
    
    console.log('Processing update:', update.update_id);

    // Get cached instances (Lambda cold start optimization)
    const telegramClient = getTelegramClient();
    const messageStore = getMessageStore();

    // Create command router with Telegram client's sendMessage method
    const commandRouter = createCommandRouter(
      (chatId: number, text: string) => telegramClient.sendMessage(chatId, text)
    );
    
    // Register command handlers
    // Register /help command handler
    // **Validates: Requirements 4.1, 4.2**
    const helpHandler = createHelpHandler(
      (chatId: number, text: string) => telegramClient.sendMessage(chatId, text)
    );
    commandRouter.register('help', helpHandler);
    
    // Register /summary command handler
    // **Validates: Requirements 3.1, 3.2, 3.3**
    if (isAIProviderConfigured()) {
      const aiProvider = createAIProvider();
      const summaryEngine = createSummaryEngine(messageStore, aiProvider);
      const summaryFormatter = createSummaryFormatter();
      
      const summaryHandler = createSummaryHandler(
        (chatId: number, text: string) => telegramClient.sendMessage(chatId, text),
        async (chatId: number, range) => {
          const rawSummary = await summaryEngine.generateSummary(chatId, range);
          return summaryFormatter.format(rawSummary);
        }
      );
      commandRouter.register('summary', summaryHandler);
    } else {
      console.warn('AI provider not configured - /summary command will not be available');
    }

    // Process the webhook update
    await handleWebhook(update, messageStore, commandRouter, telegramClient);

    // Return success response to Telegram
    // Telegram expects a 200 response to acknowledge receipt
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  } catch (error) {
    // Use centralized error handling
    const errorResponse = handleError(error instanceof Error ? error : new Error(String(error)));
    console.error('Error processing webhook:', formatErrorForTelegram(errorResponse));
    
    // Return 200 even on error to prevent Telegram from retrying
    // Log the error for debugging but don't expose details
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true }),
    };
  }
}
