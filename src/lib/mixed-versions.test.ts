import { S3Client, GetObjectCommandOutput } from '@aws-sdk/client-s3';
import type { Handler, MiddlewareStack } from '@smithy/types';
import { expect, test, beforeEach, afterEach, describe } from 'vitest';
import { mockClient, AwsClientStub } from './mock-client.js';

// A fake command that mimics an AWS SDK command but doesn't inherit from the same base
// This simulates a command from a different version of @aws-sdk/client-s3
// or a different @smithy/types version
const fakeHandler = () => Promise.resolve({ output: {}, response: {} as any });

class FakeCommand {
  readonly input: object;
  middlewareStack: MiddlewareStack<any, any>;

  constructor(input: object) {
    this.input = input;
    this.middlewareStack = {} as any;
  }

  resolveMiddleware(): Handler<any, any> {
    return fakeHandler;
  }
}

describe('mixed @smithy/types versions', () => {
  let s3Mock: AwsClientStub<S3Client>;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test('should support mocking a command that is structurally compatible but not an instance of the same Command class', async () => {
    s3Mock.on(FakeCommand).resolves({ Body: 'mixed-version-success' });

    const client = new S3Client({});

    // We have to cast because S3Client expects its own Command type
    // In a real mixed-version scenario, this cast happens implicitly or via library boundaries
    const result = await client.send(new FakeCommand({}) as unknown as Parameters<S3Client['send']>[0]) as GetObjectCommandOutput;

    expect(result.Body).toBe('mixed-version-success');
  });
});
