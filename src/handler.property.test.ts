/**
 * Property-Based Tests for Webhook Handler
 * 
 * These tests use fast-check to verify properties hold across many randomly generated inputs.
 * 
 * @module handler.property.test
 */

import * as fc from 'fast-check';
import { Message, Chat, User } from './types';
import { MessageStore } from './store/message-store';
import { StoredMessage, MessageQuery } from './types';

/**
 * Mock MessageStore implementation for testing
 * Tracks all store() calls to verify non-text messages are not stored
 */
class MockMessageStore implements MessageStore {
  public storeCalls: StoredMessage[] = [];
  public queryCalls: MessageQuery[] = [];
  public deleteAllCalls: number[] = [];

  async store(message: StoredMessage): Promise<void> {
    this.storeCalls.push(message);
  }

  async query(query: MessageQuery): Promise<StoredMessage[]> {
    this.queryCalls.push(query);
    return [];
  }

  async deleteAll(chatId: number): Promise<void> {
    this.deleteAllCalls.push(chatId);
  }

  reset(): void {
    this.storeCalls = [];
    this.queryCalls = [];
    this.deleteAllCalls = [];
  }
}

// Import the functions we need to test AFTER setting up mocks
import { isTextMessage, isCommand, isBotAddedEvent, storeMessage } from './handler';

/**
 * **Validates: Requirements 2.2**
 * 
 * Property 2: Non-Text Message Filtering
 * 
 * For any Telegram update that does not contain a text message (stickers, media,
 * join/leave notifications), the Message_Store SHALL not create any new records.
 */
describe('Property Tests: Webhook Handler', () => {
  let mockStore: MockMessageStore;

  beforeEach(() => {
    mockStore = new MockMessageStore();
  });

  /**
   * Arbitrary generator for a valid Telegram Chat
   */
  const chatArbitrary: fc.Arbitrary<Chat> = fc.record({
    id: fc.integer({ min: -1000000000000, max: 1000000000000 }),
    type: fc.constantFrom('group', 'supergroup', 'private') as fc.Arbitrary<'group' | 'supergroup' | 'private'>,
    title: fc.option(fc.string({ minLength: 1, maxLength: 128 }), { nil: undefined }),
  });

  /**
   * Arbitrary generator for a valid Telegram User
   */
  const userArbitrary: fc.Arbitrary<User> = fc.record({
    id: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
    username: fc.option(fc.string({ minLength: 1, maxLength: 32 }).filter(s => /^[a-zA-Z0-9_]+$/.test(s)), { nil: undefined }),
    first_name: fc.string({ minLength: 1, maxLength: 64 }).filter(s => s.trim().length > 0),
  });

  /**
   * Arbitrary generator for non-text messages (stickers, media, etc.)
   * 
   * Generates messages that simulate:
   * - Stickers (no text field)
   * - Media (photos, videos, documents - no text field)
   * - Empty messages (no text field)
   * - Messages with empty string text
   */
  const nonTextMessageWithoutJoinArbitrary: fc.Arbitrary<Message> = fc.oneof(
    // Sticker message (no text, just message structure)
    fc.record({
      message_id: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
      chat: chatArbitrary,
      from: fc.option(userArbitrary, { nil: undefined }),
      date: fc.integer({ min: 946684800, max: 4102444800 }), // Unix timestamp
      text: fc.constant(undefined),
      new_chat_members: fc.constant(undefined),
      reply_to_message: fc.constant(undefined),
      message_thread_id: fc.option(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), { nil: undefined }),
    }),
    
    // Media message (photo, video, document - no text)
    fc.record({
      message_id: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
      chat: chatArbitrary,
      from: fc.option(userArbitrary, { nil: undefined }),
      date: fc.integer({ min: 946684800, max: 4102444800 }),
      text: fc.constant(undefined),
      new_chat_members: fc.constant(undefined),
      reply_to_message: fc.constant(undefined),
      message_thread_id: fc.option(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), { nil: undefined }),
    }),
    
    // Empty string text (should be treated as non-text)
    fc.record({
      message_id: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
      chat: chatArbitrary,
      from: fc.option(userArbitrary, { nil: undefined }),
      date: fc.integer({ min: 946684800, max: 4102444800 }),
      text: fc.constant(''),
      new_chat_members: fc.constant(undefined),
      reply_to_message: fc.constant(undefined),
      message_thread_id: fc.option(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), { nil: undefined }),
    })
  );

  /**
   * Arbitrary generator for join/leave notification messages
   * These have new_chat_members present
   */
  const joinNotificationMessageArbitrary: fc.Arbitrary<Message> = fc.record({
    message_id: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
    chat: chatArbitrary,
    from: fc.option(userArbitrary, { nil: undefined }),
    date: fc.integer({ min: 946684800, max: 4102444800 }),
    text: fc.constant(undefined),
    new_chat_members: fc.array(userArbitrary, { minLength: 1, maxLength: 5 }),
    reply_to_message: fc.constant(undefined),
    message_thread_id: fc.option(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), { nil: undefined }),
  });

  /**
   * Arbitrary generator for command messages (start with /)
   * Commands should not be stored as regular messages
   */
  const commandMessageArbitrary: fc.Arbitrary<Message> = fc.record({
    message_id: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
    chat: chatArbitrary,
    from: fc.option(userArbitrary, { nil: undefined }),
    date: fc.integer({ min: 946684800, max: 4102444800 }),
    text: fc.constantFrom('/summary', '/help', '/start', '/summary 1h', '/summary 50'),
    new_chat_members: fc.constant(undefined),
    reply_to_message: fc.constant(undefined),
    message_thread_id: fc.option(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), { nil: undefined }),
  });

  /**
   * Combined arbitrary for all non-text message types
   * Used for comprehensive testing of the isTextMessage function
   */
  const allNonTextMessageArbitrary: fc.Arbitrary<Message> = fc.oneof(
    nonTextMessageWithoutJoinArbitrary,
    joinNotificationMessageArbitrary,
    commandMessageArbitrary
  );

  describe('Property 2: Non-Text Message Filtering', () => {
    /**
     * **Validates: Requirements 2.2**
     * 
     * For any Telegram update that does not contain a text message (stickers, media,
     * join/leave notifications), the Message_Store SHALL not create any new records.
     * 
     * This test verifies the core filtering logic: isTextMessage returns false for
     * all non-text message types, which means storeMessage will never be called.
     */
    it('isTextMessage should return false for stickers, media, and empty messages', () => {
      fc.assert(
        fc.property(nonTextMessageWithoutJoinArbitrary, (message: Message) => {
          // isTextMessage should return false for all non-text messages
          const result = isTextMessage(message);
          expect(result).toBe(false);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 2.2**
     * 
     * Join/leave notifications should not be stored as text messages.
     * The isTextMessage function should return false for these.
     */
    it('isTextMessage should return false for join/leave notifications', () => {
      fc.assert(
        fc.property(joinNotificationMessageArbitrary, (message: Message) => {
          const result = isTextMessage(message);
          expect(result).toBe(false);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 2.2**
     * 
     * Command messages (starting with /) should not be stored as regular messages.
     * They are handled separately by the command router.
     */
    it('isTextMessage should return false for command messages', () => {
      fc.assert(
        fc.property(commandMessageArbitrary, (message: Message) => {
          const result = isTextMessage(message);
          expect(result).toBe(false);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 2.2**
     * 
     * Comprehensive test: For ANY non-text message type, isTextMessage returns false.
     * This ensures the Message_Store will not create records for these messages.
     */
    it('isTextMessage should return false for ALL non-text message types', () => {
      fc.assert(
        fc.property(allNonTextMessageArbitrary, (message: Message) => {
          const result = isTextMessage(message);
          expect(result).toBe(false);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 2.2**
     * 
     * Verify that isCommand correctly identifies command messages.
     * Commands start with '/' and should be routed to command handlers, not stored.
     */
    it('isCommand should return true for all command messages', () => {
      fc.assert(
        fc.property(commandMessageArbitrary, (message: Message) => {
          const result = isCommand(message);
          expect(result).toBe(true);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 2.2**
     * 
     * Verify that isCommand returns false for non-command messages.
     */
    it('isCommand should return false for non-command messages', () => {
      fc.assert(
        fc.property(nonTextMessageWithoutJoinArbitrary, (message: Message) => {
          const result = isCommand(message);
          expect(result).toBe(false);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 2.2**
     * 
     * Verify that isBotAddedEvent correctly identifies join notifications.
     */
    it('isBotAddedEvent should return true for messages with new_chat_members', () => {
      fc.assert(
        fc.property(joinNotificationMessageArbitrary, (message: Message) => {
          // Note: isBotAddedEvent returns true when new_chat_members is present
          // and contains the bot (or falls back to true if bot ID can't be determined)
          const result = isBotAddedEvent(message);
          // Since we can't set TELEGRAM_BOT_TOKEN in tests, it falls back to true
          expect(result).toBe(true);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 2.2**
     * 
     * Integration test: Verify that when isTextMessage returns false,
     * storeMessage is NOT called. This simulates the webhook handler logic.
     */
    it('should NOT call store() when isTextMessage returns false', async () => {
      await fc.assert(
        fc.asyncProperty(allNonTextMessageArbitrary, async (message: Message) => {
          mockStore.reset();
          
          // Simulate the webhook handler logic:
          // Only call storeMessage if isTextMessage returns true
          if (isTextMessage(message)) {
            await storeMessage(message, mockStore);
          }
          
          // Since isTextMessage returns false for all non-text messages,
          // store() should NEVER be called
          expect(mockStore.storeCalls.length).toBe(0);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 2.2**
     * 
     * Edge case: Messages with undefined text should not be stored.
     */
    it('should NOT store messages with undefined text', async () => {
      const undefinedTextMessageArbitrary = fc.record({
        message_id: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        chat: chatArbitrary,
        from: fc.option(userArbitrary, { nil: undefined }),
        date: fc.integer({ min: 946684800, max: 4102444800 }),
        text: fc.constant(undefined),
        new_chat_members: fc.constant(undefined),
        reply_to_message: fc.constant(undefined),
        message_thread_id: fc.option(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), { nil: undefined }),
      });

      await fc.assert(
        fc.asyncProperty(undefinedTextMessageArbitrary, async (message: Message) => {
          mockStore.reset();
          
          // Simulate webhook handler logic
          if (isTextMessage(message)) {
            await storeMessage(message, mockStore);
          }
          
          expect(mockStore.storeCalls.length).toBe(0);
        }),
        { numRuns: 100, verbose: true }
      );
    });

    /**
     * **Validates: Requirements 2.2**
     * 
     * Edge case: Messages with empty string text should not be stored.
     */
    it('should NOT store messages with empty string text', async () => {
      const emptyTextMessageArbitrary = fc.record({
        message_id: fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        chat: chatArbitrary,
        from: fc.option(userArbitrary, { nil: undefined }),
        date: fc.integer({ min: 946684800, max: 4102444800 }),
        text: fc.constant(''),
        new_chat_members: fc.constant(undefined),
        reply_to_message: fc.constant(undefined),
        message_thread_id: fc.option(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), { nil: undefined }),
      });

      await fc.assert(
        fc.asyncProperty(emptyTextMessageArbitrary, async (message: Message) => {
          mockStore.reset();
          
          // Simulate webhook handler logic
          if (isTextMessage(message)) {
            await storeMessage(message, mockStore);
          }
          
          expect(mockStore.storeCalls.length).toBe(0);
        }),
        { numRuns: 100, verbose: true }
      );
    });
  });
});
