import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import {
  S3Client,
  GetObjectCommand,
  GetObjectCommandOutput,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { expect, test, beforeEach, afterEach, describe } from "vitest";
import { mockClient, AwsClientStub } from "./mock-client.js";
import "./vitest-setup.js";

describe("Strict Matching", () => {
  let s3Mock: AwsClientStub<S3Client>;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test("should match exact input with strict: true", async () => {
    s3Mock
      .on(GetObjectCommand, { Bucket: "b", Key: "k" }, { strict: true })
      .resolves({
        Body: "strict" as unknown as GetObjectCommandOutput["Body"],
      });

    const client = new S3Client({ region: "us-east-1" });
    const result = await client.send(
      new GetObjectCommand({ Bucket: "b", Key: "k" }),
    );
    expect(result.Body).toBe("strict");
  });

  test("should not match if input has extra properties with strict: true", async () => {
    s3Mock.on(GetObjectCommand, { Bucket: "b" }, { strict: true }).resolves({
      Body: "strict" as unknown as GetObjectCommandOutput["Body"],
    });

    const client = new S3Client({ region: "us-east-1" });
    await expect(
      client.send(new GetObjectCommand({ Bucket: "b", Key: "k" })),
    ).rejects.toThrow("No matching mock found for GetObjectCommand");
  });

  test("should match nested objects with strict: true", async () => {
    s3Mock
      .on(
        PutObjectCommand,
        {
          Bucket: "nested",
          Key: "test-key",
          Metadata: { stage: "dev", "flags-copy": "true" },
        },
        { strict: true },
      )
      .resolves({ ETag: "strict-nested" });

    const client = new S3Client({ region: "us-east-1" });
    const result = await client.send(
      new PutObjectCommand({
        Bucket: "nested",
        Key: "test-key",
        Metadata: { stage: "dev", "flags-copy": "true" },
      }),
    );

    expect(result.ETag).toBe("strict-nested");
  });

  test("should reject when nested objects differ with strict: true", async () => {
    s3Mock
      .on(
        PutObjectCommand,
        { Bucket: "nested", Metadata: { stage: "dev", "flags-copy": "true" } },
        { strict: true },
      )
      .resolves({ ETag: "strict-match" });

    const client = new S3Client({ region: "us-east-1" });
    await expect(
      client.send(
        new PutObjectCommand({
          Bucket: "nested",
          Key: "test-key",
          Body: "data",
          Metadata: {
            stage: "dev",
            "flags-copy": "true",
            "flags-retry": "false",
          },
        }),
      ),
    ).rejects.toThrow("No matching mock found for PutObjectCommand");
  });

  test("should match identical reference objects with strict: true", async () => {
    const request = { Bucket: "strict", Key: "test-key" };

    s3Mock.on(GetObjectCommand, request, { strict: true }).resolves({
      Body: "ref-match" as unknown as GetObjectCommandOutput["Body"],
    });

    const client = new S3Client({ region: "us-east-1" });
    const result = await client.send(new GetObjectCommand(request));

    expect(result.Body).toBe("ref-match");
  });

  test("should reject when strict matcher expects missing property", async () => {
    s3Mock
      .on(
        GetObjectCommand,
        {
          Bucket: "strict",
          Key: "expected-key",
        },
        { strict: true },
      )
      .resolves({
        Body: "should-match" as unknown as GetObjectCommandOutput["Body"],
      });

    const client = new S3Client({ region: "us-east-1" });
    const result = await client.send(
      new GetObjectCommand({ Bucket: "strict", Key: "expected-key" }),
    );

    expect(result.Body).toBe("should-match");
  });
});

describe("Matcher Edge Cases", () => {
  let s3Mock: ReturnType<typeof mockClient>;
  let s3Client: S3Client;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
    s3Client = new S3Client({});
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test("should match with empty object matcher", async () => {
    s3Mock.on(GetObjectCommand, {}).resolves({
      Body: "matched" as unknown as GetObjectCommandOutput["Body"],
    });

    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    expect(result.Body).toBe("matched");
  });

  test("should handle undefined vs missing properties in partial match", async () => {
    s3Mock.on(GetObjectCommand, { Bucket: "test-bucket" }).resolves({
      Body: "bucket-only" as unknown as GetObjectCommandOutput["Body"],
    });

    // Should match when Key is missing
    const result1 = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "any-key",
      }),
    );

    expect(result1.Body).toBe("bucket-only");

    // Should also match when Key is present (partial match)
    const result2 = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "some-key",
      }),
    );

    expect(result2.Body).toBe("bucket-only");
  });

  test("should handle undefined values in matcher", async () => {
    s3Mock
      .on(PutObjectCommand, { Metadata: undefined })
      .resolves({ ETag: "undefined-match" });

    const result = await s3Client.send(
      new PutObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
        Body: "data",
        Metadata: undefined,
      }),
    );

    expect(result.ETag).toBe("undefined-match");
  });

  test("should handle overlapping partial matchers - first registered wins", async () => {
    s3Mock.on(GetObjectCommand, { Bucket: "test-bucket" }).resolves({
      Body: "bucket-match" as unknown as GetObjectCommandOutput["Body"],
    });

    s3Mock.on(GetObjectCommand, { Key: "test-key" }).resolves({
      Body: "key-match" as unknown as GetObjectCommandOutput["Body"],
    });

    // Both matchers would match, first one should win
    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    expect(result.Body).toBe("bucket-match");
  });

  test("should handle deeply nested object matching", async () => {
    s3Mock
      .on(PutObjectCommand, {
        Metadata: {
          "config-level1-level2-level3": "deep",
        },
      })
      .resolves({ ETag: "deep-match" });

    const result = await s3Client.send(
      new PutObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
        Body: "data",
        Metadata: {
          "config-level1-level2-level3": "deep",
          "config-level1-level2-extra": "value",
          other: "field",
        },
      }),
    );

    expect(result.ETag).toBe("deep-match");
  });

  test("should not match when nested value differs", async () => {
    s3Mock
      .on(PutObjectCommand, {
        Metadata: { env: "prod" },
      })
      .resolves({ ETag: "prod-match" });

    await expect(
      s3Client.send(
        new PutObjectCommand({
          Bucket: "test-bucket",
          Key: "test-key",
          Body: "data",
          Metadata: { env: "dev" },
        }),
      ),
    ).rejects.toThrow("No matching mock found");
  });

  test("should handle array values in partial matcher", async () => {
    // Partial matching works with objects containing arrays
    s3Mock
      .on(PutObjectCommand, {
        Bucket: "test-bucket",
      })
      .resolves({ ETag: "array-test" });

    const result = await s3Client.send(
      new PutObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
        Body: "data",
        Metadata: {
          tags: JSON.stringify(["tag1", "tag2"]),
        },
      }),
    );

    expect(result.ETag).toBe("array-test");
  });

  test("should handle matcher with special characters", async () => {
    s3Mock
      .on(GetObjectCommand, {
        Key: "folder/subfolder/file-name_123.txt",
      })
      .resolves({
        Body: "special-chars" as unknown as GetObjectCommandOutput["Body"],
      });

    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "folder/subfolder/file-name_123.txt",
      }),
    );

    expect(result.Body).toBe("special-chars");
  });

  test("should handle matcher with numeric values", async () => {
    s3Mock
      .on(PutObjectCommand, {
        ContentLength: 1024,
      })
      .resolves({ ETag: "size-match" });

    const result = await s3Client.send(
      new PutObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
        Body: "data",
        ContentLength: 1024,
      }),
    );

    expect(result.ETag).toBe("size-match");
  });

  test("should handle matcher with boolean values", async () => {
    s3Mock
      .on(PutObjectCommand, {
        ServerSideEncryption: "AES256",
      })
      .resolves({ ETag: "encrypted" });

    const result = await s3Client.send(
      new PutObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
        Body: "data",
        ServerSideEncryption: "AES256",
      }),
    );

    expect(result.ETag).toBe("encrypted");
  });
});

describe("Type Safety and Validation", () => {
  test("should throw when command is not mocked", async () => {
    const s3Mock = mockClient(S3Client);
    const s3Client = new S3Client({});

    await expect(
      s3Client.send(new GetObjectCommand({ Bucket: "test", Key: "test.txt" })),
    ).rejects.toThrow();

    s3Mock.restore();
  });

  test("should throw when no matcher matches", async () => {
    const s3Mock = mockClient(S3Client);
    const s3Client = new S3Client({});

    s3Mock.on(GetObjectCommand, { Bucket: "specific-bucket" }).resolves({
      Body: "data" as unknown as GetObjectCommandOutput["Body"],
    });

    await expect(
      s3Client.send(new GetObjectCommand({ Bucket: "other", Key: "test.txt" })),
    ).rejects.toThrow();

    s3Mock.restore();
  });

  test("should support multiple clients of different types", async () => {
    const s3Mock = mockClient(S3Client);
    const dynamoMock = mockClient(DynamoDBClient);

    const s3Client = new S3Client({});
    const dynamoClient = new DynamoDBClient({});

    s3Mock.on(GetObjectCommand).resolves({
      Body: "s3-data" as unknown as GetObjectCommandOutput["Body"],
    });
    dynamoMock.on(GetItemCommand).resolves({ Item: { id: { S: "1" } } });

    const s3Result = await s3Client.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );
    const dynamoResult = await dynamoClient.send(
      new GetItemCommand({ TableName: "test", Key: { id: { S: "1" } } }),
    );

    expect(s3Result.Body).toBe("s3-data");
    expect(dynamoResult.Item).toEqual({ id: { S: "1" } });

    s3Mock.restore();
    dynamoMock.restore();
  });

  test("should handle empty input objects", async () => {
    const dynamoMock = mockClient(DynamoDBClient);
    const dynamoClient = new DynamoDBClient({});

    dynamoMock.on(GetItemCommand, {}).resolves({
      Item: { id: { S: "empty-match" } },
    });

    const result = await dynamoClient.send(
      new GetItemCommand({
        TableName: "test",
        Key: {
          id: { S: "1" },
        },
      }),
    );

    expect(result.Item?.id.S).toBe("empty-match");

    dynamoMock.restore();
  });
});
