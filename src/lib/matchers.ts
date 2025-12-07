import type { AwsClientStub } from './mock-client.js';

type CommandConstructor = new (...args: unknown[]) => unknown;

interface MatcherResult {
  pass: boolean;
  message: () => string;
}

interface CommandLike {
  input: unknown;
}

export const matchers = {
  toHaveReceivedCommand(received: AwsClientStub, command: CommandConstructor): MatcherResult {
    const calls = received.calls();
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
    times: number
  ): MatcherResult {
    const calls = received.calls().filter((call) => call[0] instanceof command);
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
    input: Record<string, unknown>
  ): MatcherResult {
    const calls = received.calls().filter((call) => call[0] instanceof command);
    const pass = calls.some((call) => this.equals((call[0] as CommandLike).input, input));
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
    input: Record<string, unknown>
  ): MatcherResult {
    const calls = received.calls().filter((call) => call[0] instanceof command);
    const call = calls[n - 1];
    const pass = Boolean(call && this.equals((call[0] as CommandLike).input, input));
    const commandName = command.name;

    return {
      pass,
      message: (): string =>
        pass
          ? `Expected AWS SDK mock not to have received nth (${n}) command ${commandName} with ${JSON.stringify(input)}`
          : `Expected AWS SDK mock to have received nth (${n}) command ${commandName} with ${JSON.stringify(input)}`,
    };
  },
};

export interface AwsSdkMatchers<R = unknown> {
  toHaveReceivedCommand(command: CommandConstructor): R;
  toHaveReceivedCommandTimes(command: CommandConstructor, times: number): R;
  toHaveReceivedCommandWith(command: CommandConstructor, input: Record<string, unknown>): R;
  toHaveReceivedNthCommandWith(n: number, command: CommandConstructor, input: Record<string, unknown>): R;
}

declare module 'vitest' {
  /* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface */
  interface Assertion extends AwsSdkMatchers { }
  interface AsymmetricMatchersContaining extends AwsSdkMatchers { }
  /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface */
}
