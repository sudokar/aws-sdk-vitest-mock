import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import {
  S3Client,
  GetObjectCommand,
  GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import {
  mockClient,
  mockClientInstance,
  setGlobalDebug,
} from "./mock-client.js";

describe("Global Debug Configuration", () => {
  let consoleSpy: Mock<typeof console.log>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => void 0);
    // Reset global debug state before each test
    setGlobalDebug(false);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    // Clean up global debug state
    setGlobalDebug(false);
  });

  describe("setGlobalDebug", () => {
    test("should not log when global debug is disabled by default", async () => {
      const s3Mock = mockClient(S3Client);
      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      const client = new S3Client({});
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test" }));

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    test("should enable global debug", async () => {
      setGlobalDebug(true);
      const s3Mock = mockClient(S3Client);
      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      const client = new S3Client({});
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test" }));

      expect(consoleSpy).toHaveBeenCalled();
    });

    test("should disable global debug", async () => {
      setGlobalDebug(true);
      setGlobalDebug(false);
      const s3Mock = mockClient(S3Client);
      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      const client = new S3Client({});
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test" }));

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe("Global debug with new mocks", () => {
    test("should not log when global debug is disabled", async () => {
      setGlobalDebug(false);
      const s3Mock = mockClient(S3Client);
      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      const client = new S3Client({});
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test" }));

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    test("should log when global debug is enabled", async () => {
      setGlobalDebug(true);
      const s3Mock = mockClient(S3Client);
      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      const client = new S3Client({});
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test" }));

      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.map((call) => String(call[0]));
      const hasDebugLog = calls.some((call) =>
        call.includes("aws-sdk-vitest-mock(debug):"),
      );
      expect(hasDebugLog).toBe(true);
    });

    test("should enable debug for multiple mocks when global debug is on", async () => {
      setGlobalDebug(true);
      const s3Mock = mockClient(S3Client);
      const dynamoMock = mockClient(DynamoDBClient);

      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });
      dynamoMock.on(GetItemCommand).resolves({ Item: { id: { S: "1" } } });

      const s3Client = new S3Client({});
      const dynamoClient = new DynamoDBClient({});

      await s3Client.send(
        new GetObjectCommand({ Bucket: "test", Key: "test" }),
      );
      await dynamoClient.send(
        new GetItemCommand({ TableName: "test", Key: { id: { S: "1" } } }),
      );

      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.map((call) => String(call[0]));
      const s3Logs = calls.filter((call) => call.includes("GetObjectCommand"));
      const dynamoLogs = calls.filter((call) =>
        call.includes("GetItemCommand"),
      );

      expect(s3Logs.length).toBeGreaterThan(0);
      expect(dynamoLogs.length).toBeGreaterThan(0);
    });
  });

  describe("Individual mock debug overrides", () => {
    test("should disable debug for individual mock when global is enabled", async () => {
      setGlobalDebug(true);
      const s3Mock = mockClient(S3Client);
      s3Mock.disableDebug();
      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      const client = new S3Client({});
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test" }));

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    test("should enable debug for individual mock when global is disabled", async () => {
      setGlobalDebug(false);
      const s3Mock = mockClient(S3Client);
      s3Mock.enableDebug();
      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      const client = new S3Client({});
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test" }));

      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.map((call) => String(call[0]));
      const hasDebugLog = calls.some((call) =>
        call.includes("aws-sdk-vitest-mock(debug):"),
      );
      expect(hasDebugLog).toBe(true);
    });

    test("should respect individual overrides with multiple mocks", async () => {
      setGlobalDebug(true);
      const s3Mock = mockClient(S3Client);
      const dynamoMock = mockClient(DynamoDBClient);

      s3Mock.disableDebug(); // Explicitly disabled
      // dynamoMock inherits global debug (enabled)

      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });
      dynamoMock.on(GetItemCommand).resolves({ Item: { id: { S: "1" } } });

      const s3Client = new S3Client({});
      const dynamoClient = new DynamoDBClient({});

      consoleSpy.mockClear();
      await s3Client.send(
        new GetObjectCommand({ Bucket: "test", Key: "test" }),
      );

      // S3 should not log
      const s3Calls = consoleSpy.mock.calls.filter((call) =>
        String(call[0]).includes("GetObjectCommand"),
      );
      expect(s3Calls.length).toBe(0);

      consoleSpy.mockClear();
      await dynamoClient.send(
        new GetItemCommand({ TableName: "test", Key: { id: { S: "1" } } }),
      );

      // DynamoDB should log
      const dynamoCalls = consoleSpy.mock.calls.filter((call) =>
        String(call[0]).includes("GetItemCommand"),
      );
      expect(dynamoCalls.length).toBeGreaterThan(0);
    });

    test("should allow enabling after disabling", async () => {
      setGlobalDebug(false);
      const s3Mock = mockClient(S3Client);
      s3Mock.disableDebug();
      s3Mock.enableDebug(); // Should now be enabled
      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      const client = new S3Client({});
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test" }));

      expect(consoleSpy).toHaveBeenCalled();
    });

    test("should allow disabling after enabling", async () => {
      setGlobalDebug(true);
      const s3Mock = mockClient(S3Client);
      s3Mock.enableDebug();
      s3Mock.disableDebug(); // Should now be disabled
      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      const client = new S3Client({});
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test" }));

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe("Global debug state changes", () => {
    test("should affect new commands after global debug is changed", async () => {
      setGlobalDebug(false);
      const s3Mock = mockClient(S3Client);
      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      const client = new S3Client({});

      // First call - no debug
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test1" }));
      expect(consoleSpy).not.toHaveBeenCalled();

      // Enable global debug
      setGlobalDebug(true);

      // Second call - should have debug
      consoleSpy.mockClear();
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test2" }));
      expect(consoleSpy).toHaveBeenCalled();
    });

    test("should not affect mocks with explicit settings when global changes", async () => {
      setGlobalDebug(false);
      const s3Mock = mockClient(S3Client);
      s3Mock.enableDebug(); // Explicitly enabled
      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      const client = new S3Client({});

      // First call - debug enabled
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test1" }));
      expect(consoleSpy).toHaveBeenCalled();

      // Enable global debug (mock already explicitly enabled)
      setGlobalDebug(true);
      consoleSpy.mockClear();
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test2" }));
      expect(consoleSpy).toHaveBeenCalled();

      // Disable global debug (mock should still be enabled due to explicit setting)
      setGlobalDebug(false);
      consoleSpy.mockClear();
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test3" }));
      expect(consoleSpy).toHaveBeenCalled(); // Still logging due to explicit setting
    });
  });

  describe("Reset behavior", () => {
    test("should preserve explicit debug setting after reset", async () => {
      setGlobalDebug(false);
      const s3Mock = mockClient(S3Client);
      s3Mock.enableDebug(); // Explicitly enabled
      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      const client = new S3Client({});
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test1" }));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockClear();

      s3Mock.reset();

      // Should still log after reset
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test2" }));
      expect(consoleSpy).toHaveBeenCalled();
    });

    test("should preserve global debug inheritance after reset", async () => {
      setGlobalDebug(true);
      const s3Mock = mockClient(S3Client);
      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      const client = new S3Client({});
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test1" }));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockClear();

      s3Mock.reset();

      // Should still inherit global debug
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test2" }));
      expect(consoleSpy).toHaveBeenCalled();
    });

    test("should log reset operation when debug is enabled", () => {
      setGlobalDebug(true);
      const s3Mock = mockClient(S3Client);
      consoleSpy.mockClear();

      s3Mock.reset();

      const calls = consoleSpy.mock.calls.map((call) => String(call[0]));
      const resetLog = calls.find((call) =>
        call.includes("Clearing call history"),
      );
      expect(resetLog).toBeDefined();
    });

    test("should not log reset operation when debug is disabled", () => {
      setGlobalDebug(false);
      const s3Mock = mockClient(S3Client);
      consoleSpy.mockClear();

      s3Mock.reset();

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe("Restore behavior", () => {
    test("should log restore operation when debug is enabled", () => {
      setGlobalDebug(true);
      const s3Mock = mockClient(S3Client);
      consoleSpy.mockClear();

      s3Mock.restore();

      const calls = consoleSpy.mock.calls.map((call) => String(call[0]));
      const restoreLog = calls.find((call) =>
        call.includes("Restoring original client behavior"),
      );
      expect(restoreLog).toBeDefined();
    });

    test("should not log restore operation when debug is disabled", () => {
      setGlobalDebug(false);
      const s3Mock = mockClient(S3Client);
      consoleSpy.mockClear();

      s3Mock.restore();

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe("mockClientInstance with global debug", () => {
    test("should inherit global debug for client instances", async () => {
      setGlobalDebug(true);
      const client = new S3Client({});
      const s3Mock = mockClientInstance(client);
      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test" }));

      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.map((call) => String(call[0]));
      const hasDebugLog = calls.some((call) =>
        call.includes("aws-sdk-vitest-mock(debug):"),
      );
      expect(hasDebugLog).toBe(true);
    });

    test("should allow explicit override for client instances", async () => {
      setGlobalDebug(true);
      const client = new S3Client({});
      const s3Mock = mockClientInstance(client);
      s3Mock.disableDebug(); // Explicit override
      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test" }));

      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe("Mock configuration logging", () => {
    test("should log mock configuration when global debug is enabled", () => {
      setGlobalDebug(true);
      const s3Mock = mockClient(S3Client);
      consoleSpy.mockClear();

      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      const calls = consoleSpy.mock.calls.map((call) => String(call[0]));
      const configLog = calls.find((call) => call.includes("Configured"));
      expect(configLog).toBeDefined();
    });

    test("should not log mock configuration when global debug is disabled", () => {
      setGlobalDebug(false);
      const s3Mock = mockClient(S3Client);
      consoleSpy.mockClear();

      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    test("should log mock configuration for explicit enable", () => {
      setGlobalDebug(false);
      const s3Mock = mockClient(S3Client);
      s3Mock.enableDebug();
      consoleSpy.mockClear();

      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      const calls = consoleSpy.mock.calls.map((call) => String(call[0]));
      const configLog = calls.find((call) => call.includes("Configured"));
      expect(configLog).toBeDefined();
    });
  });

  describe("Edge cases", () => {
    test("should handle multiple enable/disable calls", async () => {
      setGlobalDebug(false);
      const s3Mock = mockClient(S3Client);
      s3Mock.enableDebug();
      s3Mock.disableDebug();
      s3Mock.enableDebug();
      s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

      const client = new S3Client({});
      await client.send(new GetObjectCommand({ Bucket: "test", Key: "test" }));

      expect(consoleSpy).toHaveBeenCalled();
    });

    test("should work correctly with no mocks configured", async () => {
      setGlobalDebug(true);
      mockClient(S3Client);

      const client = new S3Client({});

      await expect(
        client.send(new GetObjectCommand({ Bucket: "test", Key: "test" })),
      ).rejects.toThrow();

      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.map((call) => String(call[0]));
      const noMockLog = calls.find((call) =>
        call.includes("No mocks configured"),
      );
      expect(noMockLog).toBeDefined();
    });
  });
});

describe("Debug Mode", () => {
  let s3Mock: ReturnType<typeof mockClient>;
  let s3Client: S3Client;
  let consoleSpy: any;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
    s3Client = new S3Client({});
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => void 0);
  });

  afterEach(() => {
    s3Mock.restore();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    consoleSpy.mockRestore();
  });

  test("should not log when debug is disabled", async () => {
    s3Mock
      .on(GetObjectCommand)
      .resolves({ Body: "test" as unknown as GetObjectCommandOutput["Body"] });

    await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  test("should log when debug is enabled", async () => {
    s3Mock.enableDebug();
    s3Mock
      .on(GetObjectCommand)
      .resolves({ Body: "test" as unknown as GetObjectCommandOutput["Body"] });

    await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    // Check that configuration was logged
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const configCall = consoleSpy.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        call[0].includes("Configured resolves for GetObjectCommand"),
    );
    expect(configCall).toBeDefined();

    // Check that the command received log includes the full object
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const commandLog = consoleSpy.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        call[0].includes("Received command: GetObjectCommand"),
    );
    expect(commandLog).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const commandLogText = String(commandLog?.[0] ?? "");
    expect(commandLogText).toContain('"Bucket"');
    expect(commandLogText).toContain('"test-bucket"');
    expect(commandLogText).toContain('"Key"');
    expect(commandLogText).toContain('"test-key"');

    // Check that mock was found and used
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const foundCall = consoleSpy.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        call[0].includes("Found 1 mock(s) for GetObjectCommand"),
    );
    expect(foundCall).toBeDefined();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const usingCall = consoleSpy.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        call[0].includes("Using mock at index 0 for GetObjectCommand"),
    );
    expect(usingCall).toBeDefined();
  });

  test("should log mock configuration", () => {
    s3Mock.enableDebug();

    s3Mock
      .on(GetObjectCommand, { Bucket: "test-bucket" })
      .resolves({ Body: "test" as unknown as GetObjectCommandOutput["Body"] });

    // Check that the configuration log includes the full matcher details
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const firstCall = consoleSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const configLog = String(firstCall?.[0] ?? "");
    expect(configLog).toContain("Configured resolves for GetObjectCommand");
    expect(configLog).toContain('"Bucket"');
    expect(configLog).toContain('"test-bucket"');
    expect(configLog).toContain('"strict"');
    expect(configLog).toContain("false");
  });

  test("should log resolvesOnce configuration", () => {
    s3Mock.enableDebug();

    s3Mock.on(GetObjectCommand).resolvesOnce({
      Body: "once" as unknown as GetObjectCommandOutput["Body"],
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const call = consoleSpy.mock.calls[0]?.[0] as string;
    expect(call).toContain("aws-sdk-vitest-mock(debug):");
    expect(call).toContain("Configured resolvesOnce for GetObjectCommand");
  });

  test("should log rejects configuration", () => {
    s3Mock.enableDebug();

    s3Mock.on(GetObjectCommand).rejects(new Error("test error"));

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const call = consoleSpy.mock.calls[0]?.[0] as string;
    expect(call).toContain("aws-sdk-vitest-mock(debug):");
    expect(call).toContain("Configured rejects for GetObjectCommand");
  });

  test("should log reset operation", () => {
    s3Mock.enableDebug();

    s3Mock.reset();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const call = consoleSpy.mock.calls[0]?.[0] as string;
    expect(call).toContain("aws-sdk-vitest-mock(debug):");
    expect(call).toContain("Clearing call history (mocks preserved)");
  });

  test("should log restore operation", () => {
    s3Mock.enableDebug();

    s3Mock.restore();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const call = consoleSpy.mock.calls[0]?.[0] as string;
    expect(call).toContain("aws-sdk-vitest-mock(debug):");
    expect(call).toContain(
      "Restoring original client behavior and clearing all mocks",
    );
  });

  test("should log when no mock is found", async () => {
    s3Mock.enableDebug();

    await expect(
      s3Client.send(
        new GetObjectCommand({
          Bucket: "test-bucket",
          Key: "test-key",
        }),
      ),
    ).rejects.toThrow();

    expect(consoleSpy).toHaveBeenCalled();
  });

  test("should log when mock does not match", async () => {
    s3Mock.enableDebug();

    s3Mock
      .on(GetObjectCommand, { Bucket: "other-bucket" })
      .resolves({ Body: "test" as unknown as GetObjectCommandOutput["Body"] });

    await expect(
      s3Client.send(
        new GetObjectCommand({
          Bucket: "test-bucket",
          Key: "test-key",
        }),
      ),
    ).rejects.toThrow();

    // Check that mocks were found
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const foundCall = consoleSpy.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        call[0].includes("Found 1 mock(s) for GetObjectCommand"),
    );
    expect(foundCall).toBeDefined();

    // Check that the no matching mock log includes the full object
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const noMatchLog = consoleSpy.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        call[0].includes("No matching mock found for GetObjectCommand"),
    );
    expect(noMatchLog).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const noMatchLogText = String(noMatchLog?.[0] ?? "");
    expect(noMatchLogText).toContain('"Bucket"');
    expect(noMatchLogText).toContain('"test-bucket"');
    expect(noMatchLogText).toContain('"Key"');
    expect(noMatchLogText).toContain('"test-key"');
  });

  test("should log when one-time mock is removed", async () => {
    s3Mock.enableDebug();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    consoleSpy.mockClear(); // Clear the configuration log

    s3Mock.on(GetObjectCommand).resolvesOnce({
      Body: "once" as unknown as GetObjectCommandOutput["Body"],
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    consoleSpy.mockClear(); // Clear the configuration log before sending

    await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    // Check that one-time mock removal was logged
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const removeCall = consoleSpy.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        call[0].includes("Removed one-time mock for GetObjectCommand"),
    );
    expect(removeCall).toBeDefined();
  });

  test("should stop logging when debug is disabled", async () => {
    s3Mock.enableDebug();
    s3Mock.disableDebug();

    s3Mock
      .on(GetObjectCommand)
      .resolves({ Body: "test" as unknown as GetObjectCommandOutput["Body"] });

    await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
