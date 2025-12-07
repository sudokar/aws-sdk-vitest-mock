import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { expect, test, beforeEach } from 'vitest';
import { mockClient } from './mock-client.js';
import './vitest-setup';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

test('toHaveReceivedCommand', async () => {
  ddbMock.on(GetCommand).resolves({});
  const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
  const client = DynamoDBDocumentClient.from(ddbClient);
  await client.send(new GetCommand({ TableName: 'test', Key: { id: '1' } }));
  expect(ddbMock).toHaveReceivedCommand(GetCommand);
});

test('toHaveReceivedCommandTimes', async () => {
  ddbMock.on(GetCommand).resolves({});
  const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
  const client = DynamoDBDocumentClient.from(ddbClient);
  await client.send(new GetCommand({ TableName: 'test', Key: { id: '1' } }));
  await client.send(new GetCommand({ TableName: 'test', Key: { id: '2' } }));
  expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 2);
});

test('toHaveReceivedCommandWith', async () => {
  ddbMock.on(GetCommand).resolves({});
  const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
  const client = DynamoDBDocumentClient.from(ddbClient);
  await client.send(new GetCommand({ TableName: 'test', Key: { id: '1' } }));
  expect(ddbMock).toHaveReceivedCommandWith(GetCommand, { TableName: 'test', Key: { id: '1' } });
});

test('toHaveReceivedNthCommandWith', async () => {
  ddbMock.on(GetCommand).resolves({});
  const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
  const client = DynamoDBDocumentClient.from(ddbClient);
  await client.send(new GetCommand({ TableName: 'test', Key: { id: '1' } }));
  await client.send(new GetCommand({ TableName: 'test', Key: { id: '2' } }));
  expect(ddbMock).toHaveReceivedNthCommandWith(2, GetCommand, { TableName: 'test', Key: { id: '2' } });
});
