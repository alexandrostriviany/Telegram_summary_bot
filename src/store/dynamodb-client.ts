import { DynamoDBClient, DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';

const MAX_RETRY_ATTEMPTS = 5;

export function createDynamoDBClient(client?: DynamoDBClient): DynamoDBClient {
  if (client) return client;

  const endpoint = process.env.DYNAMODB_ENDPOINT;
  const clientConfig: DynamoDBClientConfig = {
    maxAttempts: MAX_RETRY_ATTEMPTS,
  };
  if (endpoint) {
    clientConfig.endpoint = endpoint;
    clientConfig.region = process.env.AWS_REGION || 'us-east-1';
    clientConfig.credentials = { accessKeyId: 'local', secretAccessKey: 'local' };
  }
  return new DynamoDBClient(clientConfig);
}
