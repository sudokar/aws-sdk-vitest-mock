import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { expect, test, beforeEach, afterEach, describe } from "vitest";
import {
  mockClient,
  mockClientInstance,
  AwsClientStub,
} from "./mock-client.js";
import "./vitest-setup.js";

describe("mockClient - Basic Functionality", () => {
  let s3Mock: AwsClientStub<S3Client>;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test("should mock S3Client send method", async () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: "test data" as unknown as GetObjectCommandOutput["Body"],
    });

    const client = new S3Client({});
    const result = await client.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );

    expect(result.Body).toBe("test data");
  });

  test("should support request matching", async () => {
    s3Mock
      .on(GetObjectCommand, { Bucket: "bucket1" })
      .resolves({ Body: "data1" as unknown as GetObjectCommandOutput["Body"] });
    s3Mock
      .on(GetObjectCommand, { Bucket: "bucket2" })
      .resolves({ Body: "data2" as unknown as GetObjectCommandOutput["Body"] });

    const client = new S3Client({});
    const result1 = await client.send(
      new GetObjectCommand({ Bucket: "bucket1", Key: "test.txt" }),
    );
    const result2 = await client.send(
      new GetObjectCommand({ Bucket: "bucket2", Key: "test.txt" }),
    );

    expect(result1.Body).toBe("data1");
    expect(result2.Body).toBe("data2");
  });

  test("should support partial request matching", async () => {
    s3Mock
      .on(PutObjectCommand, { Bucket: "my-bucket", Key: "file.txt" })
      .resolves({ ETag: "abc123" });

    const client = new S3Client({});
    const result = await client.send(
      new PutObjectCommand({
        Bucket: "my-bucket",
        Key: "file.txt",
        Body: "some content",
        ContentType: "text/plain",
      }),
    );

    expect(result.ETag).toBe("abc123");
  });

  test("should support nested metadata request matching", async () => {
    s3Mock
      .on(PutObjectCommand, {
        Bucket: "nested-bucket",
        Metadata: { env: "dev" },
      })
      .resolves({ ETag: "nested" });
    s3Mock.on(PutObjectCommand).resolves({ ETag: "fallback" });

    const client = new S3Client({});
    const matched = await client.send(
      new PutObjectCommand({
        Bucket: "nested-bucket",
        Key: "file.txt",
        Body: "content",
        Metadata: { env: "dev", version: "1" },
      }),
    );

    const fallback = await client.send(
      new PutObjectCommand({
        Bucket: "nested-bucket",
        Key: "file.txt",
        Body: "content",
      }),
    );

    expect(matched.ETag).toBe("nested");
    expect(fallback.ETag).toBe("fallback");
  });

  test("should reject with string error", async () => {
    s3Mock.on(GetObjectCommand).rejects("String failure");

    const client = new S3Client({});
    await expect(
      client.send(new GetObjectCommand({ Bucket: "test", Key: "string.txt" })),
    ).rejects.toThrow("String failure");
  });

  test("should reject with error", async () => {
    s3Mock.on(GetObjectCommand).rejects(new Error("Not found"));

    const client = new S3Client({});
    await expect(
      client.send(new GetObjectCommand({ Bucket: "test", Key: "missing.txt" })),
    ).rejects.toThrow("Not found");
  });
});

describe("mockClientInstance", () => {
  test("should mock an existing client instance", async () => {
    const clientInstance = new S3Client({});
    const mock = mockClientInstance(clientInstance);

    mock.on(GetObjectCommand).resolves({
      Body: "instance data" as unknown as GetObjectCommandOutput["Body"],
    });

    const result = await clientInstance.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );

    expect(result.Body).toBe("instance data");
    mock.restore();
  });

  test("should support resolvesOnce on client instance", async () => {
    const clientInstance = new S3Client({});
    const mock = mockClientInstance(clientInstance);

    mock
      .on(GetObjectCommand)
      .resolvesOnce({
        Body: "first" as unknown as GetObjectCommandOutput["Body"],
      })
      .resolves({
        Body: "default" as unknown as GetObjectCommandOutput["Body"],
      });

    const result1 = await clientInstance.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );
    const result2 = await clientInstance.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );

    expect(result1.Body).toBe("first");
    expect(result2.Body).toBe("default");
    mock.restore();
  });

  test("should track calls for instance", async () => {
    const clientInstance = new S3Client({});
    const mock = mockClientInstance(clientInstance);

    mock.on(GetObjectCommand).resolves({
      Body: "data" as unknown as GetObjectCommandOutput["Body"],
    });

    await clientInstance.send(
      new GetObjectCommand({ Bucket: "test", Key: "test1.txt" }),
    );
    await clientInstance.send(
      new GetObjectCommand({ Bucket: "test", Key: "test2.txt" }),
    );

    const calls = mock.calls();
    expect(calls).toHaveLength(2);
    mock.restore();
  });

  test("reset should clear instance calls but keep mocks", async () => {
    const clientInstance = new S3Client({});
    const mock = mockClientInstance(clientInstance);

    mock.on(GetObjectCommand).resolves({
      Body: "data" as unknown as GetObjectCommandOutput["Body"],
    });

    await clientInstance.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );
    expect(mock.calls()).toHaveLength(1);

    mock.reset();

    expect(mock.calls()).toHaveLength(0);

    // Mock should still work after reset
    const result = await clientInstance.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );
    expect(result.Body).toBe("data");
    expect(mock.calls()).toHaveLength(1);
    mock.restore();
  });
});

describe("Multiple Clients", () => {
  test("should support mocking multiple clients independently", async () => {
    const s3Mock = mockClient(S3Client);
    const ddbMock = mockClient(DynamoDBClient);

    s3Mock.on(GetObjectCommand).resolves({
      Body: "s3-data" as unknown as GetObjectCommandOutput["Body"],
    });
    ddbMock.on(GetItemCommand).resolves({
      Item: { id: { S: "123" } },
    });

    const s3 = new S3Client({});
    const ddb = new DynamoDBClient({});

    const s3Response = await s3.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );
    const ddbResponse = await ddb.send(
      new GetItemCommand({ TableName: "test", Key: { id: { S: "1" } } }),
    );

    expect(s3Response.Body).toBe("s3-data");
    expect(ddbResponse.Item).toEqual({ id: { S: "123" } });

    expect(s3Mock.calls()).toHaveLength(1);
    expect(ddbMock.calls()).toHaveLength(1);

    s3Mock.restore();
    ddbMock.restore();
  });

  test("should throw error if command is not mocked (and crash if bug exists)", async () => {
    const s3Mock = mockClient(S3Client);
    const client = new S3Client({});

    await expect(
      client.send(new GetObjectCommand({ Bucket: "test", Key: "missing.txt" })),
    ).rejects.toThrow();

    s3Mock.restore();
  });
});
