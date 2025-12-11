import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand, GetObjectCommandInput, GetObjectCommandOutput } from '@aws-sdk/client-s3';
import { expect, test, beforeEach, afterEach, describe } from 'vitest';
import { mockClient, mockClientInstance, AwsClientStub } from './mock-client.js';

describe('mockClient', () => {
  let s3Mock: AwsClientStub<S3Client>;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test('should mock S3Client send method', async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: 'test data' as unknown as GetObjectCommandOutput['Body'] });

    const client = new S3Client({});
    const result = await client.send(new GetObjectCommand({ Bucket: 'test', Key: 'test.txt' }));

    expect(result.Body).toBe('test data');
  });

  test('should support request matching', async () => {
    s3Mock.on(GetObjectCommand, { Bucket: 'bucket1' }).resolves({ Body: 'data1' as unknown as GetObjectCommandOutput['Body'] });
    s3Mock.on(GetObjectCommand, { Bucket: 'bucket2' }).resolves({ Body: 'data2' as unknown as GetObjectCommandOutput['Body'] });

    const client = new S3Client({});
    const result1 = await client.send(new GetObjectCommand({ Bucket: 'bucket1', Key: 'test.txt' }));
    const result2 = await client.send(new GetObjectCommand({ Bucket: 'bucket2', Key: 'test.txt' }));

    expect(result1.Body).toBe('data1');
    expect(result2.Body).toBe('data2');
  });

  test('should support partial request matching', async () => {
    s3Mock.on(PutObjectCommand, { Bucket: 'my-bucket', Key: 'file.txt' }).resolves({ ETag: 'abc123' });

    const client = new S3Client({});
    const result = await client.send(
      new PutObjectCommand({
        Bucket: 'my-bucket',
        Key: 'file.txt',
        Body: 'some content',
        ContentType: 'text/plain'
      })
    );

    expect(result.ETag).toBe('abc123');
  });

  test('should reject with error', async () => {
    s3Mock.on(GetObjectCommand).rejects(new Error('Not found'));

    const client = new S3Client({});
    await expect(client.send(new GetObjectCommand({ Bucket: 'test', Key: 'missing.txt' }))).rejects.toThrow('Not found');
  });
});

describe('resolvesOnce / rejectsOnce', () => {
  let s3Mock: AwsClientStub<S3Client>;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test('should consume resolvesOnce in order before falling back to resolves', async () => {
    s3Mock
      .on(GetObjectCommand)
      .resolvesOnce({ Body: 'first' as unknown as GetObjectCommandOutput['Body'] })
      .resolvesOnce({ Body: 'second' as unknown as GetObjectCommandOutput['Body'] })
      .resolves({ Body: 'default' as unknown as GetObjectCommandOutput['Body'] });

    const client = new S3Client({});
    const result1 = await client.send(new GetObjectCommand({ Bucket: 'test', Key: 'test.txt' }));
    const result2 = await client.send(new GetObjectCommand({ Bucket: 'test', Key: 'test.txt' }));
    const result3 = await client.send(new GetObjectCommand({ Bucket: 'test', Key: 'test.txt' }));
    const result4 = await client.send(new GetObjectCommand({ Bucket: 'test', Key: 'test.txt' }));

    expect(result1.Body).toBe('first');
    expect(result2.Body).toBe('second');
    expect(result3.Body).toBe('default');
    expect(result4.Body).toBe('default');
  });

  test('should consume rejectsOnce then fall back to resolves', async () => {
    s3Mock
      .on(GetObjectCommand)
      .rejectsOnce(new Error('Temporary failure'))
      .resolves({ Body: 'success' as unknown as GetObjectCommandOutput['Body'] });

    const client = new S3Client({});

    await expect(client.send(new GetObjectCommand({ Bucket: 'test', Key: 'test.txt' }))).rejects.toThrow('Temporary failure');
    const result = await client.send(new GetObjectCommand({ Bucket: 'test', Key: 'test.txt' }));
    expect(result.Body).toBe('success');
  });

  test('should support chainable API', async () => {
    const stub = s3Mock.on(GetObjectCommand);

    // Chain multiple calls
    const returned = stub
      .resolvesOnce({ Body: 'a' as unknown as GetObjectCommandOutput['Body'] })
      .resolvesOnce({ Body: 'b' as unknown as GetObjectCommandOutput['Body'] })
      .rejectsOnce(new Error('temp error'))
      .resolves({ Body: 'final' as unknown as GetObjectCommandOutput['Body'] });

    // Should return the same stub for chaining
    expect(returned).toBe(stub);
  });

  test('should support callsFakeOnce', async () => {
    let callCount = 0;

    s3Mock
      .on(GetObjectCommand)
      .callsFakeOnce(async () => {
        callCount++;
        return { Body: `call-${callCount}` as unknown as GetObjectCommandOutput['Body'], $metadata: {} } as GetObjectCommandOutput;
      })
      .callsFake(async () => {
        return { Body: 'permanent' as unknown as GetObjectCommandOutput['Body'], $metadata: {} } as GetObjectCommandOutput;
      });

    const client = new S3Client({});
    const result1 = await client.send(new GetObjectCommand({ Bucket: 'test', Key: 'test.txt' }));
    const result2 = await client.send(new GetObjectCommand({ Bucket: 'test', Key: 'test.txt' }));

    expect(result1.Body).toBe('call-1');
    expect(result2.Body).toBe('permanent');
    expect(callCount).toBe(1);
  });
});

describe('mockClientInstance', () => {
  test('should mock an existing client instance', async () => {
    const clientInstance = new S3Client({});
    const mock = mockClientInstance(clientInstance);

    mock.on(GetObjectCommand).resolves({ Body: 'instance data' as unknown as GetObjectCommandOutput['Body'] });

    const result = await clientInstance.send(new GetObjectCommand({ Bucket: 'test', Key: 'test.txt' }));
    expect(result.Body).toBe('instance data');

    mock.restore();
  });

  test('should support resolvesOnce on client instance', async () => {
    const clientInstance = new S3Client({});
    const mock = mockClientInstance(clientInstance);

    mock
      .on(GetObjectCommand)
      .resolvesOnce({ Body: 'first' as unknown as GetObjectCommandOutput['Body'] })
      .resolves({ Body: 'default' as unknown as GetObjectCommandOutput['Body'] });

    const result1 = await clientInstance.send(new GetObjectCommand({ Bucket: 'test', Key: 'test.txt' }));
    const result2 = await clientInstance.send(new GetObjectCommand({ Bucket: 'test', Key: 'test.txt' }));

    expect(result1.Body).toBe('first');
    expect(result2.Body).toBe('default');

    mock.restore();
  });

  test('should track calls for instance', async () => {
    const clientInstance = new S3Client({});
    const mock = mockClientInstance(clientInstance);

    mock.on(GetObjectCommand).resolves({ Body: 'data' as unknown as GetObjectCommandOutput['Body'] });

    await clientInstance.send(new GetObjectCommand({ Bucket: 'bucket1', Key: 'key1.txt' }));
    await clientInstance.send(new GetObjectCommand({ Bucket: 'bucket2', Key: 'key2.txt' }));

    const calls = mock.calls();
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBeInstanceOf(GetObjectCommand);

    mock.restore();
  });
});

describe('strict matching', () => {
  let s3Mock: AwsClientStub<S3Client>;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test('should match exact input with strict: true', async () => {
    s3Mock.on(GetObjectCommand, { Bucket: 'b', Key: 'k' }, { strict: true }).resolves({ Body: 'strict' as unknown as GetObjectCommandOutput['Body'] });

    const client = new S3Client({ region: 'us-east-1' });
    const result = await client.send(new GetObjectCommand({ Bucket: 'b', Key: 'k' }));
    expect(result.Body).toBe('strict');
  });

  test('should not match if input has extra properties with strict: true', async () => {
    s3Mock.on(GetObjectCommand, { Bucket: 'b' }, { strict: true }).resolves({ Body: 'strict' as unknown as GetObjectCommandOutput['Body'] });

    const client = new S3Client({ region: 'us-east-1' });
    await expect(client.send(new GetObjectCommand({ Bucket: 'b', Key: 'k' })))
      .rejects.toThrow('No mock configured for command: GetObjectCommand');
  });
});

describe('client access in handler', () => {
  let s3Mock: AwsClientStub<S3Client>;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test('callsFake should receive getClient', async () => {
    let capturedClient: S3Client | undefined;
    s3Mock.on(GetObjectCommand).callsFake(async (input, getClient) => {
      capturedClient = getClient() as S3Client;
      return { Body: 'ok' as unknown as GetObjectCommandOutput['Body'], $metadata: {} } as GetObjectCommandOutput;
    });

    const client = new S3Client({ region: 'us-east-1' });
    await client.send(new GetObjectCommand({ Bucket: 'b', Key: 'k' }));

    expect(capturedClient).toBe(client);
  });

  test('callsFake on instance mock should receive client instance', async () => {
    const clientInstance = new S3Client({});
    const mock = mockClientInstance(clientInstance);

    let capturedClient: unknown;
    mock.on(GetObjectCommand).callsFake(async (input, getClient) => {
      capturedClient = getClient();
      return { Body: 'ok' as unknown as GetObjectCommandOutput['Body'], $metadata: {} } as GetObjectCommandOutput;
    });

    await clientInstance.send(new GetObjectCommand({ Bucket: 'b', Key: 'k' }));
    expect(capturedClient).toBe(clientInstance);

    mock.restore();
  });

  test('callsFakeOnce should allow accessing client instance', async () => {
    const client = new S3Client({ region: 'us-east-1' });
    const mock = mockClientInstance(client);

    mock.on(GetObjectCommand).callsFakeOnce(async (input: GetObjectCommandInput, getClient) => {
      const c = getClient?.() as S3Client;
      expect(c).toBe(client);
      expect(await c?.config.region()).toBe('us-east-1');
      return { Body: 'client-access-once' as unknown as GetObjectCommandOutput['Body'], $metadata: {} } as GetObjectCommandOutput;
    });

    const response = await client.send(new GetObjectCommand({ Bucket: 'b', Key: 'k' }));
    expect(response.Body).toBe('client-access-once');
  });

  test('callsFake should allow accessing client instance', async () => {
    const client = new S3Client({ region: 'us-east-1' });
    const mock = mockClientInstance(client);

    mock.on(GetObjectCommand).callsFake(async (input: GetObjectCommandInput, getClient) => {
      const c = getClient?.() as S3Client;
      expect(c).toBe(client);
      expect(await c?.config.region()).toBe('us-east-1');
      return { Body: 'client-access' as unknown as GetObjectCommandOutput['Body'], $metadata: {} } as GetObjectCommandOutput;
    });

    const response = await client.send(new GetObjectCommand({ Bucket: 'b', Key: 'k' }));
    expect(response.Body).toBe('client-access');
  });
});

describe('multiple clients', () => {
  test('should support mocking multiple clients independently', async () => {
    const s3Mock = mockClient(S3Client);
    const ddbMock = mockClient(DynamoDBClient);

    s3Mock.on(GetObjectCommand).resolves({ Body: 's3-data' as unknown as GetObjectCommandOutput['Body'] });
    ddbMock.on(GetItemCommand).resolves({ Item: { id: { S: 'ddb-data' } } });

    const s3 = new S3Client({});
    const ddb = new DynamoDBClient({});

    const s3Response = await s3.send(new GetObjectCommand({ Bucket: 'b', Key: 'k' }));
    const ddbResponse = await ddb.send(new GetItemCommand({ TableName: 't', Key: { id: { S: '1' } } }));

    expect(s3Response.Body).toBe('s3-data');
    expect(ddbResponse.Item).toEqual({ id: { S: 'ddb-data' } });

    s3Mock.restore();
    ddbMock.restore();
  });

  test('should throw error if command is not mocked (and crash if bug exists)', async () => {
    mockClient(S3Client);
    const client = new S3Client({});
    // We don't call s3Mock.on(PutObjectCommand)
    await expect(client.send(new PutObjectCommand({ Bucket: 'b', Key: 'k' })))
      .rejects.toThrow('No mock configured for command: PutObjectCommand');
  });
});
