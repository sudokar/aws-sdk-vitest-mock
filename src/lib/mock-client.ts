import { SmithyResolvedConfiguration } from '@smithy/smithy-client';
import type { MiddlewareStack, Handler } from '@smithy/types';
import { type Mock, vi } from 'vitest';

// Define structural types to avoid strict dependency on specific @smithy/types versions
export interface MetadataBearer {
  $metadata?: unknown;
}

export interface StructuralCommand<TInput extends object, TOutput extends MetadataBearer> {
  // Make input readonly to match SDK Command interface for better inference
  readonly input: TInput;
  middlewareStack: MiddlewareStack<TInput, TOutput>;
  resolveMiddleware(
    stack: MiddlewareStack<TInput, TOutput>,
    configuration: unknown,
    options: unknown
  ): Handler<TInput, TOutput>;
}

export type CommandConstructor<TInput extends object, TOutput extends MetadataBearer> = new (input: TInput) => StructuralCommand<TInput, TOutput>;

export type AnyClient = {
  send(command: AnyCommand): Promise<MetadataBearer>;
  config: SmithyResolvedConfiguration<unknown>;
};

export type AnyCommand = StructuralCommand<object, MetadataBearer>;

// Allow protected constructors by accepting prototype property directly if needed
export type ClientConstructor<TClient extends AnyClient> = (abstract new (config: unknown) => TClient) | { prototype: TClient };

type CommandHandler<TInput extends object = object, TOutput extends MetadataBearer = MetadataBearer, TClient extends AnyClient = AnyClient> =
  (input: TInput, getClient: () => TClient | undefined) => Promise<TOutput>;

interface MockEntry<TInput extends object = object, TOutput extends MetadataBearer = MetadataBearer> {
  matcher?: Partial<TInput>;
  handler: CommandHandler<TInput, TOutput>;
  once: boolean;
  strict: boolean;
}

interface MockOptions {
  strict?: boolean;
}

function matchesPartial<T extends object>(input: T, matcher: Partial<T>): boolean {
  return Object.keys(matcher).every((key) => {
    const matcherValue = matcher[key as keyof T];
    const inputValue = input[key as keyof T];

    if (matcherValue && typeof matcherValue === 'object' && !Array.isArray(matcherValue)) {
      if (typeof inputValue !== 'object' || inputValue === null) {
        return false;
      }
      return matchesPartial(inputValue as object, matcherValue as Partial<object>);
    }

    return inputValue === matcherValue;
  });
}

function matchesStrict<T extends object>(input: T, matcher: Partial<T>): boolean {
  if (input === (matcher as unknown as T)) return true;
  if (typeof input !== 'object' || input === null || typeof matcher !== 'object' || matcher === null) {
    return input === (matcher as unknown as T);
  }

  const inputKeys = Object.keys(input);
  const matcherKeys = Object.keys(matcher);

  if (inputKeys.length !== matcherKeys.length) return false;

  return matcherKeys.every((key) => {
    if (!Object.prototype.hasOwnProperty.call(input, key)) return false;
    // eslint-disable-next-line security/detect-object-injection
    const inputValue = (input as Record<string, unknown>)[key];
    // eslint-disable-next-line security/detect-object-injection
    const matcherValue = (matcher as Record<string, unknown>)[key];

    if (typeof inputValue === 'object' && inputValue !== null && typeof matcherValue === 'object' && matcherValue !== null) {
      return matchesStrict(inputValue, matcherValue);
    }

    return inputValue === matcherValue;
  });
}

export interface AwsClientStub<TClient extends AnyClient = AnyClient> {
  readonly client: TClient | undefined;
  on: <TInput extends object, TOutput extends MetadataBearer>(
    command: CommandConstructor<TInput, TOutput>,
    request?: Partial<TInput>,
    options?: MockOptions
  ) => AwsCommandStub<TInput, TOutput, TClient>;
  reset: () => void;
  restore: () => void;
  calls: () => ReturnType<Mock['mock']['calls']['slice']>;
}

export interface AwsCommandStub<TInput extends object, TOutput extends MetadataBearer, TClient extends AnyClient = AnyClient> {
  /** Set a permanent mock response (used after all once handlers are consumed) */
  resolves: (output: Partial<TOutput>) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Set a permanent mock rejection (used after all once handlers are consumed) */
  rejects: (error: Error | string) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Set a permanent custom handler (used after all once handlers are consumed) */
  callsFake: (fn: CommandHandler<TInput, TOutput, TClient>) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Add a one-time mock response (consumed in order) */
  resolvesOnce: (output: Partial<TOutput>) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Add a one-time mock rejection (consumed in order) */
  rejectsOnce: (error: Error | string) => AwsCommandStub<TInput, TOutput, TClient>;
  /** Add a one-time custom handler (consumed in order) */
  callsFakeOnce: (fn: CommandHandler<TInput, TOutput, TClient>) => AwsCommandStub<TInput, TOutput, TClient>;
}

type MocksContainer = {
  map: WeakMap<CommandConstructor<object, MetadataBearer>, MockEntry[]>;
};

function createMockImplementation(
  container: MocksContainer
): (this: AnyClient, command: AnyCommand) => Promise<MetadataBearer> {
  return async function (this: AnyClient, command: AnyCommand): Promise<MetadataBearer> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const client = this;
    const getClient = () => client;
    const mocks = container.map.get(command.constructor as CommandConstructor<object, MetadataBearer>);
    if (mocks) {
      const matchingIndex = mocks.findIndex(mock => {
        const isMatch = mock.strict
          ? mock.matcher && matchesStrict(command.input, mock.matcher)
          : !mock.matcher || matchesPartial(command.input, mock.matcher);
        return isMatch;
      });

      if (matchingIndex !== -1) {
        // eslint-disable-next-line security/detect-object-injection
        const mock = mocks[matchingIndex];
        if (mock.once) {
          mocks.splice(matchingIndex, 1);
        }
        return mock.handler(command.input, getClient);
      }
    }

    throw new Error(`No mock configured for command: ${command.constructor.name}`);
  };
}

function createCommandStub<TInput extends object, TOutput extends MetadataBearer, TClient extends AnyClient>(
  container: MocksContainer,
  command: CommandConstructor<TInput, TOutput>,
  matcher: Partial<TInput> | undefined,
  options: MockOptions = {}
): AwsCommandStub<TInput, TOutput, TClient> {
  const addEntry = (handler: CommandHandler<TInput, TOutput, TClient>, once: boolean): void => {
    const entry: MockEntry<TInput, TOutput> = {
      matcher,
      handler: handler as CommandHandler<TInput, TOutput>,
      once,
      strict: !!options.strict
    };
    const existingMocks = container.map.get(command as unknown as CommandConstructor<object, MetadataBearer>) ?? [];

    if (once) {
      // Insert "once" handlers before permanent handlers
      const permanentIndex = existingMocks.findIndex((m) => !m.once);
      if (permanentIndex === -1) {
        existingMocks.push(entry as unknown as MockEntry);
      } else {
        existingMocks.splice(permanentIndex, 0, entry as unknown as MockEntry);
      }
      container.map.set(command as unknown as CommandConstructor<object, MetadataBearer>, existingMocks);
    } else {
      // Permanent handlers replace any existing permanent handler for same matcher
      const filteredMocks = existingMocks.filter(
        (m) => m.once || JSON.stringify(m.matcher) !== JSON.stringify(matcher)
      );
      filteredMocks.push(entry as unknown as MockEntry);
      container.map.set(command as unknown as CommandConstructor<object, MetadataBearer>, filteredMocks);
    }
  };

  const stub: AwsCommandStub<TInput, TOutput, TClient> = {
    resolves(output: Partial<TOutput>): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(() => Promise.resolve(output as TOutput), false);
      return stub;
    },
    rejects(error: Error | string): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(() => {
        const err = typeof error === 'string' ? new Error(error) : error;
        return Promise.reject(err);
      }, false);
      return stub;
    },
    callsFake(fn: CommandHandler<TInput, TOutput, TClient>): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(fn, false);
      return stub;
    },
    resolvesOnce(output: Partial<TOutput>): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(() => Promise.resolve(output as TOutput), true);
      return stub;
    },
    rejectsOnce(error: Error | string): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(() => {
        const err = typeof error === 'string' ? new Error(error) : error;
        return Promise.reject(err);
      }, true);
      return stub;
    },
    callsFakeOnce(fn: CommandHandler<TInput, TOutput, TClient>): AwsCommandStub<TInput, TOutput, TClient> {
      addEntry(fn, true);
      return stub;
    },
  };

  return stub;
}

export const mockClient = <TClient extends AnyClient>(
  clientConstructor: ClientConstructor<TClient>
): AwsClientStub<TClient> => {
  const mocksContainer: MocksContainer = {
    map: new WeakMap()
  };

  // Use type assertion to handle both constructor and prototype-only objects
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const prototype = 'prototype' in clientConstructor
    ? clientConstructor.prototype
    : (clientConstructor as unknown as { prototype: TClient }).prototype;

  const sendSpy = vi
    .spyOn(prototype, 'send')
    .mockImplementation(createMockImplementation(mocksContainer));

  const stub: AwsClientStub<TClient> = {
    client: undefined,
    on: <TInput extends object, TOutput extends MetadataBearer>(
      command: CommandConstructor<TInput, TOutput>,
      request?: Partial<TInput>,
      options?: MockOptions
    ): AwsCommandStub<TInput, TOutput, TClient> => createCommandStub(mocksContainer, command, request, options),
    reset: (): void => {
      sendSpy.mockClear();
      mocksContainer.map = new WeakMap();
    },
    restore: (): void => {
      sendSpy.mockRestore();
      mocksContainer.map = new WeakMap();
    },
    calls: (): Mock['mock']['calls'] => sendSpy.mock.calls,
  };

  return stub;
};

export const mockClientInstance = <TClient extends AnyClient>(
  clientInstance: TClient
): AwsClientStub<AnyClient> => {
  const mocksContainer: MocksContainer = {
    map: new WeakMap()
  };

  // Use type assertion to work around vi.spyOn strict typing
  const sendSpy = vi.spyOn(clientInstance as unknown as AnyClient, 'send')
    .mockImplementation(createMockImplementation(mocksContainer));

  const stub: AwsClientStub<AnyClient> = {
    client: clientInstance as unknown as AnyClient,
    on: <TInput extends object, TOutput extends MetadataBearer>(
      command: CommandConstructor<TInput, TOutput>,
      request?: Partial<TInput>,
      options?: MockOptions
    ): AwsCommandStub<TInput, TOutput, AnyClient> => createCommandStub(mocksContainer, command, request, options),
    reset: (): void => {
      sendSpy.mockClear();
      mocksContainer.map = new WeakMap();
    },
    restore: (): void => {
      sendSpy.mockRestore();
      mocksContainer.map = new WeakMap();
    },
    calls: (): Mock['mock']['calls'] => sendSpy.mock.calls,
  };

  return stub;
};
