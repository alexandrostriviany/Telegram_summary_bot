/**
 * Credits Command Handler for Telegram Summary Bot
 *
 * Shows the invoking user's remaining daily credits.
 *
 * @module commands/credits-handler
 */

import { Message } from '../types';
import { CommandHandler } from './command-router';
import { CreditsStore } from '../store/credits-store';

/**
 * Credits Command Handler
 */
export class CreditsHandler implements CommandHandler {
  private sendMessage: (chatId: number, text: string) => Promise<void>;
  private creditsStore: CreditsStore;

  constructor(
    sendMessage: (chatId: number, text: string) => Promise<void>,
    creditsStore: CreditsStore
  ) {
    this.sendMessage = sendMessage;
    this.creditsStore = creditsStore;
  }

  async execute(message: Message, _args: string[]): Promise<void> {
    const chatId = message.chat.id;

    // Always show the invoking user's own credits
    const userId = message.from?.id ?? 0;

    if (userId === 0) {
      await this.sendMessage(chatId, 'Unable to determine user for credit lookup.');
      return;
    }

    const credits = await this.creditsStore.getCredits(userId);
    const remaining = credits.dailyLimit - credits.creditsUsedToday;

    await this.sendMessage(
      chatId,
      `Credits: ${remaining}/${credits.dailyLimit} remaining today`
    );
  }
}

/**
 * Create a CreditsHandler with the given dependencies
 */
export function createCreditsHandler(
  sendMessage: (chatId: number, text: string) => Promise<void>,
  creditsStore: CreditsStore
): CreditsHandler {
  return new CreditsHandler(sendMessage, creditsStore);
}
