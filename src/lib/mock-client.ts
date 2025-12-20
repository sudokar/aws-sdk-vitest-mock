import type {
  Command as SmithyCommand,
  SmithyResolvedConfiguration,
} from "@smithy/smithy-client";
import type { HttpHandlerOptions, MetadataBearer } from "@smithy/types";
import { type Mock, vi } from "vitest";
import {
  createNoSuchKeyError,
  createNoSuchBucketError,
  createAccessDeniedError,
  createResourceNotFoundError,
  createConditionalCheckFailedError,
  createThrottlingError,
  createInternalServerError,
} from "./utils/aws-errors.js";
import {
  createDebugLogger,
  enableDebug,
  disableDebug,
  type DebugLogger,
} from "./utils/debug-logger.js";
import { loadFixture } from "./utils/file-helpers.js";
import {
  createPaginatedResponses,
  type PaginatorOptions,
} from "./utils/paginator-helpers.js";
import { createStream, type StreamInput } from "./utils/stream-helpers.js";

// Global debug state
let globalDebugEnabled = false;

/**
 * Set global debug mode for all mocks.
 * When enabled, all mocks will log debug information unless explicitly disabled at the mock level.
 *
 * @param enabled - Whether to enable debug logging globally
 *
 * @example
 * ```typescript
 * import { setGlobalDebug, mockClient } from 'aws-sdk-vitest-mock';
 * import { S3Client } from '@aws-sdk/client-s3';
 *
 * // Enable debug for all mocks
 * setGlobalDebug(true);
 *
 * const s3Mock = mockClient(S3Client); // Automatically has debug enabled
 *
 * // Disable debug for a specific mock
 * s3Mock.disableDebug(); // This mock won't log, but others will
 * ```
 */
export function setGlobalDebug(enabled: boolean): void {
  globalDebugEnabled = enabled;
}

/**
 * Determine the effective debug state for a logger.
 * Individual explicit settings take priority over global settings.
 *
 * @param logger - The debug logger to check
 * @returns Whether debug should be enabled
 */
function getEffectiveDebugState(logger: DebugLogger): boolean {
  if (logger.explicitlySet) {
    return logger.enabled; // Explicit individual setting wins
  }
  return globalDebugEnabled; // Fall back to global setting
}

// Use the Smithy Command type so we can preserve concrete input/output when mocking.
export type StructuralCommand<
  TInput extends object,
  TOutput extends MetadataBearer,
> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | SmithyCommand<TInput, TOutput, any, any, any>
  | {
      readonly input: TInput;
      readonly __awsSdkVitestMockOutput?: TOutput;
    };

export type CommandConstructor<
  TInput extends object,
  TOutput extends MetadataBearer,
> = new (input: TInput) => StructuralCommand<TInput, TOutput>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AwsCommandConstructor = CommandConstructor<any, MetadataBearer>;

export type CommandInputType<TCtor extends AwsCommandConstructor> =
  ConstructorParameters<TCtor>[0];

export type CommandOutputType<TCtor extends AwsCommandConstructor> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  InstanceType<TCtor> extends StructuralCommand<any, infer TOutput>
    ? TOutput
    : MetadataBearer;

export type AnyClient = {
  send(command: AwsSdkCommand): Promise<MetadataBearer>;
  config:
    | SmithyResolvedConfiguration<HttpHandlerOptions>
    | Record<string, unknown>;
};

export type AwsSdkCommand = StructuralCommand<object, MetadataBearer>;

// Allow protected constructors by accepting prototype property directly if needed
export type ClientConstructor<TClient extends AnyClient> =
  | (abstract new (...args: unknown[]) => TClient)
  | { prototype: TClient };

type CommandHandler<
  TInput extends object = object,
  TOutput extends MetadataBearer = MetadataBearer,
  TClient extends AnyClient = AnyClient,
> = (
  input: TInput,
  clientInstance: TClient | undefined,
) => Promise<Partial<TOutput>>;

interface MockEntry<
  TInput extends object = object,
  TOutput extends MetadataBearer = MetadataBearer,
> {
  matcher?: Partial<TInput>;
  handler: CommandHandler<TInput, TOutput>;
  once: boolean;
  strict: boolean;
}

interface MockOptions {
  strict?: boolean;
}

function matchesPartial<T extends object>(
  input: T,
  matcher: Partial<T>,
): boolean {
  return Object.keys(matcher).every((key) => {
    const matcherValue = matcher[key as keyof T];
    const inputValue = input[key as keyof T];

    if (
      matcherValue &&
      typeof matcherValue === "object" &&
      !Array.isArray(matcherValue)
    ) {
      if (typeof inputValue !== "object" || inputValue === null) {
        return false;
      }
      return matchesPartial(
        inputValue as object,
        matcherValue as Partial<object>,
      );
    }

    return inputValue === matcherValue;
  });
}

function matchesStrict<T extends object>(
  input: T,
  matcher: Partial<T>,
): boolean {
  if (input === (matcher as unknown as T)) return true;
  if (
    typeof input !== "object" ||
    input === null ||
    typeof matcher !== "object" ||
    matcher === null
  ) {
    return input === (matcher as unknown as T);
  }

  const inputKeys = Object.keys(input);
  const matcherKeys = Object.keys(matcher);

  if (inputKeys.length !== matcherKeys.length) return false;

  return matcherKeys.every((key) => {
    if (!Object.prototype.hasOwnProperty.call(input, key)) return false;
    const inputRecord = input as Record<string, unknown>;
    const matcherRecord = matcher as Record<string, unknown>;
    // eslint-disable-next-line security/detect-object-injection -- Dynamic property access required for command input matching
    const inputValue = inputRecord[key];
    // eslint-disable-next-line security/detect-object-injection -- Dynamic property access required for matcher comparison
    const matcherValue = matcherRecord[key];

    if (
      typeof inputValue === "object" &&
      inputValue !== null &&
      typeof matcherValue === "object" &&
      matcherValue !== null
    ) {
      return matchesStrict(inputValue, matcherValue);
    }

    return inputValue === matcherValue;
  });
}

/**
 * Client stub for configuring and managing mock behaviors for an AWS SDK client.
 *
 * @category Core Functions
 *
 * @example
 * ```typescript
 * const s3Mock = mockClient(S3Client);
 *
 * // Configure mock behavior
 * s3Mock.on(GetObjectCommand).resolves({ Body: 'data' });
 *
 * // Mock works as configured
 * await client.send(new GetObjectCommand({ Bucket: 'test', Key: 'file.txt' }));
 * expect(s3Mock.calls()).toHaveLength(1);
 *
 * // Reset clears call history but keeps mock configuration
 * s3Mock.reset();
 * expect(s3Mock.calls()).toHaveLength(0);
 *
 * // Mock still works after reset
 * await client.send(new GetObjectCommand({ Bucket: 'test', Key: 'file.txt' }));
 * expect(s3Mock.calls()).toHaveLength(1);
 * ```
 */
export interface AwsClientStub<TClient extends AnyClient = AnyClient> {
  /**
   * The client instance being mocked (undefined for class-level mocks).
   * @readonly
   */
  readonly client: TClient | undefined;

  /**
   * Configure mock behavior for a specific command.
   *
   * @param command - The AWS SDK command constructor to mock
   * @param request - Optional partial input to match against (uses partial matching by default)
   * @param options - Optional configuration for strict matching
   * @returns A command stub for configuring mock responses
   *
   * @example Match any input
   * ```typescript
   * s3Mock.on(GetObjectCommand).resolves({ Body: 'data' });
   * ```
   *
   * @example Match specific input (partial)
   * ```typescript
   * s3Mock.on(GetObjectCommand, { Bucket: 'my-bucket' }).resolves({ Body: 'bucket data' });
   * ```
   *
   * @example Match exact input (strict)
   * ```typescript
   * s3Mock.on(GetObjectCommand, { Bucket: 'my-bucket', Key: 'file.txt' }, { strict: true })
   *   .resolves({ Body: 'exact match' });
   * ```
   */
  on: <TCtor extends AwsCommandConstructor>(
    command: TCtor,
    request?: Partial<CommandInputType<TCtor>>,
    options?: MockOptions,
  ) => AwsCommandStub<
    CommandInputType<TCtor>,
    CommandOutputType<TCtor>,
    TClient
  >;

  /**
   * Clear mock call history while preserving configured behaviors.
   * Mock configurations remain active after reset, only the call history is cleared.
   * Use this between tests when you want to reuse the same mock setup.
   *
   * @example
   * ```typescript
   * afterEach(() => {
   *   s3Mock.reset();
   * });
   * ```
   */
  reset: () => void;

  /**
   * Restore the original client behavior and clear all mocks.
   * After calling restore, the client will no longer be mocked.
   *
   * @example
   * ```typescript
   * afterAll(() => {
   *   s3Mock.restore();
   * });
   * ```
   */
  restore: () => void;

  /**
   * Get an array of all commands that were sent to the client.
   *
   * @returns Array of AWS SDK commands
   *
   * @example
   * ```typescript
   * const calls = s3Mock.calls();
   * console.log(calls.length); // Number of commands sent
   * console.log(calls[0].input); // Input of first command
   * ```
   */
  calls: () => AwsSdkCommand[];

  /** @internal - For use by matchers only */
  __rawCalls: () => ReturnType<Mock["mock"]["calls"]["slice"]>;

  /**
   * Enable debug logging to see detailed information about mock configuration and interactions.
   * Logs both mock setup (when `.on()`, `.resolves()`, etc. are called) and command execution details.
   * Useful for troubleshooting mock configurations and why commands aren't matching expected mocks.
   *
   * @example
   * ```typescript
   * s3Mock.enableDebug();
   * // Logs will appear for:
   * // - Mock configuration (when .on(), .resolves(), etc. are called)
   * // - Command execution (incoming commands and inputs)
   * // - Mock matching results and reasons for failures
   * // - Lifecycle events (reset, restore)
   * ```
   */
  enableDebug: () => void;

  /**
   * Disable debug logging for mock configuration and interactions.
   *
   * @example
   * ```typescript
   * s3Mock.disableDebug();
   * ```
   */
  disableDebug: () => void;
}

/**
 * Command stub for configuring mock behaviors for a specific AWS SDK command.
 * Provides a fluent API for setting up various mock responses and behaviors.
 *
 * @category Command Stub
 *
 * @example Basic usage
 * ```typescript
 * const s3Mock = mockClient(S3Client);
 * s3Mock.on(GetObjectCommand).resolves({ Body: 'data' });
 * ```
 *
 * @example Chaining multiple behaviors
 * ```typescript
 * s3Mock.on(PutObjectCommand)
 *   .resolvesOnce({ ETag: '123' })
 *   .resolvesOnce({ ETag: '456' })
 *   .resolves({ ETag: 'default' });
 * ```
 */
export interface AwsCommandStub<
  TInput extends object,
  TOutput extends MetadataBearer,
  TClient extends AnyClient = AnyClient,
> {
  /**
   * Set a permanent mock response that will be used after all one-time handlers are consumed.
   *
   * @param output - Partial output object to return when the command is called
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * s3Mock.on(GetObjectCommand).resolves({ Body: 'file contents' });
   * ```
   */
  resolves: (
    output: Partial<TOutput>,
  ) => AwsCommandStub<TInput, TOutput, TClient>;

  /**
   * Set a permanent mock rejection that will be used after all one-time handlers are consumed.
   *
   * @param error - Error object or error message string
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * s3Mock.on(GetObjectCommand).rejects(new Error('Access denied'));
   * ```
   */
  rejects: (error: Error | string) => AwsCommandStub<TInput, TOutput, TClient>;

  /**
   * Set a permanent custom handler function that will be used after all one-time handlers are consumed.
   *
   * @param fn - Handler function that receives input and client instance
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * s3Mock.on(GetObjectCommand).callsFake(async (input) => {
   *   return { Body: `Contents of ${input.Key}` };
   * });
   * ```
   */
  callsFake: (
    fn: CommandHandler<TInput, TOutput, TClient>,
  ) => AwsCommandStub<TInput, TOutput, TClient>;

  /**
   * Add a one-time mock response that will be consumed in order.
   *
   * @param output - Partial output object to return
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * s3Mock.on(GetObjectCommand)
   *   .resolvesOnce({ Body: 'first call' })
   *   .resolvesOnce({ Body: 'second call' });
   * ```
   */
  resolvesOnce: (
    output: Partial<TOutput>,
  ) => AwsCommandStub<TInput, TOutput, TClient>;

  /**
   * Add a one-time mock rejection that will be consumed in order.
   *
   * @param error - Error object or error message string
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * s3Mock.on(GetObjectCommand)
   *   .rejectsOnce('First call fails')
   *   .resolves({ Body: 'second call succeeds' });
   * ```
   */
  rejectsOnce: (
    error: Error | string,
  ) => AwsCommandStub<TInput, TOutput, TClient>;

  /**
   * Add a one-time custom handler that will be consumed in order.
   *
   * @param fn - Handler function that receives input and client instance
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * s3Mock.on(GetObjectCommand)
   *   .callsFakeOnce(async (input) => ({ Body: 'once' }))
   *   .resolves({ Body: 'permanent' });
   * ```
   */
  callsFakeOnce: (
    fn: CommandHandler<TInput, TOutput, TClient>,
  ) => AwsCommandStub<TInput, TOutput, TClient>;

  /**
   * Set a permanent stream response for S3-like operations.
   *
   * @param data - String, Buffer, or Readable stream
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * s3Mock.on(GetObjectCommand).resolvesStream('file contents');
   * ```
   */
  resolvesStream: (
    data: StreamInput,
  ) => AwsCommandStub<TInput, TOutput, TClient>;

  /**
   * Set a one-time stream response for S3-like operations.
   *
   * @param data - String, Buffer, or Readable stream
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * s3Mock.on(GetObjectCommand)
   *   .resolvesStreamOnce('first stream')
   *   .resolvesStream('default stream');
   * ```
   */
  resolvesStreamOnce: (
    data: StreamInput,
  ) => AwsCommandStub<TInput, TOutput, TClient>;

  /**
   * Set a permanent mock response with a delay in milliseconds.
   *
   * @param output - Partial output object to return
   * @param delayMs - Delay in milliseconds before resolving
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * s3Mock.on(GetObjectCommand).resolvesWithDelay({ Body: 'data' }, 1000);
   * ```
   */
  resolvesWithDelay: (
    output: Partial<TOutput>,
    delayMs: number,
  ) => AwsCommandStub<TInput, TOutput, TClient>;

  /**
   * Set a permanent mock rejection with a delay in milliseconds.
   *
   * @param error - Error object or error message string
   * @param delayMs - Delay in milliseconds before rejecting
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * s3Mock.on(GetObjectCommand).rejectsWithDelay('Timeout', 5000);
   * ```
   */
  rejectsWithDelay: (
    error: Error | string,
    delayMs: number,
  ) => AwsCommandStub<TInput, TOutput, TClient>;

  /**
   * Reject with an S3 NoSuchKey error.
   *
   * @param key - Optional key name for error message
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * s3Mock.on(GetObjectCommand).rejectsWithNoSuchKey('missing-file.txt');
   * ```
   */
  rejectsWithNoSuchKey: (
    key?: string,
  ) => AwsCommandStub<TInput, TOutput, TClient>;

  /**
   * Reject with an S3 NoSuchBucket error.
   *
   * @param bucket - Optional bucket name for error message
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * s3Mock.on(GetObjectCommand).rejectsWithNoSuchBucket('my-bucket');
   * ```
   */
  rejectsWithNoSuchBucket: (
    bucket?: string,
  ) => AwsCommandStub<TInput, TOutput, TClient>;

  /**
   * Reject with an AccessDenied error.
   *
   * @param resource - Optional resource name for error message
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * s3Mock.on(GetObjectCommand).rejectsWithAccessDenied('private-file.txt');
   * ```
   */
  rejectsWithAccessDenied: (
    resource?: string,
  ) => AwsCommandStub<TInput, TOutput, TClient>;

  /**
   * Reject with a DynamoDB ResourceNotFound error.
   *
   * @param resource - Optional resource name for error message
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * dynamoMock.on(GetItemCommand).rejectsWithResourceNotFound('MyTable');
   * ```
   */
  rejectsWithResourceNotFound: (
    resource?: string,
  ) => AwsCommandStub<TInput, TOutput, TClient>;

  /**
   * Reject with a DynamoDB ConditionalCheckFailed error.
   *
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * dynamoMock.on(PutItemCommand).rejectsWithConditionalCheckFailed();
   * ```
   */
  rejectsWithConditionalCheckFailed: () => AwsCommandStub<
    TInput,
    TOutput,
    TClient
  >;

  /**
   * Reject with a Throttling error.
   *
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * s3Mock.on(GetObjectCommand).rejectsWithThrottling();
   * ```
   */
  rejectsWithThrottling: () => AwsCommandStub<TInput, TOutput, TClient>;

  /**
   * Reject with an InternalServerError.
   *
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * s3Mock.on(GetObjectCommand).rejectsWithInternalServerError();
   * ```
   */
  rejectsWithInternalServerError: () => AwsCommandStub<
    TInput,
    TOutput,
    TClient
  >;

  /**
   * Set paginated responses for AWS pagination patterns.
   *
   * Tokens are automatically set to the last item of each page, which works for both
   * DynamoDB (object tokens) and S3 (object tokens).
   *
   * @param items - Array of items to paginate (use marshalled items for DynamoDB)
   * @param options - Pagination configuration options
   * @returns The command stub for chaining
   *
   * @example DynamoDB pagination with marshalled data
   * ```typescript
   * import { marshall } from '@aws-sdk/util-dynamodb';
   *
   * const users = [
   *   { id: "user-1", name: "Alice" },
   *   { id: "user-2", name: "Bob" }
   * ];
   * const marshalledUsers = users.map(u => marshall(u));
   *
   * dynamoMock.on(ScanCommand).resolvesPaginated(marshalledUsers, {
   *   pageSize: 1,
   *   tokenKey: "LastEvaluatedKey",
   *   inputTokenKey: "ExclusiveStartKey"
   * });
   *
   * // LastEvaluatedKey will be the marshalled last item (object, not string)
   * const result = await client.send(new ScanCommand({ TableName: "Users" }));
   * // result.LastEvaluatedKey = { id: { S: "user-1" }, name: { S: "Alice" } }
   * ```
   *
   * @example S3 pagination
   * ```typescript
   * const objects = [
   *   { Key: 'file1.txt', Size: 100 },
   *   { Key: 'file2.txt', Size: 200 }
   * ];
   *
   * s3Mock.on(ListObjectsV2Command).resolvesPaginated(objects, {
   *   pageSize: 1,
   *   itemsKey: "Contents",
   *   tokenKey: "NextContinuationToken",
   *   inputTokenKey: "ContinuationToken"
   * });
   *
   * // NextContinuationToken will be the last object from the page
   * const result = await client.send(new ListObjectsV2Command({ Bucket: "bucket" }));
   * // result.NextContinuationToken = { Key: 'file1.txt', Size: 100 }
   * ```
   */
  resolvesPaginated: <T = unknown>(
    items: T[],
    options?: PaginatorOptions,
  ) => AwsCommandStub<TInput, TOutput, TClient>;

  /**
   * Load response from a file. JSON files are parsed, others returned as strings.
   *
   * @param filePath - Path to the file to load
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * s3Mock.on(GetObjectCommand).resolvesFromFile('./fixtures/response.json');
   * ```
   */
  resolvesFromFile: (
    filePath: string,
  ) => AwsCommandStub<TInput, TOutput, TClient>;
}

type MocksContainer = {
  map: WeakMap<AwsCommandConstructor, MockEntry[]>;
  debugLogger: DebugLogger;
};

function buildNoMatchError(
  commandName: string,
  mocks: MockEntry[],
  input: object,
): Error {
  const matchers = mocks
    .map((mock, index) => {
      const matcherStr = mock.matcher
        ? JSON.stringify(mock.matcher, undefined, 2)
        : "any input";
      const strictStr = mock.strict ? " (strict mode)" : "";
      return `  Mock #${index + 1}: ${matcherStr}${strictStr}`;
    })
    .join("\n");

  const receivedStr = JSON.stringify(input, undefined, 2);

  return new Error(
    `No matching mock found for ${commandName}.\n\n` +
      `Found ${mocks.length} mock(s) but none matched the input.\n\n` +
      `Configured mocks:\n${matchers}\n\n` +
      `Received input:\n${receivedStr}\n\n` +
      `Tip: Enable debug mode with enableDebug() for detailed matching information.`,
  );
}

function buildNoMockError(commandName: string, input: object): Error {
  const receivedStr = JSON.stringify(input, undefined, 2);
  return new Error(
    `No mock configured for command: ${commandName}.\n\n` +
      `Received input:\n${receivedStr}\n\n` +
      `Did you forget to call mockClient.on(${commandName})?`,
  );
}

function findMatchingMock(mocks: MockEntry[], input: object): number {
  return mocks.findIndex((mock) => {
    const isMatch = mock.strict
      ? mock.matcher && matchesStrict(input, mock.matcher)
      : !mock.matcher || matchesPartial(input, mock.matcher);
    return isMatch;
  });
}

function createMockImplementation(
  container: MocksContainer,
): (this: AnyClient, command: AwsSdkCommand) => Promise<MetadataBearer> {
  return async function (
    this: AnyClient,
    command: AwsSdkCommand,
  ): Promise<MetadataBearer> {
    const getClient = (): AnyClient => this;
    const shouldLog = getEffectiveDebugState(container.debugLogger);
    const commandName = command.constructor.name;

    if (shouldLog) {
      container.debugLogger.logDirect(
        `Received command: ${commandName}`,
        command.input,
      );
    }

    const mocks = container.map.get(
      command.constructor as AwsCommandConstructor,
    );

    if (!mocks) {
      if (shouldLog) {
        container.debugLogger.logDirect(
          `No mocks configured for ${commandName}`,
        );
      }
      throw buildNoMockError(commandName, command.input);
    }

    if (shouldLog) {
      container.debugLogger.logDirect(
        `Found ${mocks.length} mock(s) for ${commandName}`,
      );
    }

    const matchingIndex = findMatchingMock(mocks, command.input);

    if (matchingIndex === -1) {
      if (shouldLog) {
        container.debugLogger.logDirect(
          `No matching mock found for ${commandName}`,
          command.input,
        );
      }
      throw buildNoMatchError(commandName, mocks, command.input);
    }

    // eslint-disable-next-line security/detect-object-injection -- Array access with validated index for mock retrieval
    const mock = mocks[matchingIndex];
    if (!mock) {
      throw new Error(`Mock at index ${matchingIndex} not found`);
    }

    if (shouldLog) {
      container.debugLogger.logDirect(
        `Using mock at index ${matchingIndex} for ${commandName}`,
      );
    }

    if (mock.once) {
      mocks.splice(matchingIndex, 1);
      if (shouldLog) {
        container.debugLogger.logDirect(
          `Removed one-time mock for ${commandName}`,
        );
      }
    }

    return mock.handler(command.input, getClient()) as Promise<MetadataBearer>;
  };
}

function createCommandStub<
  TCtor extends AwsCommandConstructor,
  TClient extends AnyClient,
>(
  container: MocksContainer,
  command: TCtor,
  matcher: Partial<CommandInputType<TCtor>> | undefined,
  options: MockOptions = {},
): AwsCommandStub<CommandInputType<TCtor>, CommandOutputType<TCtor>, TClient> {
  type TInput = CommandInputType<TCtor>;
  type TOutput = CommandOutputType<TCtor>;

  const addEntry = (
    handler: CommandHandler<TInput, TOutput, TClient>,
    once: boolean,
    handlerType: string,
  ): void => {
    const entry: MockEntry<TInput, TOutput> = {
      matcher,
      handler: handler as CommandHandler<TInput, TOutput>,
      once,
      strict: !!options.strict,
    };
    const existingMocks =
      container.map.get(command as unknown as AwsCommandConstructor) ?? [];

    const shouldLog = getEffectiveDebugState(container.debugLogger);

    if (once) {
      // Insert "once" handlers before permanent handlers
      const permanentIndex = existingMocks.findIndex((m) => !m.once);
      if (permanentIndex === -1) {
        existingMocks.push(entry as unknown as MockEntry);
      } else {
        existingMocks.splice(permanentIndex, 0, entry as unknown as MockEntry);
      }
      container.map.set(
        command as unknown as AwsCommandConstructor,
        existingMocks,
      );
      if (shouldLog) {
        container.debugLogger.logDirect(
          `Configured ${handlerType}Once for ${command.name}`,
          matcher ? { matcher, strict: !!options.strict } : undefined,
        );
      }
    } else {
      // Permanent handlers replace any existing permanent handler for same matcher
      const filteredMocks = existingMocks.filter(
        (m) => m.once || JSON.stringify(m.matcher) !== JSON.stringify(matcher),
      );
      filteredMocks.push(entry as unknown as MockEntry);
      container.map.set(
        command as unknown as AwsCommandConstructor,
        filteredMocks,
      );
      if (shouldLog) {
        container.debugLogger.logDirect(
          `Configured ${handlerType} for ${command.name}`,
          matcher ? { matcher, strict: !!options.strict } : undefined,
        );
      }
    }
  };

  const stub: AwsCommandStub<TInput, TOutput, TClient> = {
    resolves(
      output: Partial<TOutput>,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(() => Promise.resolve(output as TOutput), false, "resolves");
      return stub;
    },
    rejects(error: Error | string): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(
        () => {
          const err = typeof error === "string" ? new Error(error) : error;
          return Promise.reject(err);
        },
        false,
        "rejects",
      );
      return stub;
    },
    callsFake(
      fn: CommandHandler<TInput, TOutput, TClient>,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(fn, false, "callsFake");
      return stub;
    },
    resolvesOnce(
      output: Partial<TOutput>,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(() => Promise.resolve(output as TOutput), true, "resolves");
      return stub;
    },
    rejectsOnce(
      error: Error | string,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(
        () => {
          const err = typeof error === "string" ? new Error(error) : error;
          return Promise.reject(err);
        },
        true,
        "rejects",
      );
      return stub;
    },
    callsFakeOnce(
      fn: CommandHandler<TInput, TOutput, TClient>,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(fn, true, "callsFake");
      return stub;
    },
    resolvesStream(
      data: StreamInput,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(
        () =>
          Promise.resolve({ Body: createStream(data) } as unknown as TOutput),
        false,
        "resolvesStream",
      );
      return stub;
    },
    resolvesStreamOnce(
      data: StreamInput,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(
        () =>
          Promise.resolve({ Body: createStream(data) } as unknown as TOutput),
        true,
        "resolvesStream",
      );
      return stub;
    },
    resolvesWithDelay(
      output: Partial<TOutput>,
      delayMs: number,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      const delayedResolve = (resolve: (value: TOutput) => void) => {
        setTimeout(() => resolve(output as TOutput), delayMs);
      };
      addEntry(() => new Promise(delayedResolve), false, "resolvesWithDelay");
      return stub;
    },
    rejectsWithDelay(
      error: Error | string,
      delayMs: number,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      const err = typeof error === "string" ? new Error(error) : error;
      const delayedReject = (_: unknown, reject: (reason: Error) => void) => {
        setTimeout(() => reject(err), delayMs);
      };
      addEntry(() => new Promise(delayedReject), false, "rejectsWithDelay");
      return stub;
    },
    rejectsWithNoSuchKey(
      key?: string,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(
        () => Promise.reject(createNoSuchKeyError(key)),
        false,
        "rejectsWithNoSuchKey",
      );
      return stub;
    },
    rejectsWithNoSuchBucket(
      bucket?: string,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(
        () => Promise.reject(createNoSuchBucketError(bucket)),
        false,
        "rejectsWithNoSuchBucket",
      );
      return stub;
    },
    rejectsWithAccessDenied(
      resource?: string,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(
        () => Promise.reject(createAccessDeniedError(resource)),
        false,
        "rejectsWithAccessDenied",
      );
      return stub;
    },
    rejectsWithResourceNotFound(
      resource?: string,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(
        () => Promise.reject(createResourceNotFoundError(resource)),
        false,
        "rejectsWithResourceNotFound",
      );
      return stub;
    },
    rejectsWithConditionalCheckFailed(): AwsCommandStub<
      TInput,
      TOutput,
      TClient
    > {
      addEntry(
        () => Promise.reject(createConditionalCheckFailedError()),
        false,
        "rejectsWithConditionalCheckFailed",
      );
      return stub;
    },
    rejectsWithThrottling(): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(
        () => Promise.reject(createThrottlingError()),
        false,
        "rejectsWithThrottling",
      );
      return stub;
    },
    rejectsWithInternalServerError(): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(
        () => Promise.reject(createInternalServerError()),
        false,
        "rejectsWithInternalServerError",
      );
      return stub;
    },
    resolvesPaginated<T = unknown>(
      items: T[],
      options: PaginatorOptions = {},
    ): AwsCommandStub<TInput, TOutput, TClient> {
      const responses = createPaginatedResponses(items, options);
      let currentIndex = 0;

      container.debugLogger.log(
        `Configured resolvesPaginated for ${command.name}`,
        { pageSize: options.pageSize, itemsCount: items.length },
      );

      addEntry(
        (input) => {
          const tokenKey = options.tokenKey || "NextToken";
          const inputTokenKey = options.inputTokenKey || tokenKey;
          const inputRecord = input as Record<string, unknown>;
          // eslint-disable-next-line security/detect-object-injection -- Dynamic token key access required for AWS pagination handling
          const inputToken = inputRecord[inputTokenKey];

          if (inputToken !== undefined && inputToken !== null) {
            // Find which page has this token as its last item
            const itemsKey = options.itemsKey || "Items";
            let pageIndex = 0;
            for (const response of responses) {
              const responseRecord = response as Record<string, unknown>;
              // eslint-disable-next-line security/detect-object-injection
              const pageItems = responseRecord[itemsKey] as unknown[];
              if (pageItems && pageItems.length > 0) {
                // eslint-disable-next-line unicorn/prefer-at -- TypeScript target doesn't support Array.at() method
                const lastItem = pageItems[pageItems.length - 1];

                // Compare the token with the last item (deep equality check)
                if (JSON.stringify(lastItem) === JSON.stringify(inputToken)) {
                  currentIndex = pageIndex + 1;
                  break;
                }
              }
              pageIndex++;
            }
          } else {
            currentIndex = 0;
          }

          const response =
            // eslint-disable-next-line security/detect-object-injection
            responses[currentIndex] ||
            // eslint-disable-next-line unicorn/prefer-at -- TypeScript target doesn't support Array.at() method
            responses[responses.length - 1] ||
            responses[0];
          if (!response) {
            throw new Error("No paginated responses available");
          }
          currentIndex = Math.min(currentIndex + 1, responses.length - 1);

          return Promise.resolve(response as unknown as TOutput);
        },
        false,
        "resolvesPaginated",
      );

      return stub;
    },
    resolvesFromFile(
      filePath: string,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      container.debugLogger.log(
        `Configured resolvesFromFile for ${command.name}`,
        { filePath },
      );
      addEntry(
        () => {
          const data = loadFixture(filePath);
          return Promise.resolve(data as TOutput);
        },
        false,
        "resolvesFromFile",
      );

      return stub;
    },
  };

  return stub;
}

/**
 * Create a mock for an AWS SDK client class.
 *
 * Use this function when you want to mock all instances of a client class.
 *
 * @category Core Functions
 *
 * @param clientConstructor - The AWS SDK client class to mock
 * @returns A client stub for configuring mock behaviors
 *
 * @example
 * ```typescript
 * import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
 * import { mockClient } from 'aws-sdk-vitest-mock';
 *
 * const s3Mock = mockClient(S3Client);
 *
 * s3Mock.on(GetObjectCommand).resolves({ Body: 'file contents' });
 *
 * const client = new S3Client({});
 * const result = await client.send(new GetObjectCommand({ Bucket: 'my-bucket', Key: 'file.txt' }));
 * // result.Body === 'file contents'
 * ```
 */
export const mockClient = <TClient extends AnyClient>(
  clientConstructor: ClientConstructor<TClient>,
): AwsClientStub<TClient> => {
  const mocksContainer: MocksContainer = {
    map: new WeakMap(),
    debugLogger: createDebugLogger(),
  };

  // Use type assertion to handle both constructor and prototype-only objects
  const prototype = (clientConstructor as { prototype: TClient }).prototype;

  const sendSpy = vi
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Required for Vitest spyOn type compatibility
    .spyOn(prototype as any, "send")
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- Required for Vitest mockImplementation type compatibility
    .mockImplementation(createMockImplementation(mocksContainer) as any);

  const stub: AwsClientStub<TClient> = {
    client: undefined,
    on: <TCtor extends AwsCommandConstructor>(
      command: TCtor,
      request?: Partial<CommandInputType<TCtor>>,
      options?: MockOptions,
    ): AwsCommandStub<
      CommandInputType<TCtor>,
      CommandOutputType<TCtor>,
      TClient
    > =>
      createCommandStub<TCtor, TClient>(
        mocksContainer,
        command,
        request,
        options,
      ),
    reset: (): void => {
      const shouldLog = getEffectiveDebugState(mocksContainer.debugLogger);
      if (shouldLog) {
        mocksContainer.debugLogger.logDirect(
          "Clearing call history (mocks preserved)",
        );
      }
      sendSpy.mockClear();
    },
    restore: (): void => {
      const shouldLog = getEffectiveDebugState(mocksContainer.debugLogger);
      if (shouldLog) {
        mocksContainer.debugLogger.logDirect(
          "Restoring original client behavior and clearing all mocks",
        );
      }
      sendSpy.mockRestore();
      mocksContainer.map = new WeakMap();
    },
    calls: (): AwsSdkCommand[] =>
      sendSpy.mock.calls.map((call) => call[0] as AwsSdkCommand),
    __rawCalls: (): ReturnType<Mock["mock"]["calls"]["slice"]> =>
      sendSpy.mock.calls,
    enableDebug: (): void => {
      enableDebug(mocksContainer.debugLogger);
    },
    disableDebug: (): void => {
      disableDebug(mocksContainer.debugLogger);
    },
  };

  return stub;
};

/**
 * Create a mock for a specific AWS SDK client instance.
 *
 * Use this function when you want to mock a single client instance.
 *
 * @category Core Functions
 *
 * @param clientInstance - The AWS SDK client instance to mock
 * @returns A client stub for configuring mock behaviors
 *
 * @example
 * ```typescript
 * import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
 * import { mockClientInstance } from 'aws-sdk-vitest-mock';
 *
 * const client = new S3Client({});
 * const s3Mock = mockClientInstance(client);
 *
 * s3Mock.on(GetObjectCommand).resolves({ Body: 'file contents' });
 *
 * const result = await client.send(new GetObjectCommand({ Bucket: 'my-bucket', Key: 'file.txt' }));
 * // result.Body === 'file contents'
 * ```
 */
export const mockClientInstance = <TClient extends AnyClient>(
  clientInstance: TClient,
): AwsClientStub<AnyClient> => {
  const mocksContainer: MocksContainer = {
    map: new WeakMap(),
    debugLogger: createDebugLogger(),
  };

  // Use type assertion to work around vi.spyOn strict typing
  const sendSpy = vi
    .spyOn(clientInstance as unknown as AnyClient, "send")
    .mockImplementation(createMockImplementation(mocksContainer));

  const stub: AwsClientStub<AnyClient> = {
    client: clientInstance as unknown as AnyClient,
    on: <TCtor extends AwsCommandConstructor>(
      command: TCtor,
      request?: Partial<CommandInputType<TCtor>>,
      options?: MockOptions,
    ): AwsCommandStub<
      CommandInputType<TCtor>,
      CommandOutputType<TCtor>,
      AnyClient
    > =>
      createCommandStub<TCtor, AnyClient>(
        mocksContainer,
        command,
        request,
        options,
      ),
    reset: (): void => {
      const shouldLog = getEffectiveDebugState(mocksContainer.debugLogger);
      if (shouldLog) {
        mocksContainer.debugLogger.logDirect(
          "Clearing call history (mocks preserved) for client instance",
        );
      }
      sendSpy.mockClear();
    },
    restore: (): void => {
      const shouldLog = getEffectiveDebugState(mocksContainer.debugLogger);
      if (shouldLog) {
        mocksContainer.debugLogger.logDirect(
          "Restoring original client behavior and clearing all mocks for client instance",
        );
      }
      sendSpy.mockRestore();
      mocksContainer.map = new WeakMap();
    },
    calls: (): AwsSdkCommand[] => sendSpy.mock.calls.map((call) => call[0]),
    __rawCalls: (): ReturnType<Mock["mock"]["calls"]["slice"]> =>
      sendSpy.mock.calls,
    enableDebug: (): void => {
      enableDebug(mocksContainer.debugLogger);
    },
    disableDebug: (): void => {
      disableDebug(mocksContainer.debugLogger);
    },
  };

  return stub;
};
