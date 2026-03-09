import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

export function createMockDynamoDBClient(): { client: jest.Mocked<DynamoDBClient>; send: jest.Mock } {
  const send = jest.fn();
  const client = { send } as unknown as jest.Mocked<DynamoDBClient>;
  return { client, send };
}
