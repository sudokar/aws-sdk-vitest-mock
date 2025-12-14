import type { AwsClientStub } from "./mock-client.js";

type CommandConstructor = new (...args: unknown[]) => unknown;

interface MatcherResult {
  pass: boolean;
  message: () => string;
}

interface CommandLike {
  input: unknown;
}

type ReceivedCall = readonly [unknown, ...unknown[]];

const getCommandCalls = (stub: AwsClientStub): ReceivedCall[] => {
  const rawCalls = stub.calls() as unknown;

  if (!Array.isArray(rawCalls)) {
    return [];
  }

  return rawCalls.filter(
    (call): call is ReceivedCall => Array.isArray(call) && call.length > 0,
  );
};

export const matchers = {
  toHaveReceivedCommand(
    received: AwsClientStub,
    command: CommandConstructor,
  ): MatcherResult {
    const calls = getCommandCalls(received);
    const pass = calls.some((call) => call[0] instanceof command);
    const commandName = command.name;

    return {
      pass,
      message: (): string =>
        pass
          ? `Expected AWS SDK mock not to have received command ${commandName}`
          : `Expected AWS SDK mock to have received command ${commandName}`,
    };
  },

  toHaveReceivedCommandTimes(
    received: AwsClientStub,
    command: CommandConstructor,
    times: number,
  ): MatcherResult {
    const calls = getCommandCalls(received).filter(
      (call) => call[0] instanceof command,
    );
    const pass = calls.length === times;
    const commandName = command.name;

    return {
      pass,
      message: (): string =>
        pass
          ? `Expected AWS SDK mock not to have received command ${commandName} ${times} times`
          : `Expected AWS SDK mock to have received command ${commandName} ${times} times, but received ${calls.length} times`,
    };
  },

  toHaveReceivedCommandWith(
    this: { equals: (a: unknown, b: unknown) => boolean },
    received: AwsClientStub,
    command: CommandConstructor,
    input: Record<string, unknown>,
  ): MatcherResult {
    const calls = getCommandCalls(received).filter(
      (call) => call[0] instanceof command,
    );
    const pass = calls.some((call) =>
      this.equals((call[0] as CommandLike).input, input),
    );
    const commandName = command.name;

    return {
      pass,
      message: (): string =>
        pass
          ? `Expected AWS SDK mock not to have received command ${commandName} with ${JSON.stringify(input)}`
          : `Expected AWS SDK mock to have received command ${commandName} with ${JSON.stringify(input)}`,
    };
  },

  toHaveReceivedNthCommandWith(
    this: { equals: (a: unknown, b: unknown) => boolean },
    received: AwsClientStub,
    n: number,
    command: CommandConstructor,
    input: Record<string, unknown>,
  ): MatcherResult {
    const calls = getCommandCalls(received);
    const nthCall = calls[n - 1];
    const actualCommand = nthCall?.[0];
    const actualInput = (actualCommand as CommandLike | undefined)?.input;
    const pass =
      Boolean(nthCall) &&
      actualCommand instanceof command &&
      this.equals(actualInput, input);
    const commandName = command.name;

    return {
      pass,
      message: (): string => {
        if (pass) {
          return `Expected AWS SDK mock not to have received nth (${n}) command ${commandName} with ${JSON.stringify(input)}`;
        }

        if (!nthCall) {
          return `Expected AWS SDK mock to have received at least ${n} call(s), but received ${calls.length}.`;
        }

        if (!(actualCommand instanceof command)) {
          const actualName =
            (actualCommand as { constructor?: { name?: string } } | undefined)
              ?.constructor?.name ?? typeof actualCommand;
          return `Expected AWS SDK mock nth (${n}) call to be ${commandName}, but received ${actualName}.`;
        }

        return `Expected AWS SDK mock nth (${n}) command ${commandName} with ${JSON.stringify(input)}, but received ${JSON.stringify(actualInput)}.`;
      },
    };
  },
};

export interface AwsSdkMatchers<R = unknown> {
  toHaveReceivedCommand(command: CommandConstructor): R;
  toHaveReceivedCommandTimes(command: CommandConstructor, times: number): R;
  toHaveReceivedCommandWith(
    command: CommandConstructor,
    input: Record<string, unknown>,
  ): R;
  toHaveReceivedNthCommandWith(
    n: number,
    command: CommandConstructor,
    input: Record<string, unknown>,
  ): R;
}

export type { MatcherResult };

declare module "vitest" {
  /* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface */
  interface Assertion extends AwsSdkMatchers {}
  interface AsymmetricMatchersContaining extends AwsSdkMatchers {}
  /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface */
}
