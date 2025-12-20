import {
  S3Client,
  GetObjectCommand,
  GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { expect, test, beforeEach, afterEach, describe } from "vitest";
import { mockClient, AwsClientStub } from "./mock-client.js";
import "./vitest-setup.js";

describe("Mock Lifecycle - Reset Functionality", () => {
  let s3Mock: AwsClientStub<S3Client>;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test("reset should clear calls but keep mocks", async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: "before-reset" as unknown as GetObjectCommandOutput["Body"],
    });

    const client = new S3Client({});
    await client.send(
      new GetObjectCommand({ Bucket: "test", Key: "reset.txt" }),
    );
    expect(s3Mock.calls()).toHaveLength(1);

    s3Mock.reset();

    expect(s3Mock.calls()).toHaveLength(0);

    // Mock should still work after reset
    const result = await client.send(
      new GetObjectCommand({ Bucket: "test", Key: "reset.txt" }),
    );
    expect(result.Body).toBe("before-reset");
    expect(s3Mock.calls()).toHaveLength(1);
  });

  test("should clear call history after reset but keep mocks", async () => {
    const s3Client = new S3Client({});

    s3Mock
      .on(GetObjectCommand)
      .resolves({ Body: "test" as unknown as GetObjectCommandOutput["Body"] });

    await s3Client.send(
      new GetObjectCommand({ Bucket: "test-bucket", Key: "test-key" }),
    );
    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 1);

    s3Mock.reset();

    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 0);

    // Mock should still work after reset
    const result = await s3Client.send(
      new GetObjectCommand({ Bucket: "test-bucket", Key: "test-key" }),
    );
    expect(result.Body).toBe("test");
  });

  test("should handle multiple reset calls", () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: "test" as unknown as GetObjectCommandOutput["Body"],
    });
    s3Mock.reset();
    s3Mock.reset();
    s3Mock.reset();

    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 0);
  });

  test("should support overriding mocks after reset", async () => {
    const s3Client = new S3Client({});

    s3Mock.on(GetObjectCommand).resolves({
      Body: "first-mock" as unknown as GetObjectCommandOutput["Body"],
    });

    const firstResult = await s3Client.send(
      new GetObjectCommand({ Bucket: "test-bucket", Key: "test-key" }),
    );
    expect(firstResult.Body).toBe("first-mock");

    s3Mock.reset();

    // Override the mock with a new one
    s3Mock.on(GetObjectCommand).resolves({
      Body: "second-mock" as unknown as GetObjectCommandOutput["Body"],
    });

    const result = await s3Client.send(
      new GetObjectCommand({ Bucket: "test-bucket", Key: "test-key" }),
    );

    expect(result.Body).toBe("second-mock");
  });
});

describe("Mock Lifecycle - Restore Functionality", () => {
  test("should handle restore without mocks", () => {
    const s3Mock = mockClient(S3Client);
    expect(() => s3Mock.restore()).not.toThrow();
  });

  test("should handle multiple restore calls", () => {
    const s3Mock = mockClient(S3Client);

    expect(() => {
      s3Mock.restore();
      s3Mock.restore();
    }).not.toThrow();
  });
});

describe("Mock Lifecycle - Multiple Mocks", () => {
  test("should handle multiple mockClient calls on same class", async () => {
    // mockClient creates a class-level mock, so second call overrides first
    const s3Mock1 = mockClient(S3Client);
    s3Mock1.on(GetObjectCommand).resolves({
      Body: "first-mock" as unknown as GetObjectCommandOutput["Body"],
    });

    const s3Mock2 = mockClient(S3Client);
    s3Mock2.on(GetObjectCommand).resolves({
      Body: "second-mock" as unknown as GetObjectCommandOutput["Body"],
    });

    const client = new S3Client({});

    const result = await client.send(
      new GetObjectCommand({ Bucket: "test-bucket", Key: "test-key" }),
    );

    // Second mock should override first since they're on the same class
    expect(result.Body).toBe("second-mock");

    s3Mock2.restore();
  });
});
