import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { expect, test, beforeEach, vi } from "vitest";
import { matchers } from "./matchers.js";
import type { AwsSdkMatchers, MatcherResult } from "./matchers.js";
import { mockClient } from "./mock-client.js";
import "./vitest-setup.js";

// Ensure TypeScript knows about the extended matchers
declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface,@typescript-eslint/no-empty-object-type
  interface Assertion extends AwsSdkMatchers {}
}

const ddbMock = mockClient(DynamoDBDocumentClient);

const matcherContext = {
  equals: (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b),
};

const isMatcherResult = (value: unknown): value is MatcherResult =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { pass?: unknown }).pass === "boolean" &&
  typeof (value as { message?: unknown }).message === "function";

const toMatcherResult = (value: unknown): MatcherResult => {
  if (!isMatcherResult(value)) {
    throw new TypeError(
      "Received matcher result does not match the expected shape.",
    );
  }

  return value;
};

beforeEach(() => {
  ddbMock.reset();
});

test("toHaveReceivedCommand", async () => {
  ddbMock.on(GetCommand).resolves({});

  const ddbClient = new DynamoDBClient({ region: "us-east-1" });
  const client = DynamoDBDocumentClient.from(ddbClient);
  await client.send(new GetCommand({ TableName: "test", Key: { id: "1" } }));

  expect(ddbMock).toHaveReceivedCommand(GetCommand);
  const result = toMatcherResult(
    matchers.toHaveReceivedCommand(ddbMock, GetCommand),
  );
  expect(result.pass).toBe(true);
  expect(result.message()).toBe(
    "Expected AWS SDK mock not to have received command GetCommand",
  );
});

test("toHaveReceivedCommandTimes", async () => {
  ddbMock.on(GetCommand).resolves({});
  const ddbClient = new DynamoDBClient({ region: "us-east-1" });
  const client = DynamoDBDocumentClient.from(ddbClient);
  await client.send(new GetCommand({ TableName: "test", Key: { id: "1" } }));
  await client.send(new GetCommand({ TableName: "test", Key: { id: "2" } }));
  expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 2);
  const result = toMatcherResult(
    matchers.toHaveReceivedCommandTimes(ddbMock, GetCommand, 2),
  );
  expect(result.pass).toBe(true);
  expect(result.message()).toBe(
    "Expected AWS SDK mock not to have received command GetCommand 2 times",
  );
});

test("toHaveReceivedCommandWith", async () => {
  ddbMock.on(GetCommand).resolves({});
  const ddbClient = new DynamoDBClient({ region: "us-east-1" });
  const client = DynamoDBDocumentClient.from(ddbClient);
  await client.send(new GetCommand({ TableName: "test", Key: { id: "1" } }));
  expect(ddbMock).toHaveReceivedCommandWith(GetCommand, {
    TableName: "test",
    Key: { id: "1" },
  });
  const result = toMatcherResult(
    matchers.toHaveReceivedCommandWith.call(
      matcherContext,
      ddbMock,
      GetCommand,
      {
        TableName: "test",
        Key: { id: "1" },
      },
    ),
  );
  expect(result.pass).toBe(true);
  expect(result.message()).toBe(
    'Expected AWS SDK mock not to have received command GetCommand with {"TableName":"test","Key":{"id":"1"}}',
  );
});

test("toHaveReceivedNthCommandWith", async () => {
  ddbMock.on(GetCommand).resolves({});
  const ddbClient = new DynamoDBClient({ region: "us-east-1" });
  const client = DynamoDBDocumentClient.from(ddbClient);
  await client.send(new GetCommand({ TableName: "test", Key: { id: "1" } }));
  await client.send(new GetCommand({ TableName: "test", Key: { id: "2" } }));
  expect(ddbMock).toHaveReceivedNthCommandWith(2, GetCommand, {
    TableName: "test",
    Key: { id: "2" },
  });
  const result = toMatcherResult(
    matchers.toHaveReceivedNthCommandWith.call(
      matcherContext,
      ddbMock,
      2,
      GetCommand,
      {
        TableName: "test",
        Key: { id: "2" },
      },
    ),
  );
  expect(result.pass).toBe(true);
  expect(result.message()).toBe(
    'Expected AWS SDK mock not to have received nth (2) command GetCommand with {"TableName":"test","Key":{"id":"2"}}',
  );
});

test("toHaveReceivedCommand returns expected message when command not received", () => {
  ddbMock.on(GetCommand).resolves({});
  const result = toMatcherResult(
    matchers.toHaveReceivedCommand(ddbMock, GetCommand),
  );
  expect(result.pass).toBe(false);
  expect(result.message()).toBe(
    "Expected AWS SDK mock to have received command GetCommand",
  );
});

test("toHaveReceivedCommandTimes returns expected message when call count differs", async () => {
  ddbMock.on(GetCommand).resolves({});
  const ddbClient = new DynamoDBClient({ region: "us-east-1" });
  const client = DynamoDBDocumentClient.from(ddbClient);
  await client.send(new GetCommand({ TableName: "test", Key: { id: "1" } }));
  const result = toMatcherResult(
    matchers.toHaveReceivedCommandTimes(ddbMock, GetCommand, 2),
  );
  expect(result.pass).toBe(false);
  expect(result.message()).toBe(
    "Expected AWS SDK mock to have received command GetCommand 2 times, but received 1 times",
  );
});

test("toHaveReceivedCommandWith returns expected message when input differs", async () => {
  ddbMock.on(GetCommand).resolves({});
  const ddbClient = new DynamoDBClient({ region: "us-east-1" });
  const client = DynamoDBDocumentClient.from(ddbClient);
  await client.send(new GetCommand({ TableName: "test", Key: { id: "1" } }));
  const result = toMatcherResult(
    matchers.toHaveReceivedCommandWith.call(
      matcherContext,
      ddbMock,
      GetCommand,
      {
        TableName: "test",
        Key: { id: "2" },
      },
    ),
  );
  expect(result.pass).toBe(false);
  expect(result.message()).toBe(
    'Expected AWS SDK mock to have received command GetCommand with {"TableName":"test","Key":{"id":"2"}}',
  );
});

test("toHaveReceivedNthCommandWith returns expected message when nth input differs", async () => {
  ddbMock.on(GetCommand).resolves({});
  const ddbClient = new DynamoDBClient({ region: "us-east-1" });
  const client = DynamoDBDocumentClient.from(ddbClient);
  await client.send(new GetCommand({ TableName: "test", Key: { id: "1" } }));
  await client.send(new GetCommand({ TableName: "test", Key: { id: "2" } }));
  const result = toMatcherResult(
    matchers.toHaveReceivedNthCommandWith.call(
      matcherContext,
      ddbMock,
      2,
      GetCommand,
      {
        TableName: "test",
        Key: { id: "3" },
      },
    ),
  );
  expect(result.pass).toBe(false);
  expect(result.message()).toBe(
    'Expected AWS SDK mock nth (2) command GetCommand with {"TableName":"test","Key":{"id":"3"}}, but received {"TableName":"test","Key":{"id":"2"}}.',
  );
});

test("toHaveReceivedNthCommandWith returns expected message when nth command missing", async () => {
  ddbMock.on(GetCommand).resolves({});
  const ddbClient = new DynamoDBClient({ region: "us-east-1" });
  const client = DynamoDBDocumentClient.from(ddbClient);
  await client.send(new GetCommand({ TableName: "test", Key: { id: "1" } }));
  const result = toMatcherResult(
    matchers.toHaveReceivedNthCommandWith.call(
      matcherContext,
      ddbMock,
      2,
      GetCommand,
      {
        TableName: "test",
        Key: { id: "2" },
      },
    ),
  );
  expect(result.pass).toBe(false);
  expect(result.message()).toBe(
    "Expected AWS SDK mock to have received at least 2 call(s), but received 1.",
  );
});

test("toHaveReceivedNoOtherCommands should pass when no other commands received", async () => {
  const mock = mockClient(DynamoDBClient);
  const client = new DynamoDBClient({});

  mock.on(GetItemCommand).resolves({ Item: { id: { S: "1" } } });
  await client.send(
    new GetItemCommand({ TableName: "test", Key: { id: { S: "1" } } }),
  );

  const result = matchers.toHaveReceivedNoOtherCommands.call(
    { equals: vi.fn() },
    mock,
    [GetItemCommand],
  ) as MatcherResult;

  expect(result.pass).toBe(true);
  mock.restore();
});

test("toHaveReceivedNoOtherCommands should fail when unexpected commands received", async () => {
  const mock = mockClient(DynamoDBClient);
  const client = new DynamoDBClient({});

  mock.on(GetItemCommand).resolves({ Item: { id: { S: "1" } } });
  mock.on(PutItemCommand).resolves({});

  await client.send(
    new GetItemCommand({ TableName: "test", Key: { id: { S: "1" } } }),
  );
  await client.send(
    new PutItemCommand({ TableName: "test", Item: { id: { S: "2" } } }),
  );

  const result = matchers.toHaveReceivedNoOtherCommands.call(
    { equals: vi.fn() },
    mock,
    [GetItemCommand],
  ) as MatcherResult;

  expect(result.pass).toBe(false);
  expect(result.message()).toBe(
    "Expected AWS SDK mock to have received no other commands, but received: PutItemCommand",
  );
  mock.restore();
});

test("toHaveReceivedNoOtherCommands should pass with empty expected commands", () => {
  const mock = mockClient(DynamoDBClient);

  const result = matchers.toHaveReceivedNoOtherCommands.call(
    { equals: vi.fn() },
    mock,
    [],
  ) as MatcherResult;

  expect(result.pass).toBe(true);
  mock.restore();
});
