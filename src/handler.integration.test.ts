/**
 * Integration Tests for Telegram Summary Bot
 * 
 * Tests the full flow with a real DynamoDB Local instance
 */

import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { handler } from './handler';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

// Skip integration tests if not explicitly enabled
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeOrSkip = runIntegrationTests ? describe : describe.skip;

describeOrSkip('Integration Tests with DynamoDB Local', () => {
  const TEST_TABLE_NAME = 'telegram-bot-integration-test';
  const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8001';
  
  let dynamoClient: DynamoDBClient;

  beforeAll(async () => {
    // Create DynamoDB client for local instance
    dynamoClient = new DynamoDBClient({
      endpoint: DYNAMODB_ENDPOINT,
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'local',
        secretAccessKey: 'local',
      },
    });

    // Create test table
    try {
      await dynamoClient.send(new CreateTableCommand({
        TableName: TEST_TABLE_NAME,
        KeySchema: [
          { AttributeName: 'chatId', KeyType: 'HASH' },
          { AttributeName: 'timestamp', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'chatId', AttributeType: 'N' },
          { AttributeName: 'timestamp', AttributeType: 'N' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      }));
      
      // Wait for table to be active
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error: any) {
      if (error.name !== 'ResourceInUseException') {
        throw error;
      }
    }

    // Set environment variables for tests
    process.env.DYNAMODB_TABLE = TEST_TABLE_NAME;
    process.env.DYNAMODB_ENDPOINT = DYNAMODB_ENDPOINT;
    process.env.TELEGRAM_BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz123456789';
    process.env.LLM_PROVIDER = 'bedrock';
    process.env.AWS_REGION = 'us-east-1';
  });

  afterAll(async () => {
    // Clean up test table
    try {
      await dynamoClient.send(new DeleteTableCommand({
        TableName: TEST_TABLE_NAME,
      }));
    } catch (error) {
      console.error('Failed to delete test table:', error);
    }
  });

  beforeEach(async () => {
    // Clear all items from the table before each test
    // In a real scenario, you'd batch delete these items
    // For integration tests, we start fresh with each test
  });

  describe('Text Message Storage', () => {
    it('should store a text message in DynamoDB', async () => {
      const event: APIGatewayProxyEventV2 = {
        body: JSON.stringify({
          update_id: 123456,
          message: {
            message_id: 789,
            chat: { id: -1001234567890, type: 'supergroup', title: 'Test Group' },
            from: { id: 987654321, first_name: 'Alice', username: 'alice' },
            date: Math.floor(Date.now() / 1000),
            text: 'Hello, this is a test message!',
          },
        }),
      } as any;

      const result = await handler(event);

      expect((result as any).statusCode).toBe(200);
      expect(JSON.parse((result as any).body)).toEqual({ ok: true });

      // Verify message was stored in DynamoDB
      const scanResult = await dynamoClient.send(new ScanCommand({
        TableName: TEST_TABLE_NAME,
      }));

      expect(scanResult.Items).toBeDefined();
      expect(scanResult.Items!.length).toBeGreaterThan(0);
      
      const storedMessage = scanResult.Items!.find(item => item.messageId.N === '789');
      expect(storedMessage).toBeDefined();
      expect(storedMessage!.text.S).toBe('Hello, this is a test message!');
      expect(storedMessage!.username.S).toBe('alice');
    });

    it('should store photo caption with photo prefix', async () => {
      const event: APIGatewayProxyEventV2 = {
        body: JSON.stringify({
          update_id: 123457,
          message: {
            message_id: 790,
            chat: { id: -1001234567890, type: 'supergroup', title: 'Test Group' },
            from: { id: 987654321, first_name: 'Bob', username: 'bob' },
            date: Math.floor(Date.now() / 1000),
            caption: 'Check out this amazing view!',
            photo: [
              { file_id: 'abc123', file_unique_id: 'xyz789', width: 1280, height: 720 },
            ],
          },
        }),
      } as any;

      const result = await handler(event);

      expect((result as any).statusCode).toBe(200);

      // Verify photo caption was stored with prefix
      const scanResult = await dynamoClient.send(new ScanCommand({
        TableName: TEST_TABLE_NAME,
      }));

      const photoMessage = scanResult.Items?.find(item => 
        item.text.S?.startsWith('[📷 Photo]')
      );

      expect(photoMessage).toBeDefined();
      expect(photoMessage!.text.S).toBe('[📷 Photo] Check out this amazing view!');
    });

    it('should ignore photo without caption', async () => {
      const event: APIGatewayProxyEventV2 = {
        body: JSON.stringify({
          update_id: 123458,
          message: {
            message_id: 791,
            chat: { id: -1001234567890, type: 'supergroup', title: 'Test Group' },
            from: { id: 987654321, first_name: 'Charlie', username: 'charlie' },
            date: Math.floor(Date.now() / 1000),
            photo: [
              { file_id: 'def456', file_unique_id: 'uvw123', width: 1280, height: 720 },
            ],
          },
        }),
      } as any;

      const result = await handler(event);

      expect((result as any).statusCode).toBe(200);

      // Verify photo without caption was NOT stored
      const scanResult = await dynamoClient.send(new ScanCommand({
        TableName: TEST_TABLE_NAME,
      }));

      const photoMessage = scanResult.Items?.find(item => 
        item.messageId.N === '791'
      );

      expect(photoMessage).toBeUndefined();
    });
  });

  describe('Command Handling', () => {
    it('should handle /help command', async () => {
      const event: APIGatewayProxyEventV2 = {
        body: JSON.stringify({
          update_id: 123459,
          message: {
            message_id: 792,
            chat: { id: -1001234567890, type: 'supergroup', title: 'Test Group' },
            from: { id: 987654321, first_name: 'Dave', username: 'dave' },
            date: Math.floor(Date.now() / 1000),
            text: '/help',
          },
        }),
      } as any;

      const result = await handler(event);

      expect((result as any).statusCode).toBe(200);
      
      // /help command should not be stored
      const scanResult = await dynamoClient.send(new ScanCommand({
        TableName: TEST_TABLE_NAME,
      }));

      const helpMessage = scanResult.Items?.find(item => 
        item.text.S === '/help'
      );

      expect(helpMessage).toBeUndefined();
    });
  });

  describe('Bot Added Event', () => {
    it('should handle bot being added to group', async () => {
      const event: APIGatewayProxyEventV2 = {
        body: JSON.stringify({
          update_id: 123460,
          message: {
            message_id: 793,
            chat: { id: -1001234567890, type: 'supergroup', title: 'Test Group' },
            from: { id: 987654321, first_name: 'Eve', username: 'eve' },
            date: Math.floor(Date.now() / 1000),
            new_chat_members: [
              { id: 123456789, first_name: 'TestBot', is_bot: true },
            ],
          },
        }),
      } as any;

      const result = await handler(event);

      expect((result as any).statusCode).toBe(200);
    });
  });
});
