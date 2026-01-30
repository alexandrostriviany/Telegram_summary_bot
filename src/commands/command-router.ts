/**
 * Command Router for Telegram Summary Bot
 * 
 * This module provides command parsing and routing functionality for bot commands.
 * It parses incoming messages, extracts commands and arguments, and routes them
 * to the appropriate handlers.
 * 
 * @module commands/command-router
 */

import { Message } from '../types';

/**
 * Result of parsing a command from message text
 */
export interface ParsedCommand {
  /** The command name (e.g., '/summary', '/help') */
  command: string;
  /** The command name without the leading slash (e.g., 'summary', 'help') */
  commandName: string;
  /** Array of arguments following the command */
  args: string[];
  /** The raw text after the command */
  rawArgs: string;
}

/**
 * Interface for command handlers
 * 
 * Each command handler implements this interface to process specific bot commands.
 * Handlers receive the original message and parsed arguments.
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 4.1**
 */
export interface CommandHandler {
  /**
   * Execute the command with the given message and arguments
   * 
   * @param message - The original Telegram message containing the command
   * @param args - Array of arguments parsed from the command
   */
  execute(message: Message, args: string[]): Promise<void>;
}

/**
 * Parse a command from message text
 * 
 * Extracts the command name and arguments from a message that starts with '/'.
 * Handles bot username mentions (e.g., '/summary@BotName') by stripping the mention.
 * 
 * @param text - The message text to parse
 * @returns ParsedCommand object with command name and arguments, or null if not a command
 * 
 * @example
 * parseCommand('/summary 1h')
 * // Returns: { command: '/summary', commandName: 'summary', args: ['1h'], rawArgs: '1h' }
 * 
 * @example
 * parseCommand('/summary@MyBot 50')
 * // Returns: { command: '/summary', commandName: 'summary', args: ['50'], rawArgs: '50' }
 */
export function parseCommand(text: string): ParsedCommand | null {
  if (!text) {
    return null;
  }

  // Trim the text first to handle leading/trailing whitespace
  const trimmedText = text.trim();
  
  if (!trimmedText.startsWith('/')) {
    return null;
  }

  // Split by whitespace to get command and arguments
  const parts = trimmedText.split(/\s+/);
  const commandPart = parts[0];
  const args = parts.slice(1);

  // Handle bot username mentions (e.g., /summary@BotName)
  // Strip the @username part if present
  const atIndex = commandPart.indexOf('@');
  const command = atIndex > 0 ? commandPart.substring(0, atIndex) : commandPart;

  // Extract command name without the leading slash
  const commandName = command.substring(1).toLowerCase();

  // Get raw args (everything after the command)
  const commandEndIndex = trimmedText.indexOf(commandPart) + commandPart.length;
  const rawArgs = trimmedText.substring(commandEndIndex).trim();

  return {
    command: command.toLowerCase(),
    commandName,
    args,
    rawArgs,
  };
}

/**
 * Default message for unknown commands
 */
const UNKNOWN_COMMAND_MESSAGE = `❓ Unknown command.

Available commands:
• /summary - Summarize recent messages
• /summary 2h - Summarize last 2 hours
• /summary 50 - Summarize last 50 messages
• /help - Show help and usage info

Type /help for more information.`;

/**
 * Command Router class
 * 
 * Routes bot commands to their appropriate handlers based on the command name.
 * Supports registering multiple handlers and provides graceful handling of
 * unknown commands.
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 4.1**
 */
export class CommandRouter {
  private handlers: Map<string, CommandHandler>;
  private sendMessage: (chatId: number, text: string) => Promise<void>;

  /**
   * Create a new CommandRouter instance
   * 
   * @param sendMessage - Function to send messages to Telegram chats
   */
  constructor(sendMessage: (chatId: number, text: string) => Promise<void>) {
    this.handlers = new Map();
    this.sendMessage = sendMessage;
  }

  /**
   * Register a command handler
   * 
   * @param command - The command name (without leading slash, e.g., 'summary')
   * @param handler - The handler to execute for this command
   */
  register(command: string, handler: CommandHandler): void {
    this.handlers.set(command.toLowerCase(), handler);
  }

  /**
   * Check if a handler is registered for a command
   * 
   * @param command - The command name to check
   * @returns true if a handler is registered
   */
  hasHandler(command: string): boolean {
    return this.handlers.has(command.toLowerCase());
  }

  /**
   * Get all registered command names
   * 
   * @returns Array of registered command names
   */
  getRegisteredCommands(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Route a message to the appropriate command handler
   * 
   * Parses the command from the message text and routes it to the registered
   * handler. If no handler is found, sends a helpful message about available
   * commands.
   * 
   * @param message - The Telegram message containing the command
   * 
   * **Validates: Requirements 3.1** - Route /summary command
   * **Validates: Requirements 4.1** - Route /help command
   */
  async route(message: Message): Promise<void> {
    if (!message.text) {
      return;
    }

    const parsed = parseCommand(message.text);
    if (!parsed) {
      return;
    }

    const handler = this.handlers.get(parsed.commandName);
    
    if (handler) {
      await handler.execute(message, parsed.args);
    } else {
      // Handle unknown commands gracefully
      await this.handleUnknownCommand(message, parsed.commandName);
    }
  }

  /**
   * Handle an unknown command by sending a helpful message
   * 
   * @param message - The original message
   * @param commandName - The unknown command name
   */
  private async handleUnknownCommand(message: Message, commandName: string): Promise<void> {
    console.log(`Unknown command received: /${commandName} in chat: ${message.chat.id}`);
    await this.sendMessage(message.chat.id, UNKNOWN_COMMAND_MESSAGE);
  }
}

/**
 * Create a CommandRouter with default configuration
 * 
 * @param sendMessage - Function to send messages to Telegram chats
 * @returns Configured CommandRouter instance
 */
export function createCommandRouter(
  sendMessage: (chatId: number, text: string) => Promise<void>
): CommandRouter {
  return new CommandRouter(sendMessage);
}
