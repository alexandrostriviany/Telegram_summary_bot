/**
 * Main Lambda handler for Telegram Summary Bot
 * 
 * This is the entry point for all incoming Telegram webhook requests.
 * The handler processes updates and routes them to appropriate handlers.
 * 
 * @module handler
 */

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { TelegramUpdate, Message, CallbackQuery, StoredMessage, User, BotUser, InlineKeyboardMarkup, InlineKeyboardButton } from './types';
import { DynamoDBMessageStore, MessageStore } from './store/message-store';
import { CommandRouter, createCommandRouter } from './commands/command-router';
import { createHelpHandler } from './commands/help-handler';
import { createSummaryHandler } from './commands/summary-handler';
import { createCreditsHandler } from './commands/credits-handler';
import { createAdminHandler } from './commands/admin-handler';
import { createLinkHandler, handleLinkCallback, CandidateGroup } from './commands/link-handler';
import { createStartHandler } from './commands/start-handler';
import { createUnlinkHandler, UNLINK_CONFIRM_PREFIX, UNLINK_CANCEL_PREFIX } from './commands/unlink-handler';
import { createGroupsHandler } from './commands/groups-handler';
import { TelegramClient, createTelegramClient } from './telegram/telegram-client';
import { createSummaryEngine } from './summary/summary-engine';
import { createSummaryFormatter } from './summary/summary-formatter';
import { createAIProvider, isAIProviderConfigured, getProviderTypeFromEnv } from './ai/ai-provider';
import { DynamoDBCreditsStore, CreditsStore } from './store/credits-store';
import { DynamoDBTopicLinkStore, TopicLinkStore } from './store/topic-link-store';
import { DynamoDBUserGroupStore, UserGroupStore } from './store/user-group-store';
import { createMembershipService, MembershipService } from './services/membership-service';
import { handleError, formatErrorForTelegram } from './errors/error-handler';

// ============================================================================
// Lambda Cold Start Optimization
// Dependencies are initialized once outside the handler for reuse across invocations
// ============================================================================

/** Cached Telegram client instance */
let cachedTelegramClient: TelegramClient | null = null;

/** Cached message store instance */
let cachedMessageStore: MessageStore | null = null;

/** Cached credits store instance */
let cachedCreditsStore: CreditsStore | null = null;

/** Cached topic link store instance */
let cachedTopicLinkStore: TopicLinkStore | null = null;

/** Cached user group store instance */
let cachedUserGroupStore: UserGroupStore | null = null;

/** Cached membership service instance */
let cachedMembershipService: MembershipService | null = null;

/** Cached bot user info (from getMe) */
let cachedBotUser: BotUser | null = null;

/** Whether bot commands have been registered with Telegram */
let commandsRegistered = false;

/**
 * Reset cached instances (for testing purposes)
 * @internal
 */
export function resetCachedInstances(): void {
  cachedTelegramClient = null;
  cachedMessageStore = null;
  cachedCreditsStore = null;
  cachedTopicLinkStore = null;
  cachedUserGroupStore = null;
  cachedMembershipService = null;
  cachedBotUser = null;
  commandsRegistered = false;
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
 * Get or create the credits store (singleton pattern for Lambda reuse)
 */
function getCreditsStore(): CreditsStore {
  if (!cachedCreditsStore) {
    cachedCreditsStore = new DynamoDBCreditsStore();
  }
  return cachedCreditsStore;
}

/**
 * Get or create the topic link store (singleton pattern for Lambda reuse)
 */
function getTopicLinkStore(): TopicLinkStore {
  if (!cachedTopicLinkStore) {
    cachedTopicLinkStore = new DynamoDBTopicLinkStore();
  }
  return cachedTopicLinkStore;
}

/**
 * Get or create the user group store (singleton pattern for Lambda reuse)
 */
function getUserGroupStore(): UserGroupStore {
  if (!cachedUserGroupStore) {
    cachedUserGroupStore = new DynamoDBUserGroupStore();
  }
  return cachedUserGroupStore;
}

/**
 * Get or create the membership service (singleton pattern for Lambda reuse)
 */
function getMembershipService(telegramClient: TelegramClient): MembershipService {
  if (!cachedMembershipService) {
    cachedMembershipService = createMembershipService(telegramClient);
  }
  return cachedMembershipService;
}

/**
 * Get the cached bot user info
 */
export function getCachedBotUser(): BotUser | null {
  return cachedBotUser;
}

/**
 * Register bot commands with Telegram for the command menu.
 * Called once on cold start; failures are non-fatal.
 */
async function registerBotCommands(telegramClient: TelegramClient): Promise<void> {
  if (commandsRegistered) return;

  try {
    // Register commands for private chats
    await telegramClient.setMyCommands(
      [
        { command: 'start', description: 'Start the bot / onboarding' },
        { command: 'link', description: 'Link a group to a private topic' },
        { command: 'unlink', description: 'Remove a group link' },
        { command: 'groups', description: 'List linked groups' },
        { command: 'summary', description: 'Summarize recent messages' },
        { command: 'credits', description: 'Show remaining credits' },
        { command: 'help', description: 'Show help and usage info' },
      ],
      { type: 'all_private_chats' }
    );

    // Register commands for group chats — minimal
    await telegramClient.setMyCommands(
      [
        { command: 'summary', description: 'Summarize recent messages' },
        { command: 'start', description: 'Get private summaries in DM' },
      ],
      { type: 'all_group_chats' }
    );

    commandsRegistered = true;
    console.log('Bot commands registered successfully');
  } catch (error) {
    // Non-fatal: command menu is a UX convenience, not critical
    console.error('Failed to register bot commands:', error);
  }
}

/**
 * Fetch and cache the bot's own user info via getMe.
 * Called once on cold start; failures are non-fatal.
 */
async function fetchBotUser(telegramClient: TelegramClient): Promise<void> {
  if (cachedBotUser) return;

  try {
    cachedBotUser = await telegramClient.getMe();
    console.log('Bot user info cached:', cachedBotUser.username ?? cachedBotUser.first_name);
  } catch (error) {
    console.error('Failed to fetch bot user info:', error);
  }
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

💬 *Private Summaries:* DM me and use /link to get private per-group summaries!

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
  telegramClient: TelegramClient,
  creditsStore?: CreditsStore
): Promise<void> {
  console.log('Bot added to group:', message.chat.id, message.chat.title);
  await telegramClient.sendMessage(message.chat.id, WELCOME_MESSAGE);

  // Send a deep-link button for private summaries if bot username is available
  if (cachedBotUser?.username) {
    try {
      const deepLink = `https://t.me/${cachedBotUser.username}?start=link_${message.chat.id}`;
      await telegramClient.sendInlineKeyboard(
        message.chat.id,
        '\u{1F512} Want private summaries? Tap below to set it up in DM.',
        { inline_keyboard: [[{ text: '\u{1F512} Get private summaries \u2192 DM', url: deepLink }]] },
      );
    } catch (error) {
      // Non-fatal: welcome message was already sent
      console.error('Failed to send deep-link button:', error);
    }
  }

  // Record chat ownership — the user who added the bot owns the credits for this chat
  if (creditsStore && message.from) {
    try {
      await creditsStore.setChatOwner(message.chat.id, message.from.id);
      console.log('Chat ownership set:', message.chat.id, '->', message.from.id);
    } catch (error) {
      console.error('Failed to set chat ownership:', error);
    }
  }
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
  console.log('Stored message:', message.message_id, 'in chat:', message.chat.id, 
    message.photo ? '(photo with caption)' : '(text)');
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
  
  // Debug logging for photo messages
  if (message.photo) {
    console.log('Photo message detected:', {
      hasCaption: !!message.caption,
      caption: message.caption,
      photoCount: message.photo.length,
    });
  }
  
  if (!content) {
    console.log('Message has no text or caption, ignoring');
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
 * Mapping from persistent reply keyboard button text to command names.
 * When a user taps a keyboard button, Telegram sends a regular text message.
 */
export const KEYBOARD_BUTTON_ROUTES: Record<string, string> = {
  '\u{1F517} Link Group': 'link',
  '\u{1F4CB} My Groups': 'groups',
  '\u{1F4CA} Credits': 'credits',
  '\u{2753} Help': 'help',
};

/**
 * Check if a private-chat text message matches a reply keyboard button.
 */
export function isKeyboardButton(message: Message): boolean {
  if (message.chat.type !== 'private' || !message.text || message.text.startsWith('/')) {
    return false;
  }
  return message.text.trim() in KEYBOARD_BUTTON_ROUTES;
}

/**
 * Route a keyboard button press through the command router by
 * rewriting the message text to the corresponding slash command.
 */
export async function handleKeyboardButton(
  message: Message,
  commandRouter: CommandRouter
): Promise<void> {
  const commandName = KEYBOARD_BUTTON_ROUTES[message.text!.trim()];
  console.log('Keyboard button pressed:', message.text, '-> /' + commandName);
  await commandRouter.route({ ...message, text: `/${commandName}` });
}

/**
 * Handle a callback query from an inline keyboard button press.
 * Routes to the appropriate handler based on the callback_data prefix.
 *
 * @param callbackQuery - The callback query from Telegram
 * @param telegramClient - The Telegram client
 * @param topicLinkStore - The topic link store
 * @param unlinkHandler - The unlink handler for confirm/cancel callbacks
 */
export async function handleCallbackQuery(
  callbackQuery: CallbackQuery,
  telegramClient: TelegramClient,
  topicLinkStore: TopicLinkStore,
  unlinkHandler: ReturnType<typeof createUnlinkHandler>,
  commandRouter?: CommandRouter,
  creditsStore?: CreditsStore
): Promise<void> {
  const { id: callbackQueryId, from, message, data } = callbackQuery;

  if (!data) {
    await telegramClient.answerCallbackQuery(callbackQueryId, 'No action data.');
    return;
  }

  const userId = from.id;
  const privateChatId = message?.chat.id ?? userId;

  console.log('Handling callback query:', data, 'from user:', userId);

  try {
    if (data.startsWith('link:')) {
      // Link callback: user selected a group to link
      await handleLinkCallback(
        callbackQueryId,
        data,
        userId,
        privateChatId,
        telegramClient,
        topicLinkStore,
      );
    } else if (data.startsWith(UNLINK_CONFIRM_PREFIX)) {
      // Unlink confirm callback: parse userId and topicThreadId from callback data
      const parts = data.slice(UNLINK_CONFIRM_PREFIX.length).split(':');
      const cbUserId = parseInt(parts[0], 10);
      const topicThreadId = parseInt(parts[1], 10);

      if (isNaN(cbUserId) || isNaN(topicThreadId)) {
        await telegramClient.answerCallbackQuery(callbackQueryId, 'Invalid unlink data.');
        return;
      }

      await unlinkHandler.handleConfirm(cbUserId, topicThreadId, privateChatId, callbackQueryId);
    } else if (data.startsWith(UNLINK_CANCEL_PREFIX)) {
      // Unlink cancel callback
      await unlinkHandler.handleCancel(callbackQueryId);
    } else if (data.startsWith('menu:') && commandRouter) {
      // Menu button callback: edit the original message in place to keep chat clean
      const commandName = data.slice('menu:'.length);
      const originalMessageId = message?.message_id;
      const menuKeyboard: InlineKeyboardMarkup = {
        inline_keyboard: [
          [
            { text: '\u{1F517} Link Group', callback_data: 'menu:link' },
            { text: '\u{1F4CB} My Groups', callback_data: 'menu:groups' },
          ],
          [
            { text: '\u{1F4CA} Credits', callback_data: 'menu:credits' },
            { text: '\u2753 Help', callback_data: 'menu:help' },
          ],
        ],
      };

      // Preserve the topic threadId from the original message
      const cbThreadId = message?.message_thread_id;

      // For /link, route normally (it needs to send an inline keyboard with group choices)
      if (commandName === 'link') {
        const fakeMessage: Message = {
          message_id: originalMessageId ?? 0,
          chat: message?.chat ?? { id: privateChatId, type: 'private' as const },
          from,
          date: Math.floor(Date.now() / 1000),
          text: '/link',
          message_thread_id: cbThreadId,
        };
        await commandRouter.route(fakeMessage);
      } else if (originalMessageId) {
        // Edit the original message in place with the command's response
        // Create a sender that edits instead of sending new messages
        const editSendMsg = (_chatId: number, text: string) =>
          telegramClient.editMessageText(privateChatId, originalMessageId, text, menuKeyboard);

        // Build a temporary router with the edit-based sender
        const editRouter = createCommandRouter(editSendMsg);

        // Re-register only the needed handlers with the edit sender
        if (commandName === 'help') {
          editRouter.register('help', createHelpHandler(editSendMsg));
        } else if (commandName === 'credits' && creditsStore) {
          editRouter.register('credits', createCreditsHandler(editSendMsg, creditsStore));
        } else if (commandName === 'groups') {
          editRouter.register('groups', createGroupsHandler(editSendMsg, topicLinkStore));
        }

        const fakeMessage: Message = {
          message_id: originalMessageId,
          chat: message?.chat ?? { id: privateChatId, type: 'private' as const },
          from,
          date: Math.floor(Date.now() / 1000),
          text: `/${commandName}`,
        };
        await editRouter.route(fakeMessage);
      }
      await telegramClient.answerCallbackQuery(callbackQueryId);
    } else if (data.startsWith('nav:') && commandRouter) {
      // Nav buttons on summaries — send new message, preserve summary content
      const navCommand = data.slice('nav:'.length);
      const navThreadId = message?.message_thread_id;
      const navMessage: Message = {
        message_id: message?.message_id ?? 0,
        chat: message?.chat ?? { id: privateChatId, type: 'private' as const },
        from,
        date: Math.floor(Date.now() / 1000),
        text: `/${navCommand}`,
        message_thread_id: navThreadId,
      };
      await commandRouter.route(navMessage);
      await telegramClient.answerCallbackQuery(callbackQueryId);
    } else {
      await telegramClient.answerCallbackQuery(callbackQueryId, 'Unknown action.');
    }
  } catch (error) {
    console.error('Error handling callback query:', error);
    try {
      await telegramClient.answerCallbackQuery(callbackQueryId, 'An error occurred.');
    } catch {
      // Ignore errors when answering callback query fails
    }
  }
}

/**
 * Main webhook handler function
 * Routes incoming Telegram updates to appropriate handlers
 *
 * @param update - The Telegram update to process
 * @param messageStore - The message store instance
 * @param commandRouter - The command router instance
 * @param telegramClient - The Telegram client for sending messages
 * @param creditsStore - Optional credits store
 * @param userGroupStore - Optional user group store for passive tracking
 *
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
 */
export async function handleWebhook(
  update: TelegramUpdate,
  messageStore: MessageStore,
  commandRouter: CommandRouter,
  telegramClient: TelegramClient,
  creditsStore?: CreditsStore,
  userGroupStore?: UserGroupStore
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
    // Bot was added to a group - send welcome message and record ownership
    await handleBotAdded(message, telegramClient, creditsStore);
  } else if (message.forum_topic_created && message.chat.type === 'private' && message.message_thread_id) {
    // User created a new topic in the private chat — suggest linking it to a group
    const threadId = message.message_thread_id;
    await telegramClient.sendMessage(
      message.chat.id,
      'Use /link to connect this topic to a group chat and get private summaries here.',
      threadId,
    );
  } else if (isKeyboardButton(message)) {
    // Handle persistent reply keyboard button presses in private chat
    await handleKeyboardButton(message, commandRouter);
  } else if (isCommand(message)) {
    // Handle bot commands using the command router
    await handleCommand(message, commandRouter);
  } else if (isTextMessage(message)) {
    // Store text messages for later summarization
    await storeMessage(message, messageStore);

    // Passive user-group tracking: record which users are in which groups
    if (userGroupStore && message.chat.type !== 'private' && message.from) {
      try {
        await userGroupStore.trackUserInGroup(
          message.from.id,
          message.chat.id,
          message.chat.title ?? 'Unknown Group'
        );
      } catch (error) {
        // Don't let tracking failures break message storage
        console.error('Failed to track user in group:', error);
      }
    }
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
    const creditsStore = getCreditsStore();
    const topicLinkStore = getTopicLinkStore();
    const userGroupStore = getUserGroupStore();
    const membershipService = getMembershipService(telegramClient);

    // One-time cold-start setup: register commands and fetch bot info
    await Promise.all([
      registerBotCommands(telegramClient),
      fetchBotUser(telegramClient),
    ]);

    // Bind the forum topic threadId so all responses go to the correct topic
    const threadId = update.message?.message_thread_id ?? update.callback_query?.message?.message_thread_id;
    const chatType = update.message?.chat.type ?? update.callback_query?.message?.chat.type;
    const isPrivateChat = chatType === 'private';

    // Full menu buttons for service messages in private chats
    const FULL_MENU_KEYBOARD: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: '\u{1F517} Link Group', callback_data: 'menu:link' },
          { text: '\u{1F4CB} My Groups', callback_data: 'menu:groups' },
        ],
        [
          { text: '\u{1F4CA} Credits', callback_data: 'menu:credits' },
          { text: '\u2753 Help', callback_data: 'menu:help' },
        ],
      ],
    };

    const sendMsg = isPrivateChat
      ? (chatId: number, text: string) => telegramClient.sendInlineKeyboard(chatId, text, FULL_MENU_KEYBOARD, threadId)
      : (chatId: number, text: string) => telegramClient.sendMessage(chatId, text, threadId);

    // Summary-specific sender with contextual buttons (chat link + summarize 100)
    const sendSummaryMsg = isPrivateChat
      ? (chatId: number, text: string, targetGroupChatId?: number) => {
          const buttons: InlineKeyboardButton[] = [];
          if (targetGroupChatId) {
            const positiveId = String(targetGroupChatId).replace(/^-100/, '');
            buttons.push({ text: '\u{1F4AC} Open Chat', url: `https://t.me/c/${positiveId}/1` });
          }
          buttons.push({ text: '\u{1F4DD} Last 100 messages', callback_data: 'nav:summary 100' });
          const keyboard: InlineKeyboardMarkup = { inline_keyboard: [buttons] };
          return telegramClient.sendInlineKeyboard(chatId, text, keyboard, threadId);
        }
      : (chatId: number, text: string) => telegramClient.sendMessage(chatId, text, threadId);

    // Create command router with Telegram client's sendMessage method
    const commandRouter = createCommandRouter(sendMsg);

    // Register command handlers
    // Register /help command handler
    const helpHandler = createHelpHandler(sendMsg);
    commandRouter.register('help', helpHandler);

    // Register /credits command handler
    const creditsHandler = createCreditsHandler(sendMsg, creditsStore);
    commandRouter.register('credits', creditsHandler);

    // Register /admin command handler
    const adminUserId = parseInt(process.env.ADMIN_USER_ID ?? '0', 10);
    if (adminUserId !== 0) {
      const adminHandler = createAdminHandler(sendMsg, creditsStore, adminUserId);
      commandRouter.register('admin', adminHandler);
    }

    // Shared function to retrieve candidate groups for a user
    const getCandidateGroups = async (userId: number): Promise<CandidateGroup[]> => {
      // Merge two sources: passive tracking table + all known groups from ownership table
      const [userRecords, allChats] = await Promise.all([
        userGroupStore.getUserGroups(userId),
        creditsStore.getAllChats(),
      ]);

      // Build a map to deduplicate by groupChatId
      const groupMap = new Map<number, { chatId: number; title: string }>();

      // Add groups from passive tracking (have accurate titles)
      for (const r of userRecords) {
        groupMap.set(r.groupChatId, { chatId: r.groupChatId, title: r.groupTitle });
      }

      // Add groups from ownership table (bot is present in these)
      // Fetch real titles via getChat API for groups not in passive tracking
      for (const chat of allChats) {
        if (!groupMap.has(chat.chatId)) {
          try {
            const chatInfo = await telegramClient.getChat(chat.chatId);
            groupMap.set(chat.chatId, {
              chatId: chat.chatId,
              title: chatInfo.title ?? `Group ${chat.chatId}`,
            });
          } catch {
            // Bot may have been removed from this group — skip it
          }
        }
      }

      return Array.from(groupMap.values());
    };

    // Register /link command handler (private chat only)
    const linkHandler = createLinkHandler(
      telegramClient,
      topicLinkStore,
      membershipService,
      getCandidateGroups,
    );
    commandRouter.register('link', linkHandler);

    // Register /unlink command handler (private chat topic only)
    const unlinkHandler = createUnlinkHandler(sendMsg, topicLinkStore, telegramClient);
    commandRouter.register('unlink', unlinkHandler);

    // Register /groups command handler (private chat only)
    const groupsHandler = createGroupsHandler(sendMsg, topicLinkStore);
    commandRouter.register('groups', groupsHandler);

    // Register /start command handler
    const startHandler = createStartHandler(
      sendMsg,
      telegramClient,
      topicLinkStore,
      membershipService,
      creditsStore,
    );
    commandRouter.register('start', startHandler);

    // Register /summary command handler
    if (isAIProviderConfigured()) {
      const providerType = getProviderTypeFromEnv();
      const aiProvider = createAIProvider(providerType);
      const model = process.env.LLM_MODEL ?? 'default';
      const summaryEngine = createSummaryEngine(messageStore, aiProvider, providerType, model);
      const summaryFormatter = createSummaryFormatter();

      const summaryHandler = createSummaryHandler(
        sendSummaryMsg,
        async (chatId: number, range, threadId?: number) => {
          const rawSummary = await summaryEngine.generateSummary(chatId, range, threadId);
          return summaryFormatter.format(rawSummary);
        },
        creditsStore,
        { topicLinkStore, membershipService, telegramClient },
      );
      commandRouter.register('summary', summaryHandler);
    } else {
      console.warn('AI provider not configured - /summary command will not be available');
    }

    // Handle callback queries (inline keyboard button presses)
    if (update.callback_query) {
      const generalSendMsg = (chatId: number, text: string) => telegramClient.sendMessage(chatId, text);
      const unlinkHandler = createUnlinkHandler(generalSendMsg, topicLinkStore, telegramClient);
      await handleCallbackQuery(update.callback_query, telegramClient, topicLinkStore, unlinkHandler, commandRouter, creditsStore);

      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true }),
      };
    }

    // Process the webhook update
    await handleWebhook(update, messageStore, commandRouter, telegramClient, creditsStore, userGroupStore);

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
