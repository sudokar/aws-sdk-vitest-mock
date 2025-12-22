<p align="center">
  <img src="logo.png" alt="aws-sdk-vitest-mock logo" width="180" />
</p>

<h1 align="center">AWS SDK Vitest Mock</h1>

<p align="center">
  A powerful, type-safe mocking library for AWS SDK v3 with Vitest
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/aws-sdk-vitest-mock">
    <img src="https://img.shields.io/npm/v/aws-sdk-vitest-mock?color=cb3837&logo=npm" alt="npm version" />
  </a>
  <img alt="NPM Downloads" src="https://img.shields.io/npm/dm/aws-sdk-vitest-mock">
  <img alt="GitHub Issues or Pull Requests" src="https://img.shields.io/github/issues/sudokar/aws-sdk-vitest-mock">
  <a href="https://github.com/sudokar/aws-sdk-vitest-mock/actions">
      <img src="https://github.com/sudokar/aws-sdk-vitest-mock/actions/workflows/ci.yml/badge.svg" alt="CI Status" />
  </a>
  <br />
  <img src="https://img.shields.io/badge/ESM%20Support-yes-4B32C3?logo=typescript" alt="ESM Support" />
  <img src="https://img.shields.io/badge/Zero%20Dependencies-yes-brightgreen" alt="Zero Dependencies" />
  <a href="https://eslint.org/">
    <img src="https://img.shields.io/badge/code%20style-eslint-4B32C3?logo=eslint" alt="ESLint" />
  </a>
  <a href="https://prettier.io/">
    <img src="https://img.shields.io/badge/code%20style-prettier-F7B93E?logo=prettier" alt="Prettier" />
  </a>
  <img src="https://img.shields.io/badge/Maintained-yes-brightgreen" alt="Maintained: Yes" />
</p>

---

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/8b04ee545dae4f0cb543f58a464cbe45)](https://app.codacy.com/gh/sudokar/aws-sdk-vitest-mock?utm_source=github.com&utm_medium=referral&utm_content=sudokar/aws-sdk-vitest-mock&utm_campaign=Badge_Grade)

## ✨ Features

- 🎯 **Type-Safe Mocking** - Full TypeScript support with strict type checking
- 📦 **Zero Dependencies** - No extra dependencies
- 🔄 **Dual Module Support** - Works with both ESM and CommonJS
- 🎭 **Flexible Mocking** - Support for partial matching, strict matching, and custom handlers
- 🧩 **Chainable API** - Fluent interface for configuring multiple mock behaviors
- 🔍 **Custom Matchers** - Vitest matchers for asserting AWS SDK command calls
- 📚 **Comprehensive API Docs** – [Read the full documentation here](https://sudokar.github.io/aws-sdk-vitest-mock/)

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

> **Note:** `mockClient()` mocks **all instances** of a client class. Use `mockClientInstance()` when you need to mock a specific instance.

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
    // Mock all instances of S3Client
    s3Mock = mockClient(S3Client);

    // Any S3Client instance created after this will be mocked
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

## 🎯 Key Concepts

Understanding these concepts will help you use the library effectively:

- **`mockClient(ClientClass)`** - Mocks **all instances** of a client class. Use this in most test scenarios where you control client creation.
- **`mockClientInstance(instance)`** - Mocks a **specific client instance**. Use when the client is created outside your test (e.g., in application bootstrap).
- **Command Matching** - Commands are matched by constructor. Optionally match by input properties (partial matching by default, strict matching available).
- **Sequential Responses** - Use `resolvesOnce()` / `rejectsOnce()` for one-time behaviors that fall back to permanent handlers set with `resolves()` / `rejects()`.
- **Chainable API** - All mock configuration methods return the stub, allowing method chaining for cleaner test setup.
- **Test Lifecycle**:
  - **`reset()`** - Clears call history while preserving mock configurations. Use when you want to verify multiple test scenarios with the same mock setup.
  - **`restore()`** - Completely removes mocking and restores original client behavior. Use in `afterEach()` to clean up between tests.

## 📖 Usage Guide

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

Use `mockClientInstance()` when you need to mock a client that's already been created:

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
  // Client is already created (e.g., in application bootstrap)
  const s3Client = new S3Client({ region: "us-east-1" });
  const service = new FileUploadService(s3Client);

  // Mock the specific client instance
  const mock = mockClientInstance(s3Client);
  mock.on(PutObjectCommand).resolves({ ETag: "mock-etag" });

  // Test your service
  const result = await service.uploadFile("bucket", "key", "data");

  expect(result.ETag).toBe("mock-etag");
  expect(mock).toHaveReceivedCommand(PutObjectCommand);
});
```

### Test Lifecycle Management

Use `reset()` to clear call history between assertions while keeping mock configurations. Use `restore()` to completely clean up mocking:

```typescript
test("should handle multiple operations with same mock", async () => {
  const s3Mock = mockClient(S3Client);
  const client = new S3Client({});

  // Configure mock once
  s3Mock.on(GetObjectCommand).resolves({ Body: "file-content" });

  // First operation
  await client.send(
    new GetObjectCommand({ Bucket: "bucket", Key: "file1.txt" }),
  );
  expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 1);

  // Reset clears call history but keeps mock configuration
  s3Mock.reset();
  expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 0);

  // Second operation - mock still works
  await client.send(
    new GetObjectCommand({ Bucket: "bucket", Key: "file2.txt" }),
  );
  expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 1);

  // Clean up completely
  s3Mock.restore();
});
```

## 🔧 AWS Service Examples

### DynamoDB with Marshal/Unmarshal

Mock DynamoDB operations using marshal/unmarshal utilities for type-safe data handling:

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

## 🚀 Advanced Features

### Stream Mocking (S3)

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

### Paginator Support

Mock AWS SDK v3 pagination with automatic token handling. **Tokens are the actual last item from each page** (works for both DynamoDB and S3).

#### DynamoDB Pagination

```typescript
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';

// Create marshalled items (as they would be stored in DynamoDB)
const users = [
  { id: "user-1", name: "Alice", email: "alice@example.com" },
  { id: "user-2", name: "Bob", email: "bob@example.com" },
  { id: "user-3", name: "Charlie", email: "charlie@example.com" },
];

const marshalledUsers = users.map(user => marshall(user));

// Configure pagination
dynamoMock.on(ScanCommand).resolvesPaginated(marshalledUsers, {
  pageSize: 1,
  itemsKey: "Items",
  tokenKey: "LastEvaluatedKey",      // DynamoDB response key
  inputTokenKey: "ExclusiveStartKey"  // DynamoDB request key
});

// Page 1: Get first user
const page1 = await client.send(new ScanCommand({ TableName: "Users" }));
expect(page1.Items).toHaveLength(1);
// LastEvaluatedKey is the marshalled last item (object, not string!)
expect(page1.LastEvaluatedKey).toEqual(marshall({ id: "user-1", name: "Alice", ... }));

// Unmarshall the items
const page1Users = page1.Items.map(item => unmarshall(item));
console.log(page1Users[0]); // { id: "user-1", name: "Alice", ... }

// Page 2: Use LastEvaluatedKey to get next page
const page2 = await client.send(
  new ScanCommand({
    TableName: "Users",
    ExclusiveStartKey: page1.LastEvaluatedKey, // Pass the object directly
  })
);

// Page 3: Continue until LastEvaluatedKey is undefined
const page3 = await client.send(
  new ScanCommand({
    TableName: "Users",
    ExclusiveStartKey: page2.LastEvaluatedKey,
  })
);
expect(page3.LastEvaluatedKey).toBeUndefined(); // No more pages
```

#### S3 Pagination

```typescript
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const objects = Array.from({ length: 100 }, (_, i) => ({
  Key: `file-${i + 1}.txt`,
  Size: 1024,
  LastModified: new Date(),
}));

s3Mock.on(ListObjectsV2Command).resolvesPaginated(objects, {
  pageSize: 50,
  itemsKey: "Contents",
  tokenKey: "NextContinuationToken",
  inputTokenKey: "ContinuationToken"
});

// First page
const page1 = await client.send(
  new ListObjectsV2Command({ Bucket: "my-bucket" })
);
expect(page1.Contents).toHaveLength(50);
// NextContinuationToken is the last object from page 1
expect(page1.NextContinuationToken).toEqual({ Key: "file-50.txt", ... });

// Second page
const page2 = await client.send(
  new ListObjectsV2Command({
    Bucket: "my-bucket",
    ContinuationToken: page1.NextContinuationToken,
  })
);
expect(page2.Contents).toHaveLength(50);
expect(page2.NextContinuationToken).toBeUndefined(); // No more pages
```

**Pagination Options:**

- `pageSize` - Number of items per page (default: 10)
- `itemsKey` - Property name for items array in response (default: "Items")
- `tokenKey` - Property name for pagination token in response (default: "NextToken")
  - DynamoDB: use `"LastEvaluatedKey"`
  - S3: use `"NextContinuationToken"`
- `inputTokenKey` - Property name for pagination token in request (defaults to same as tokenKey)
  - DynamoDB: use `"ExclusiveStartKey"`
  - S3: use `"ContinuationToken"`

**How It Works:**

The mock automatically uses the **last item from each page** as the pagination token. This means:

- ✅ For DynamoDB: `LastEvaluatedKey` is a proper object (can be unmarshalled)
- ✅ For S3: `NextContinuationToken` is the last object
- ✅ Tokens represent actual data, not opaque strings
- ✅ Works correctly with `unmarshall()` for DynamoDB
  - Use this when AWS service uses different names for input/output tokens (e.g., DynamoDB's `ExclusiveStartKey` vs `LastEvaluatedKey`)

### AWS Error Simulation

Convenient helper methods for common AWS errors:

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

### Delay/Latency Simulation

Simulate network delays for testing timeouts and race conditions:

```typescript
// Resolve with delay
s3Mock.on(GetObjectCommand).resolvesWithDelay({ Body: "data" }, 1000);

// Reject with delay
s3Mock.on(GetObjectCommand).rejectsWithDelay("Network timeout", 500);
```

### Fixture Loading

Load mock responses from files for easier test data management:

```typescript
// Load JSON response from file (automatically parsed)
s3Mock.on(GetObjectCommand).resolvesFromFile("./fixtures/s3-response.json");

// Load text response from file (returned as string)
s3Mock.on(GetObjectCommand).resolvesFromFile("./fixtures/response.txt");
```

### Debug Mode

Enable debug logging to see detailed information about mock configuration, lifecycle events, and command interactions:

```typescript
const s3Mock = mockClient(S3Client);

// Enable debug logging
s3Mock.enableDebug();

// Configuration logs appear immediately:
// [aws-sdk-vitest-mock](Debug) Configured resolves for GetObjectCommand
// {
//   "matcher": {
//     "Bucket": "test-bucket"
//   },
//   "strict": false
// }
s3Mock
  .on(GetObjectCommand, { Bucket: "test-bucket" })
  .resolves({ Body: "data" });

// Interaction logs appear when commands are sent:
// [aws-sdk-vitest-mock](Debug) Received command: GetObjectCommand
// {
//   "Bucket": "test-bucket",
//   "Key": "file.txt"
// }
// [aws-sdk-vitest-mock](Debug) Found 1 mock(s) for GetObjectCommand
// [aws-sdk-vitest-mock](Debug) Using mock at index 0 for GetObjectCommand
await client.send(
  new GetObjectCommand({ Bucket: "test-bucket", Key: "file.txt" }),
);

// Lifecycle logs:
// [aws-sdk-vitest-mock](Debug) Clearing call history (mocks preserved)
s3Mock.reset();

// [aws-sdk-vitest-mock](Debug) Restoring original client behavior and clearing all mocks
s3Mock.restore();

// Disable debug logging
s3Mock.disableDebug();
```

#### Global Debug Configuration

Enable debug logging for all mocks globally, with the ability to override at the individual mock level:

```typescript
import { setGlobalDebug, mockClient } from "aws-sdk-vitest-mock";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

// Enable debug for all mocks
setGlobalDebug(true);

// All mocks will inherit the global debug setting
const s3Mock = mockClient(S3Client);
const dynamoMock = mockClient(DynamoDBClient);

// Both mocks will log debug information
s3Mock.on(GetObjectCommand).resolves({ Body: "data" });
dynamoMock.on(GetItemCommand).resolves({ Item: { id: { S: "1" } } });

// Override global setting for a specific mock
s3Mock.disableDebug(); // This mock won't log, but dynamoMock still will

// Disable global debug
setGlobalDebug(false);
```

**Debug Priority (highest to lowest):**

1. Individual mock's `enableDebug()` or `disableDebug()` call (explicit override)
2. Global debug setting via `setGlobalDebug()`
3. Default: disabled

**Key behaviors:**

- When global debug is enabled, all new and existing mocks will log unless explicitly disabled
- Individual mock settings always take priority over global settings
- `reset()` preserves individual debug settings
- Global debug can be changed at any time and affects all mocks without explicit settings

Debug mode provides comprehensive logging for:

**Mock Configuration:**

- Mock setup with `.on()`, `.resolves()`, `.rejects()`, `.callsFake()`, etc.
- Matcher details and strict mode settings
- Paginated response configuration
- File-based fixture loading

**Mock Interactions:**

- Incoming commands and their inputs
- Number of configured mocks for each command
- Mock matching results and reasons for failures
- One-time mock removal notifications

**Lifecycle Events:**

- Reset operations (clearing call history)
- Restore operations (removing all mocks)

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

> TypeScript documentation for this library can be found at [here](https://sudokar.github.io/aws-sdk-vitest-mock/)

### `mockClient<TClient>(ClientConstructor)`

Creates a mock for an AWS SDK client constructor.

**Returns:** `AwsClientStub<TClient>`

### `mockClientInstance<TClient>(clientInstance)`

Mocks an existing AWS SDK client instance.

**Returns:** `AwsClientStub<TClient>`

### Global Debug Functions

- `setGlobalDebug(enabled: boolean)` - Enable or disable debug logging globally for all mocks

### `AwsClientStub` Methods

- `on(Command, matcher?, options?)` - Configure mock for a command
- `reset()` - Clear call history while preserving mock configurations
- `restore()` - Restore original client behavior
- `calls()` - Get call history
- `enableDebug()` - Enable debug logging for troubleshooting (overrides global setting)
- `disableDebug()` - Disable debug logging (overrides global setting)

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

## Acknowledgements

This library is based on the core ideas and API patterns introduced by [aws-sdk-client-mock](https://github.com/m-radzikowski/aws-sdk-client-mock), which is no longer actively maintained.

It reimagines those concepts for Vitest, while extending them with additional features, improved ergonomics, and ongoing maintenance.

## 📝 License

MIT

## 🔗 Links

- [GitHub Repository](https://github.com/sudokar/aws-sdk-vitest-mock)
- [Issue Tracker](https://github.com/sudokar/aws-sdk-vitest-mock/issues)
- [Changelog](https://github.com/sudokar/aws-sdk-vitest-mock/releases)

---

**Made with ❤️ by [sudokar](https://github.com/sudokar)**
