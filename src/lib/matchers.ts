import type {
  AwsClientStub,
  CommandConstructor,
  MetadataBearer,
  StructuralCommand,
} from "./mock-client.js";
import { colors } from "./utils/colors.js";

interface MatcherResult {
  pass: boolean;
  message: () => string;
}

type ReceivedCall = readonly [
  StructuralCommand<object, MetadataBearer>,
  ...unknown[],
];

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
  toHaveReceivedCommand<TInput extends object, TOutput extends MetadataBearer>(
    received: AwsClientStub,
    command: CommandConstructor<TInput, TOutput>,
  ): MatcherResult {
    const calls = getCommandCalls(received);
    const pass = calls.some((call) => call[0] instanceof command);
    const commandName = command.name;

    return {
      pass,
      message: (): string => {
        if (pass) {
          return `Expected AWS SDK mock not to have received command ${colors.red(commandName)}`;
        }

        const receivedCommands = calls.map((call) => {
          const cmd = call[0] as { constructor?: { name?: string } };
          return cmd.constructor?.name ?? "Unknown";
        });

        if (receivedCommands.length === 0) {
          return `Expected AWS SDK mock to have received command ${colors.red(commandName)}, but ${colors.gray("no commands were received")}`;
        }

        return `Expected AWS SDK mock to have received command ${colors.red(commandName)}, but received: ${colors.yellow(receivedCommands.join(", "))}`;
      },
    };
  },

  toHaveReceivedCommandTimes<
    TInput extends object,
    TOutput extends MetadataBearer,
  >(
    received: AwsClientStub,
    command: CommandConstructor<TInput, TOutput>,
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

  toHaveReceivedCommandWith<
    TInput extends object,
    TOutput extends MetadataBearer,
  >(
    this: { equals: (a: unknown, b: unknown) => boolean },
    received: AwsClientStub,
    command: CommandConstructor<TInput, TOutput>,
    input: TInput,
  ): MatcherResult {
    const calls = getCommandCalls(received).filter(
      (call) => call[0] instanceof command,
    );
    const pass = calls.some((call) => this.equals(call[0].input, input));
    const commandName = command.name;

    return {
      pass,
      message: (): string => {
        if (pass) {
          const commandName_colored = colors.red(commandName);
          const input_colored = colors.cyan(
            JSON.stringify(input, undefined, 2),
          );
          return `Expected AWS SDK mock not to have received command ${commandName_colored} with input:\n${input_colored}`;
        }

        if (calls.length === 0) {
          const commandName_colored = colors.red(commandName);
          const input_colored = colors.cyan(
            JSON.stringify(input, undefined, 2),
          );
          const neverCalled = colors.gray(`${commandName} was never called`);
          return `Expected AWS SDK mock to have received command ${commandName_colored} with input:\n${input_colored}\n\nBut ${neverCalled}`;
        }

        const actualInputs = calls.map((call) => call[0].input);
        const commandName_colored = colors.red(commandName);
        const input_colored = colors.cyan(JSON.stringify(input, undefined, 2));
        const butReceived = colors.gray("But received");
        const commandName_yellow = colors.yellow(commandName);
        const withText = colors.gray("with");
        const actualInputs_colored = colors.yellow(
          actualInputs
            .map((inp) => JSON.stringify(inp, undefined, 2))
            .join("\n\n"),
        );
        return `Expected AWS SDK mock to have received command ${commandName_colored} with input:\n${input_colored}\n\n${butReceived} ${commandName_yellow} ${withText}:\n${actualInputs_colored}`;
      },
    };
  },

  toHaveReceivedNthCommandWith<
    TInput extends object,
    TOutput extends MetadataBearer,
  >(
    this: { equals: (a: unknown, b: unknown) => boolean },
    received: AwsClientStub,
    n: number,
    command: CommandConstructor<TInput, TOutput>,
    input: TInput,
  ): MatcherResult {
    const calls = getCommandCalls(received);
    const nthCall = calls[n - 1];
    const actualCommand = nthCall?.[0];
    const actualInput = actualCommand?.input;
    const pass =
      Boolean(nthCall) &&
      actualCommand instanceof command &&
      this.equals(actualInput, input);
    const commandName = command.name;

    return {
      pass,
      message: (): string => {
        if (pass) {
          const nColored = colors.magenta(n.toString());
          const commandNameColored = colors.red(commandName);
          const inputColored = colors.cyan(JSON.stringify(input, undefined, 2));
          return `Expected AWS SDK mock not to have received nth (${nColored}) command ${commandNameColored} with input:\n${inputColored}`;
        }

        if (!nthCall) {
          const nColored = colors.magenta(n.toString());
          const onlyReceived = colors.gray(
            `only received ${calls.length} call(s)`,
          );
          return `Expected AWS SDK mock to have received at least ${nColored} call(s), but ${onlyReceived}`;
        }

        if (!(actualCommand instanceof command)) {
          const actualName =
            (actualCommand as { constructor?: { name?: string } } | undefined)
              ?.constructor?.name ?? typeof actualCommand;
          const nColored = colors.magenta(n.toString());
          const commandNameColored = colors.red(commandName);
          const actualNameColored = colors.yellow(actualName);
          return `Expected AWS SDK mock nth (${nColored}) call to be ${commandNameColored}, but received ${actualNameColored}`;
        }

        const nColored = colors.magenta(n.toString());
        const commandNameColored = colors.red(commandName);
        const inputColored = colors.cyan(JSON.stringify(input, undefined, 2));
        const butReceived = colors.gray("But received");
        const actualInputColored = colors.yellow(
          JSON.stringify(actualInput, undefined, 2),
        );
        return `Expected AWS SDK mock nth (${nColored}) command ${commandNameColored} with input:\n${inputColored}\n\n${butReceived}:\n${actualInputColored}`;
      },
    };
  },

  toHaveReceivedNoOtherCommands<
    TInput extends object,
    TOutput extends MetadataBearer,
  >(
    received: AwsClientStub,
    expectedCommands: CommandConstructor<TInput, TOutput>[] = [],
  ): MatcherResult {
    const calls = getCommandCalls(received);
    const unexpectedCalls = calls.filter((call) => {
      const command = call[0];
      return !expectedCommands.some(
        (expectedCommand) => command instanceof expectedCommand,
      );
    });

    const pass = unexpectedCalls.length === 0;

    return {
      pass,
      message: (): string => {
        if (pass) {
          return `Expected AWS SDK mock to have received other commands besides ${colors.green(expectedCommands.map((c) => c.name).join(", "))}`;
        }

        const unexpectedCommandNames = unexpectedCalls.map((call) => {
          const command = call[0] as { constructor?: { name?: string } };
          return command.constructor?.name ?? "Unknown";
        });

        return `Expected AWS SDK mock to have received ${colors.gray("no other commands")}, but received: ${colors.red(unexpectedCommandNames.join(", "))}`;
      },
    };
  },
};

export interface AwsSdkMatchers<R = unknown> {
  toHaveReceivedCommand<TInput extends object, TOutput extends MetadataBearer>(
    command: CommandConstructor<TInput, TOutput>,
  ): R;
  toHaveReceivedCommandTimes<
    TInput extends object,
    TOutput extends MetadataBearer,
  >(
    command: CommandConstructor<TInput, TOutput>,
    times: number,
  ): R;
  toHaveReceivedCommandWith<
    TInput extends object,
    TOutput extends MetadataBearer,
  >(
    command: CommandConstructor<TInput, TOutput>,
    input: TInput,
  ): R;
  toHaveReceivedNthCommandWith<
    TInput extends object,
    TOutput extends MetadataBearer,
  >(
    n: number,
    command: CommandConstructor<TInput, TOutput>,
    input: TInput,
  ): R;

  toHaveReceivedNoOtherCommands<
    TInput extends object,
    TOutput extends MetadataBearer,
  >(
    expectedCommands?: CommandConstructor<TInput, TOutput>[],
  ): R;
}

export type { MatcherResult };

declare module "vitest" {
  /* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface -- Required for Vitest module augmentation to extend assertion interfaces */
  interface Assertion extends AwsSdkMatchers {}
  interface AsymmetricMatchersContaining extends AwsSdkMatchers {}
  /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-empty-interface */
}
