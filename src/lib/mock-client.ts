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
export interface StructuralCommandShape<
  TInput extends object,
  TOutput extends MetadataBearer,
> {
  readonly input: TInput;
  readonly __awsSdkVitestMockOutput?: TOutput;
}

export type StructuralCommand<
  TInput extends object,
  TOutput extends MetadataBearer,
> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | SmithyCommand<TInput, TOutput, any, any, any>
  | StructuralCommandShape<TInput, TOutput>;

export type CommandConstructor<
  TInput extends object,
  TOutput extends MetadataBearer,
> = new (input: TInput) => StructuralCommand<TInput, TOutput>;

type AwsCommandConstructor = new (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any,
) => StructuralCommand<object, MetadataBearer>;

export type CommandInputType<TCtor extends AwsCommandConstructor> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TCtor extends new (input: infer TInput) => any ? TInput : any;

export type CommandOutputType<TCtor extends AwsCommandConstructor> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  InstanceType<TCtor> extends StructuralCommand<any, infer TOutput>
    ? TOutput
    : MetadataBearer;

export type AnyClient = {
  send(command: AnyCommand): Promise<MetadataBearer>;
  config:
    | SmithyResolvedConfiguration<HttpHandlerOptions>
    | Record<string, unknown>;
};

export type AnyCommand = StructuralCommand<object, MetadataBearer>;

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

export interface AwsClientStub<TClient extends AnyClient = AnyClient> {
  readonly client: TClient | undefined;
  on: <TCtor extends AwsCommandConstructor>(
    command: TCtor,
    request?: Partial<CommandInputType<TCtor>>,
    options?: MockOptions,
  ) => AwsCommandStub<
    CommandInputType<TCtor>,
    CommandOutputType<TCtor>,
    TClient
  >;
  reset: () => void;
  restore: () => void;
  calls: () => ReturnType<Mock["mock"]["calls"]["slice"]>;
  enableDebug: () => void;
  disableDebug: () => void;
}

export interface AwsCommandStub<
  TInput extends object,
  TOutput extends MetadataBearer,
  TClient extends AnyClient = AnyClient,
> {
  /** Set a permanent mock response (used after all once handlers are consumed) */
  resolves: (
    output: Partial<TOutput>,
  ) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Set a permanent mock rejection (used after all once handlers are consumed) */
  rejects: (error: Error | string) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Set a permanent custom handler (used after all once handlers are consumed) */
  callsFake: (
    fn: CommandHandler<TInput, TOutput, TClient>,
  ) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Add a one-time mock response (consumed in order) */
  resolvesOnce: (
    output: Partial<TOutput>,
  ) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Add a one-time mock rejection (consumed in order) */
  rejectsOnce: (
    error: Error | string,
  ) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Add a one-time custom handler (consumed in order) */
  callsFakeOnce: (
    fn: CommandHandler<TInput, TOutput, TClient>,
  ) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Set a permanent stream response for S3-like operations */
  resolvesStream: (
    data: StreamInput,
  ) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Set a one-time stream response for S3-like operations */
  resolvesStreamOnce: (
    data: StreamInput,
  ) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Set a permanent mock response with delay */
  resolvesWithDelay: (
    output: Partial<TOutput>,
    delayMs: number,
  ) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Set a permanent mock rejection with delay */
  rejectsWithDelay: (
    error: Error | string,
    delayMs: number,
  ) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Reject with S3 NoSuchKey error */
  rejectsWithNoSuchKey: (
    key?: string,
  ) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Reject with S3 NoSuchBucket error */
  rejectsWithNoSuchBucket: (
    bucket?: string,
  ) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Reject with AccessDenied error */
  rejectsWithAccessDenied: (
    resource?: string,
  ) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Reject with DynamoDB ResourceNotFound error */
  rejectsWithResourceNotFound: (
    resource?: string,
  ) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Reject with DynamoDB ConditionalCheckFailed error */
  rejectsWithConditionalCheckFailed: () => AwsCommandStub<
    TInput,
    TOutput,
    TClient
  >;
  /** Reject with Throttling error */
  rejectsWithThrottling: () => AwsCommandStub<TInput, TOutput, TClient>;
  /** Reject with InternalServerError */
  rejectsWithInternalServerError: () => AwsCommandStub<
    TInput,
    TOutput,
    TClient
  >;
  /** Set paginated responses for AWS pagination */
  resolvesPaginated: <T = unknown>(
    items: T[],
    options?: PaginatorOptions,
  ) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Load response from file (JSON files are parsed, others returned as strings) */
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
): (this: AnyClient, command: AnyCommand) => Promise<MetadataBearer> {
  return async function (
    this: AnyClient,
    command: AnyCommand,
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
        const inputRecord = input as Record<string, unknown>;
        // eslint-disable-next-line security/detect-object-injection -- Dynamic token key access required for AWS pagination handling
        const inputToken = inputRecord[tokenKey] as string | undefined;

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
    calls: (): Mock["mock"]["calls"] => sendSpy.mock.calls,
    enableDebug: (): void => {
      enableDebug(mocksContainer.debugLogger);
    },
    disableDebug: (): void => {
      disableDebug(mocksContainer.debugLogger);
    },
  };

  return stub;
};

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
    calls: (): Mock["mock"]["calls"] => sendSpy.mock.calls,
    enableDebug: (): void => {
      enableDebug(mocksContainer.debugLogger);
    },
    disableDebug: (): void => {
      disableDebug(mocksContainer.debugLogger);
    },
  };

  return stub;
};
