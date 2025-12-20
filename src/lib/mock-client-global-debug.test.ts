import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
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
