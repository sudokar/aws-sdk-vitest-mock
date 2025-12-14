<p align="center">
  <img src="logo.png" alt="aws-sdk-vitest-mock logo" width="180" />
</p>

<h1 align="center">AWS SDK Vitest Mock</h1>

<p align="center">
  A powerful, type-safe mocking library for AWS SDK v3 with Vitest
</p>

---

## ✨ Features

- 🎯 **Type-Safe Mocking** - Full TypeScript support with strict type checking
- 📦 **Zero Dependencies** - No extra dependencies
- 🔄 **Dual Module Support** - Works with both ESM and CommonJS
- 🎭 **Flexible Mocking** - Support for partial matching, strict matching, and custom handlers
- 🧩 **Chainable API** - Fluent interface for configuring multiple mock behaviors
- 🔍 **Custom Matchers** - Vitest matchers for asserting AWS SDK command calls

## 📦 Installation

```bash
bun add -D aws-sdk-vitest-mock
```

Or with other package managers:

```bash
npm install --save-dev aws-sdk-vitest-mock
```

```bash
yarn add -D aws-sdk-vitest-mock
```

```bash
pnpm add -D aws-sdk-vitest-mock
```

## 🚀 Quick Start

### Basic Usage

```typescript
import { mockClient } from "aws-sdk-vitest-mock";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

// Mock the S3 client
const s3Mock = mockClient(S3Client);

// Configure mock responses
s3Mock.on(GetObjectCommand).resolves({
  Body: "mock data",
  ContentType: "text/plain",
});

// Use in your tests
const client = new S3Client({});
const result = await client.send(
  new GetObjectCommand({
    Bucket: "my-bucket",
    Key: "my-key",
  }),
);

console.log(result.Body); // 'mock data'

// Clean up
s3Mock.restore();
```

### Request Matching

```typescript
// Partial matching (default)
s3Mock.on(GetObjectCommand, { Bucket: "bucket1" }).resolves({ Body: "data1" });

s3Mock.on(GetObjectCommand, { Bucket: "bucket2" }).resolves({ Body: "data2" });

// Strict matching
s3Mock
  .on(GetObjectCommand, { Bucket: "b", Key: "k" }, { strict: true })
  .resolves({ Body: "exact match" });
```

### Sequential Responses

```typescript
s3Mock
  .on(GetObjectCommand)
  .resolvesOnce({ Body: "first call" })
  .resolvesOnce({ Body: "second call" })
  .resolves({ Body: "subsequent calls" });

// First call returns 'first call'
// Second call returns 'second call'
// All other calls return 'subsequent calls'
```

### Paginator Support

Mock AWS SDK v3 pagination with automatic token handling:

```typescript
// Mock DynamoDB scan with pagination
const items = Array.from({ length: 25 }, (_, i) => ({
  id: { S: `item-${i + 1}` },
}));

dynamoMock.on(ScanCommand).resolvesPaginated(items, {
  pageSize: 10,
  itemsKey: "Items",
  tokenKey: "NextToken",
});

// First call returns items 1-10 with NextToken
// Second call with NextToken returns items 11-20
// Third call returns items 21-25 without NextToken

// Mock S3 list objects with pagination
const objects = Array.from({ length: 15 }, (_, i) => ({
  Key: `file-${i + 1}.txt`,
}));

s3Mock.on(ListObjectsV2Command).resolvesPaginated(objects, {
  pageSize: 10,
  itemsKey: "Contents",
  tokenKey: "ContinuationToken",
});
```

### Stream Mocking (S3 Helper)

Mock S3 operations that return streams with automatic environment detection:

```typescript
// Mock with string content
s3Mock.on(GetObjectCommand).resolvesStream("Hello, World!");

// Mock with Buffer
s3Mock.on(GetObjectCommand).resolvesStream(Buffer.from("Binary data"));

// One-time stream response
s3Mock
  .on(GetObjectCommand)
  .resolvesStreamOnce("First call")
  .resolvesStream("Subsequent calls");
```

### Delay/Latency Simulation

Simulate network delays for testing timeouts and race conditions:

```typescript
// Resolve with delay
s3Mock.on(GetObjectCommand).resolvesWithDelay({ Body: "data" }, 1000);

// Reject with delay
s3Mock.on(GetObjectCommand).rejectsWithDelay("Network timeout", 500);
```

### AWS Error Simulation

Convenient methods for common AWS errors:

```typescript
// S3 Errors
s3Mock.on(GetObjectCommand).rejectsWithNoSuchKey("missing-key");
s3Mock.on(GetObjectCommand).rejectsWithNoSuchBucket("missing-bucket");
s3Mock.on(GetObjectCommand).rejectsWithAccessDenied("protected-resource");

// DynamoDB Errors
dynamoMock.on(GetItemCommand).rejectsWithResourceNotFound("missing-table");
dynamoMock.on(PutItemCommand).rejectsWithConditionalCheckFailed();

// General AWS Errors
s3Mock.on(GetObjectCommand).rejectsWithThrottling();
s3Mock.on(GetObjectCommand).rejectsWithInternalServerError();
```

### Error Handling

```typescript
s3Mock.on(GetObjectCommand).rejects(new Error("Not found"));

// Or with rejectsOnce
s3Mock
  .on(GetObjectCommand)
  .rejectsOnce(new Error("Temporary failure"))
  .resolves({ Body: "success" });
```

### Custom Handlers

```typescript
s3Mock.on(GetObjectCommand).callsFake(async (input, getClient) => {
  const client = getClient();
  console.log("Bucket:", input.Bucket);
  return { Body: `Dynamic response for ${input.Key}` };
});
```

### Mocking Existing Instances

```typescript
const existingClient = new S3Client({ region: "us-east-1" });
const mock = mockClientInstance(existingClient);

mock.on(GetObjectCommand).resolves({ Body: "mocked" });

// The existing instance is now mocked
const result = await existingClient.send(
  new GetObjectCommand({
    Bucket: "b",
    Key: "k",
  }),
);
```

## 🧪 Custom Matchers

Import the custom matchers in your test setup:

```typescript
// vitest.setup.ts
import "aws-sdk-vitest-mock/vitest-setup";
```

Then use them in your tests:

```typescript
import { expect, test } from "vitest";
import { mockClient } from "aws-sdk-vitest-mock";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

test("should call DynamoDB", async () => {
  const ddbMock = mockClient(DynamoDBClient);
  ddbMock.on(GetItemCommand).resolves({ Item: { id: { S: "123" } } });

  const client = new DynamoDBClient({});
  await client.send(
    new GetItemCommand({
      TableName: "users",
      Key: { id: { S: "123" } },
    }),
  );

  // Assert the command was called
  expect(ddbMock).toHaveReceivedCommand(GetItemCommand);

  // Assert it was called a specific number of times
  expect(ddbMock).toHaveReceivedCommandTimes(GetItemCommand, 1);

  // Assert it was called with specific input
  expect(ddbMock).toHaveReceivedCommandWith(GetItemCommand, {
    TableName: "users",
    Key: { id: { S: "123" } },
  });

  // Assert the nth call had specific input
  expect(ddbMock).toHaveReceivedNthCommandWith(1, GetItemCommand, {
    TableName: "users",
  });

  // Assert no other commands were received
  expect(ddbMock).toHaveReceivedNoOtherCommands([GetItemCommand]);
});
```

## 📚 API Reference

### `mockClient<TClient>(ClientConstructor)`

Creates a mock for an AWS SDK client constructor.

**Returns:** `AwsClientStub<TClient>`

### `mockClientInstance<TClient>(clientInstance)`

Mocks an existing AWS SDK client instance.

**Returns:** `AwsClientStub<TClient>`

### `AwsClientStub` Methods

- `on(Command, matcher?, options?)` - Configure mock for a command
- `reset()` - Clear all mocks and call history
- `restore()` - Restore original client behavior
- `calls()` - Get call history

### `AwsCommandStub` Methods (Chainable)

- `resolves(output)` - Return successful response
- `resolvesOnce(output)` - Return successful response once
- `rejects(error)` - Return error
- `rejectsOnce(error)` - Return error once
- `callsFake(handler)` - Custom response handler
- `callsFakeOnce(handler)` - Custom response handler (once)
- `resolvesStream(data)` - Return stream response (S3 helper)
- `resolvesStreamOnce(data)` - Return stream response once (S3 helper)
- `resolvesWithDelay(output, delayMs)` - Return response with delay
- `rejectsWithDelay(error, delayMs)` - Return error with delay
- `resolvesPaginated(items, options?)` - Return paginated responses with automatic token handling
- `rejectsWithNoSuchKey(key?)` - Reject with S3 NoSuchKey error
- `rejectsWithNoSuchBucket(bucket?)` - Reject with S3 NoSuchBucket error
- `rejectsWithAccessDenied(resource?)` - Reject with AccessDenied error
- `rejectsWithResourceNotFound(resource?)` - Reject with DynamoDB ResourceNotFound error
- `rejectsWithConditionalCheckFailed()` - Reject with DynamoDB ConditionalCheckFailed error
- `rejectsWithThrottling()` - Reject with Throttling error
- `rejectsWithInternalServerError()` - Reject with InternalServerError

## 🤝 Contributing

We welcome contributions! 🎉 Please read our [Contributing Guidelines](./CONTRIBUTING.md) for details on:

- 🐛 Reporting bugs
- 💡 Suggesting features
- 🔧 Development setup
- ✅ Code standards
- 📝 Commit guidelines
- 🚀 Pull request process

### Quick Start for Contributors

```bash
# Fork and clone the repo
git clone https://github.com/YOUR-USERNAME/aws-sdk-vitest-mock.git
cd aws-sdk-vitest-mock

# Install dependencies
bun install

# Run tests
bun nx test

# Run linting
bun nx lint

# Build the library
bun nx build

# Make your changes and submit a PR!
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the complete guide.

## 📝 License

MIT

## 🔗 Links

- [GitHub Repository](https://github.com/sudokar/aws-sdk-vitest-mock)
- [Issue Tracker](https://github.com/sudokar/aws-sdk-vitest-mock/issues)
- [Changelog](https://github.com/sudokar/aws-sdk-vitest-mock/releases)

---

**Made with ❤️ by [sudokar](https://github.com/sudokar)**
