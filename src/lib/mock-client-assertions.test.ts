import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { expect, test, beforeEach, afterEach, describe } from "vitest";
import { mockClient } from "./mock-client.js";
import "./vitest-setup.js";

describe("Strict Command Verification", () => {
  let s3Mock: ReturnType<typeof mockClient>;
  let s3Client: S3Client;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
    s3Client = new S3Client({});
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test("should pass when no other commands are received", async () => {
    s3Mock
      .on(GetObjectCommand)
      .resolves({ Body: "test" as unknown as GetObjectCommandOutput["Body"] });

    await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    expect(s3Mock).toHaveReceivedNoOtherCommands([GetObjectCommand]);
  });

  test("should fail when unexpected commands are received", async () => {
    s3Mock
      .on(GetObjectCommand)
      .resolves({ Body: "test" as unknown as GetObjectCommandOutput["Body"] });
    s3Mock.on(PutObjectCommand).resolves({});

    await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    await s3Client.send(
      new PutObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
        Body: "data",
      }),
    );

    expect(() => {
      expect(s3Mock).toHaveReceivedNoOtherCommands([GetObjectCommand]);
    }).toThrow(
      "Expected AWS SDK mock to have received \u001B[90mno other commands\u001B[39m, but received: \u001B[31mPutObjectCommand\u001B[39m",
    );
  });

  test("should pass when all expected commands are allowed", async () => {
    s3Mock
      .on(GetObjectCommand)
      .resolves({ Body: "test" as unknown as GetObjectCommandOutput["Body"] });
    s3Mock.on(PutObjectCommand).resolves({});

    await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    await s3Client.send(
      new PutObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
        Body: "data",
      }),
    );

    expect(s3Mock).toHaveReceivedNoOtherCommands([
      GetObjectCommand,
      PutObjectCommand,
    ]);
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 1);
  });

  test("should verify no commands received", () => {
    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 0);
  });
});
describe("Assertion Matcher Edge Cases", () => {
  test("should verify zero command invocations", () => {
    const s3Mock = mockClient(S3Client);

    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 0);

    s3Mock.restore();
  });

  test("should handle toHaveReceivedCommandWith on non-received command", () => {
    const s3Mock = mockClient(S3Client);

    expect(() => {
      expect(s3Mock).toHaveReceivedCommandWith(GetObjectCommand, {
        Bucket: "test-bucket",
        Key: "test-key",
      });
    }).toThrow();

    s3Mock.restore();
  });

  test("should verify nth command when exactly n commands received", async () => {
    const s3Mock = mockClient(S3Client);
    const s3Client = new S3Client({});

    s3Mock.on(GetObjectCommand).resolves({
      Body: "data" as unknown as GetObjectCommandOutput["Body"],
    });

    await s3Client.send(
      new GetObjectCommand({ Bucket: "bucket1", Key: "key1" }),
    );
    await s3Client.send(
      new GetObjectCommand({ Bucket: "bucket2", Key: "key2" }),
    );

    expect(s3Mock).toHaveReceivedNthCommandWith(2, GetObjectCommand, {
      Bucket: "bucket2",
      Key: "key2",
    });

    s3Mock.restore();
  });

  test("should fail when nth command index exceeds call count", async () => {
    const s3Mock = mockClient(S3Client);
    const s3Client = new S3Client({});

    s3Mock.on(GetObjectCommand).resolves({
      Body: "data" as unknown as GetObjectCommandOutput["Body"],
    });

    await s3Client.send(
      new GetObjectCommand({ Bucket: "bucket1", Key: "key1" }),
    );

    expect(() => {
      expect(s3Mock).toHaveReceivedNthCommandWith(5, GetObjectCommand, {
        Bucket: "bucket1",
        Key: "key1",
      });
    }).toThrow();

    s3Mock.restore();
  });

  test("should verify commands with multiple different command types", async () => {
    const s3Mock = mockClient(S3Client);
    const s3Client = new S3Client({});

    s3Mock.on(GetObjectCommand).resolves({
      Body: "data" as unknown as GetObjectCommandOutput["Body"],
    });
    s3Mock.on(PutObjectCommand).resolves({ ETag: "etag" });
    s3Mock.on(DeleteObjectCommand).resolves({});

    await s3Client.send(
      new GetObjectCommand({ Bucket: "test-bucket", Key: "test-key" }),
    );
    await s3Client.send(
      new PutObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
        Body: "data",
      }),
    );
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: "test-bucket", Key: "test-key" }),
    );

    expect(s3Mock).toHaveReceivedCommand(GetObjectCommand);
    expect(s3Mock).toHaveReceivedCommand(PutObjectCommand);
    expect(s3Mock).toHaveReceivedCommand(DeleteObjectCommand);
    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 1);
    expect(s3Mock).toHaveReceivedCommandTimes(PutObjectCommand, 1);
    expect(s3Mock).toHaveReceivedCommandTimes(DeleteObjectCommand, 1);

    s3Mock.restore();
  });
});
