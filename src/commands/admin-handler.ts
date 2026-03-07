/**
 * Admin Command Handler for Telegram Summary Bot
 *
 * Provides admin-only commands for managing user credits.
 * Auth check: message.from.id must match ADMIN_USER_ID env var.
 *
 * @module commands/admin-handler
 */

import { Message } from '../types';
import { CommandHandler } from './command-router';
import { CreditsStore } from '../store/credits-store';
import { UnauthorizedError } from '../errors/error-handler';

/**
 * Admin Command Handler
 *
 * Subcommands:
 * - /admin setcredits <userId> <limit> — set daily limit
 * - /admin getuser <userId> — view user info
 */
export class AdminHandler implements CommandHandler {
  private sendMessage: (chatId: number, text: string) => Promise<void>;
  private creditsStore: CreditsStore;
  private adminUserId: number;

  constructor(
    sendMessage: (chatId: number, text: string) => Promise<void>,
    creditsStore: CreditsStore,
    adminUserId: number
  ) {
    this.sendMessage = sendMessage;
    this.creditsStore = creditsStore;
    this.adminUserId = adminUserId;
  }

  async execute(message: Message, args: string[]): Promise<void> {
    const chatId = message.chat.id;
    const fromId = message.from?.id ?? 0;

    // Auth check
    if (fromId !== this.adminUserId) {
      throw new UnauthorizedError();
    }

    if (args.length === 0) {
      await this.sendMessage(chatId, this.getUsageMessage());
      return;
    }

    const subcommand = args[0].toLowerCase();

    switch (subcommand) {
      case 'setcredits':
        await this.handleSetCredits(chatId, args.slice(1));
        break;
      case 'getuser':
        await this.handleGetUser(chatId, args.slice(1));
        break;
      default:
        await this.sendMessage(chatId, this.getUsageMessage());
    }
  }

  private async handleSetCredits(chatId: number, args: string[]): Promise<void> {
    if (args.length < 2) {
      await this.sendMessage(chatId, 'Usage: /admin setcredits <userId> <limit>');
      return;
    }

    const userId = parseInt(args[0], 10);
    const limit = parseInt(args[1], 10);

    if (isNaN(userId) || isNaN(limit) || limit < 1 || limit > 1000) {
      await this.sendMessage(chatId, 'Invalid parameters. userId must be a positive number, limit must be between 1 and 1000.');
      return;
    }

    await this.creditsStore.setDailyLimit(userId, limit);
    await this.sendMessage(chatId, `Daily limit for user ${userId} set to ${limit}.`);
  }

  private async handleGetUser(chatId: number, args: string[]): Promise<void> {
    if (args.length < 1) {
      await this.sendMessage(chatId, 'Usage: /admin getuser <userId>');
      return;
    }

    const userId = parseInt(args[0], 10);

    if (isNaN(userId)) {
      await this.sendMessage(chatId, 'Invalid userId. Must be a number.');
      return;
    }

    const credits = await this.creditsStore.getCredits(userId);
    const remaining = credits.dailyLimit - credits.creditsUsedToday;

    const info = [
      `User: ${credits.userId}`,
      `Daily Limit: ${credits.dailyLimit}`,
      `Used Today: ${credits.creditsUsedToday}`,
      `Remaining: ${remaining}`,
      `Paid: ${credits.isPaid}`,
      `Last Reset: ${credits.lastResetDate}`,
    ].join('\n');

    await this.sendMessage(chatId, info);
  }

  private getUsageMessage(): string {
    return [
      'Admin commands:',
      '/admin setcredits <userId> <limit> - Set daily credit limit',
      '/admin getuser <userId> - View user credit info',
    ].join('\n');
  }
}

/**
 * Create an AdminHandler with the given dependencies
 */
export function createAdminHandler(
  sendMessage: (chatId: number, text: string) => Promise<void>,
  creditsStore: CreditsStore,
  adminUserId: number
): AdminHandler {
  return new AdminHandler(sendMessage, creditsStore, adminUserId);
}
