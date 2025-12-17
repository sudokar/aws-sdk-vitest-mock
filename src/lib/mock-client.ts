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
 * // Reset mocks between tests
 * s3Mock.reset();
 *
 * // Check what was called
 * const calls = s3Mock.calls();
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
   * Clear all mock call history and configured behaviors.
   * Use this between tests to ensure a clean state.
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
   * Enable debug logging to see which mocks are being matched.
   * Useful for troubleshooting mock configurations.
   *
   * @example
   * ```typescript
   * s3Mock.enableDebug();
   * ```
   */
  enableDebug: () => void;

  /**
   * Disable debug logging.
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
   * @param items - Array of items to paginate
   * @param options - Pagination configuration options
   * @returns The command stub for chaining
   *
   * @example
   * ```typescript
   * s3Mock.on(ListObjectsV2Command).resolvesPaginated([
   *   { Key: 'file1.txt' },
   *   { Key: 'file2.txt' }
   * ], { pageSize: 1 });
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

function createMockImplementation(
  container: MocksContainer,
): (this: AnyClient, command: AwsSdkCommand) => Promise<MetadataBearer> {
  return async function (
    this: AnyClient,
    command: AwsSdkCommand,
  ): Promise<MetadataBearer> {
    const getClient = (): AnyClient => this;

    container.debugLogger.log(
      `Received command: ${command.constructor.name}`,
      command.input,
    );

    const mocks = container.map.get(
      command.constructor as AwsCommandConstructor,
    );
    if (mocks) {
      container.debugLogger.log(
        `Found ${mocks.length} mock(s) for ${command.constructor.name}`,
      );

      const matchingIndex = mocks.findIndex((mock) => {
        const isMatch = mock.strict
          ? mock.matcher && matchesStrict(command.input, mock.matcher)
          : !mock.matcher || matchesPartial(command.input, mock.matcher);
        return isMatch;
      });

      if (matchingIndex === -1) {
        container.debugLogger.log(
          `No matching mock found for ${command.constructor.name}`,
          command.input,
        );
      } else {
        // eslint-disable-next-line security/detect-object-injection -- Array access with validated index for mock retrieval
        const mock = mocks[matchingIndex];
        if (!mock) {
          throw new Error(`Mock at index ${matchingIndex} not found`);
        }
        container.debugLogger.log(
          `Using mock at index ${matchingIndex} for ${command.constructor.name}`,
        );

        if (mock.once) {
          mocks.splice(matchingIndex, 1);
          container.debugLogger.log(
            `Removed one-time mock for ${command.constructor.name}`,
          );
        }
        return mock.handler(
          command.input,
          getClient(),
        ) as Promise<MetadataBearer>;
      }
    } else {
      container.debugLogger.log(
        `No mocks configured for ${command.constructor.name}`,
      );
    }

    throw new Error(
      `No mock configured for command: ${command.constructor.name}`,
    );
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
  ): void => {
    const entry: MockEntry<TInput, TOutput> = {
      matcher,
      handler: handler as CommandHandler<TInput, TOutput>,
      once,
      strict: !!options.strict,
    };
    const existingMocks =
      container.map.get(command as unknown as AwsCommandConstructor) ?? [];

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
    }
  };

  const stub: AwsCommandStub<TInput, TOutput, TClient> = {
    resolves(
      output: Partial<TOutput>,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(() => Promise.resolve(output as TOutput), false);
      return stub;
    },
    rejects(error: Error | string): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(() => {
        const err = typeof error === "string" ? new Error(error) : error;
        return Promise.reject(err);
      }, false);
      return stub;
    },
    callsFake(
      fn: CommandHandler<TInput, TOutput, TClient>,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(fn, false);
      return stub;
    },
    resolvesOnce(
      output: Partial<TOutput>,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(() => Promise.resolve(output as TOutput), true);
      return stub;
    },
    rejectsOnce(
      error: Error | string,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(() => {
        const err = typeof error === "string" ? new Error(error) : error;
        return Promise.reject(err);
      }, true);
      return stub;
    },
    callsFakeOnce(
      fn: CommandHandler<TInput, TOutput, TClient>,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(fn, true);
      return stub;
    },
    resolvesStream(
      data: StreamInput,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(
        () =>
          Promise.resolve({ Body: createStream(data) } as unknown as TOutput),
        false,
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
      addEntry(() => new Promise(delayedResolve), false);
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
      addEntry(() => new Promise(delayedReject), false);
      return stub;
    },
    rejectsWithNoSuchKey(
      key?: string,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(() => Promise.reject(createNoSuchKeyError(key)), false);
      return stub;
    },
    rejectsWithNoSuchBucket(
      bucket?: string,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(() => Promise.reject(createNoSuchBucketError(bucket)), false);
      return stub;
    },
    rejectsWithAccessDenied(
      resource?: string,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(() => Promise.reject(createAccessDeniedError(resource)), false);
      return stub;
    },
    rejectsWithResourceNotFound(
      resource?: string,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(
        () => Promise.reject(createResourceNotFoundError(resource)),
        false,
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
      );
      return stub;
    },
    rejectsWithThrottling(): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(() => Promise.reject(createThrottlingError()), false);
      return stub;
    },
    rejectsWithInternalServerError(): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(() => Promise.reject(createInternalServerError()), false);
      return stub;
    },
    resolvesPaginated<T = unknown>(
      items: T[],
      options: PaginatorOptions = {},
    ): AwsCommandStub<TInput, TOutput, TClient> {
      const responses = createPaginatedResponses(items, options);
      let currentIndex = 0;

      addEntry((input) => {
        const tokenKey = options.tokenKey || "NextToken";
        const inputTokenKey = options.inputTokenKey || tokenKey;
        const inputRecord = input as Record<string, unknown>;
        // eslint-disable-next-line security/detect-object-injection -- Dynamic token key access required for AWS pagination handling
        const inputToken = inputRecord[inputTokenKey] as string | undefined;

        if (inputToken) {
          // Extract index from token
          const tokenRegex = /token-(\d+)/;
          const tokenMatch = tokenRegex.exec(inputToken);
          if (tokenMatch && tokenMatch[1]) {
            const tokenValue = tokenMatch[1];
            currentIndex = Math.floor(
              Number.parseInt(tokenValue, 10) / (options.pageSize || 10),
            );
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
      }, false);

      return stub;
    },
    resolvesFromFile(
      filePath: string,
    ): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(() => {
        const data = loadFixture(filePath);
        return Promise.resolve(data as TOutput);
      }, false);

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
      sendSpy.mockClear();
      mocksContainer.map = new WeakMap();
    },
    restore: (): void => {
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
      sendSpy.mockClear();
      mocksContainer.map = new WeakMap();
    },
    restore: (): void => {
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
