/**
 * Core TypeScript interfaces for Telegram AI Summary Bot
 * 
 * This module defines all the type definitions used throughout the application
 * for handling Telegram updates, message storage, and summarization queries.
 * 
 * @module types
 */

// ============================================================================
// Telegram API Types
// ============================================================================

/**
 * Represents an incoming update from Telegram's webhook
 * 
 * @see https://core.telegram.org/bots/api#update
 */
export interface TelegramUpdate {
  /** Unique identifier for this update */
  update_id: number;
  /** New incoming message of any kind (text, photo, sticker, etc.) */
  message?: Message;
}

/**
 * Represents a Telegram message
 * 
 * @see https://core.telegram.org/bots/api#message
 */
export interface Message {
  /** Unique message identifier within the chat */
  message_id: number;
  /** Chat the message belongs to */
  chat: Chat;
  /** Sender of the message (empty for messages sent to channels) */
  from?: User;
  /** Date the message was sent in Unix time (seconds) */
  date: number;
  /** Text content of the message (for text messages) */
  text?: string;
  /** Caption for media messages (photo, video, document, etc.) */
  caption?: string;
  /** Photo sizes array (present when message contains a photo) */
  photo?: PhotoSize[];
  /** New members added to the group (for service messages) */
  new_chat_members?: User[];
  /** 
   * For replies, the original message being replied to.
   * Used to track thread context in conversations.
   */
  reply_to_message?: Message;
  /** 
   * Forum topic ID for supergroups with topics enabled.
   * Identifies which forum topic the message belongs to.
   */
  message_thread_id?: number;
  /**
   * For forwarded messages, sender of the original message.
   */
  forward_from?: User;
  /**
   * For forwarded messages from channels, information about the original channel.
   */
  forward_from_chat?: Chat;
  /**
   * For forwarded messages, sender's name when forward_from is unavailable
   * (e.g., user has privacy settings that hide their account).
   */
  forward_sender_name?: string;
}

/**
 * Represents a photo size in Telegram
 * 
 * @see https://core.telegram.org/bots/api#photosize
 */
export interface PhotoSize {
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

/**
 * Represents a Telegram chat (group, supergroup, or private)
 * 
 * @see https://core.telegram.org/bots/api#chat
 */
export interface Chat {
  /** Unique identifier for the chat */
  id: number;
  /** Type of chat: 'group', 'supergroup', or 'private' */
  type: 'group' | 'supergroup' | 'private';
  /** Title of the chat (for groups and supergroups) */
  title?: string;
}

/**
 * Represents a Telegram user
 * 
 * @see https://core.telegram.org/bots/api#user
 */
export interface User {
  /** Unique identifier for the user */
  id: number;
  /** User's username (optional, may not be set) */
  username?: string;
  /** User's first name */
  first_name: string;
}

// ============================================================================
// Message Storage Types
// ============================================================================

/**
 * Represents a message stored in DynamoDB
 * 
 * This interface defines the schema for messages persisted in the Message_Store.
 * Messages are stored with a TTL for automatic expiration after 72 hours.
 * 
 * @remarks
 * - chatId + timestamp form the composite primary key
 * - expireAt is used by DynamoDB TTL for automatic deletion
 * - Thread context fields (replyToMessageId, threadId) enable conversation tracking
 * - Forward fields track original author for forwarded messages
 */
export interface StoredMessage {
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
  /** 
   * TTL timestamp in epoch seconds.
   * DynamoDB automatically deletes items after this time.
   * Set to 72 hours (259200 seconds) after message creation.
   */
  expireAt: number;
  /** 
   * ID of the message being replied to (optional).
   * Used to track reply threads in conversations.
   */
  replyToMessageId?: number;
  /** 
   * Forum topic ID for supergroups with topics enabled (optional).
   * Used to identify which forum topic the message belongs to.
   */
  threadId?: number;
  /**
   * Original sender's name for forwarded messages (optional).
   * Used to attribute ideas/proposals to the original author.
   */
  forwardFromName?: string;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Query parameters for retrieving messages from the Message_Store
 * 
 * Used to fetch messages for summarization based on time range or count limits.
 */
export interface MessageQuery {
  /** Telegram chat ID to query messages from */
  chatId: number;
  /** 
   * Start of time range in milliseconds (optional).
   * Messages with timestamp >= startTime will be included.
   */
  startTime?: number;
  /** 
   * End of time range in milliseconds (optional).
   * Messages with timestamp <= endTime will be included.
   */
  endTime?: number;
  /** 
   * Maximum number of messages to return (optional).
   * When specified, returns the N most recent messages.
   */
  limit?: number;
}

/**
 * Defines the range of messages to include in a summary
 * 
 * Used by the /summary command to specify either a time-based
 * or count-based selection of messages.
 * 
 * @example
 * // Time-based: summarize last 2 hours
 * { type: 'time', value: 2 }
 * 
 * @example
 * // Count-based: summarize last 50 messages
 * { type: 'count', value: 50 }
 */
export interface MessageRange {
  /** 
   * Type of range selection:
   * - 'time': value represents hours
   * - 'count': value represents number of messages
   */
  type: 'time' | 'count';
  /** 
   * The range value:
   * - For 'time' type: number of hours to look back
   * - For 'count' type: number of messages to include
   */
  value: number;
}
