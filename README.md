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
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mockClient } from "aws-sdk-vitest-mock";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

// Your application code
class DocumentService {
  constructor(private s3Client: S3Client) {}

  async getDocument(bucket: string, key: string) {
    const result = await this.s3Client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    return result.Body;
  }
}

describe("DocumentService", () => {
  let s3Mock: ReturnType<typeof mockClient>;
  let documentService: DocumentService;

  beforeEach(() => {
    // Mock the S3 client
    s3Mock = mockClient(S3Client);

    // Create service with real S3Client (which is now mocked)
    const s3Client = new S3Client({ region: "us-east-1" });
    documentService = new DocumentService(s3Client);
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test("should retrieve document from S3", async () => {
    // Configure mock response
    s3Mock.on(GetObjectCommand).resolves({
      Body: "document content",
      ContentType: "text/plain",
    });

    // Test your application code
    const result = await documentService.getDocument("my-bucket", "doc.txt");

    expect(result).toBe("document content");
    expect(s3Mock).toHaveReceivedCommand(GetObjectCommand);
  });
});
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

### Fixture Loading

Load mock responses from files for easier test data management:

```typescript
// Load JSON response from file
s3Mock.on(GetObjectCommand).resolvesFromFile("./fixtures/s3-response.json");

// Load text response from file
s3Mock.on(GetObjectCommand).resolvesFromFile("./fixtures/response.txt");

// JSON files are automatically parsed, text files returned as strings
// File paths are resolved relative to current working directory
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

### DynamoDB with Marshal/Unmarshal

Mock DynamoDB operations using AWS SDK's marshal/unmarshal utilities for type-safe data handling:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mockClient } from "aws-sdk-vitest-mock";
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

// Your application service
class UserService {
  constructor(private dynamoClient: DynamoDBClient) {}

  async getUser(userId: string) {
    const result = await this.dynamoClient.send(
      new GetItemCommand({
        TableName: "Users",
        Key: marshall({ id: userId }),
      }),
    );

    return result.Item ? unmarshall(result.Item) : null;
  }

  async createUser(user: { id: string; name: string; email: string }) {
    await this.dynamoClient.send(
      new PutItemCommand({
        TableName: "Users",
        Item: marshall(user),
      }),
    );
  }
}

describe("UserService with DynamoDB", () => {
  let dynamoMock: ReturnType<typeof mockClient>;
  let userService: UserService;

  beforeEach(() => {
    dynamoMock = mockClient(DynamoDBClient);
    const dynamoClient = new DynamoDBClient({ region: "us-east-1" });
    userService = new UserService(dynamoClient);
  });

  afterEach(() => {
    dynamoMock.restore();
  });

  test("should get user by id", async () => {
    const mockUser = { id: "123", name: "John Doe", email: "john@example.com" };

    // Mock DynamoDB response with marshalled data
    dynamoMock.on(GetItemCommand).resolves({
      Item: marshall(mockUser),
    });

    const result = await userService.getUser("123");

    expect(result).toEqual(mockUser);
    expect(dynamoMock).toHaveReceivedCommandWith(GetItemCommand, {
      TableName: "Users",
      Key: marshall({ id: "123" }),
    });
  });

  test("should create new user", async () => {
    const newUser = {
      id: "456",
      name: "Jane Smith",
      email: "jane@example.com",
    };

    dynamoMock.on(PutItemCommand).resolves({});

    await userService.createUser(newUser);

    expect(dynamoMock).toHaveReceivedCommandWith(PutItemCommand, {
      TableName: "Users",
      Item: marshall(newUser),
    });
  });

  test("should return null for non-existent user", async () => {
    dynamoMock.on(GetItemCommand).resolves({}); // No Item in response

    const result = await userService.getUser("999");

    expect(result).toBeNull();
  });
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
// Your application service that uses an injected S3 client
class FileUploadService {
  constructor(private s3Client: S3Client) {}

  async uploadFile(bucket: string, key: string, data: string) {
    return await this.s3Client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: data }),
    );
  }
}

test("should mock existing S3 client instance", async () => {
  // Create the client your application will use
  const s3Client = new S3Client({ region: "us-east-1" });
  const service = new FileUploadService(s3Client);

  // Mock the existing client instance
  const mock = mockClientInstance(s3Client);
  mock.on(PutObjectCommand).resolves({ ETag: "mock-etag" });

  // Test your service
  const result = await service.uploadFile("bucket", "key", "data");

  expect(result.ETag).toBe("mock-etag");
  expect(mock).toHaveReceivedCommand(PutObjectCommand);
});
```

### Debug Mode

Enable debug logging to troubleshoot mock configurations and see detailed information about command matching:

```typescript
const s3Mock = mockClient(S3Client);

// Enable debug logging
s3Mock.enableDebug();

s3Mock
  .on(GetObjectCommand, { Bucket: "test-bucket" })
  .resolves({ Body: "data" });

// This will log:
// [AWS Mock Debug] Received command: GetObjectCommand
// [AWS Mock Debug] Found 1 mock(s) for GetObjectCommand
// [AWS Mock Debug] Using mock at index 0 for GetObjectCommand
await client.send(
  new GetObjectCommand({ Bucket: "test-bucket", Key: "file.txt" }),
);

// Disable debug logging
s3Mock.disableDebug();
```

Debug mode logs include:

- Incoming commands and their inputs
- Number of configured mocks for each command
- Mock matching results and reasons for failures
- One-time mock removal notifications

## 🧪 Test Coverage

The library includes comprehensive test suites covering all features:

- **Core mocking functionality** - Command matching, response handling, sequential responses
- **Paginator support** - Automatic token handling for AWS pagination patterns
- **Debug logging** - Enable/disable functionality and proper console output formatting
- **Stream mocking** - S3 stream responses with environment detection
- **Error simulation** - AWS-specific errors and general error handling
- **Custom matchers** - Vitest integration for asserting command calls

All utilities have dedicated test files ensuring reliability and maintainability.

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
- `enableDebug()` - Enable debug logging for troubleshooting
- `disableDebug()` - Disable debug logging

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
- `resolvesFromFile(filePath)` - Load response from file (JSON files are parsed, others returned as strings)
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
