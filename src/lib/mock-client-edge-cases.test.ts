import { Readable } from "node:stream";
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  S3Client,
  GetObjectCommand,
  GetObjectCommandOutput,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { expect, test, beforeEach, afterEach, describe } from "vitest";
import { mockClient } from "./mock-client.js";
import "./vitest-setup.js";

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

describe("Error Handling Edge Cases", () => {
  let s3Mock: ReturnType<typeof mockClient>;
  let s3Client: S3Client;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
    s3Client = new S3Client({});
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test("should propagate synchronous errors from callsFake", async () => {
    s3Mock.on(GetObjectCommand).callsFake(() => {
      throw new Error("Synchronous error");
    });

    await expect(
      s3Client.send(
        new GetObjectCommand({
          Bucket: "test-bucket",
          Key: "test-key",
        }),
      ),
    ).rejects.toThrow("Synchronous error");
  });

  test("should propagate async errors from callsFake", async () => {
    s3Mock.on(GetObjectCommand).callsFake(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw new Error("Async error");
    });

    await expect(
      s3Client.send(
        new GetObjectCommand({
          Bucket: "test-bucket",
          Key: "test-key",
        }),
      ),
    ).rejects.toThrow("Async error");
  });

  test("should handle error with cause chain", async () => {
    const rootCause = new Error("Root cause");
    const error = new Error("Main error");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- Error.cause is not available in all TS targets
    (error as any).cause = rootCause;

    s3Mock.on(GetObjectCommand).rejects(error);

    await expect(
      s3Client.send(
        new GetObjectCommand({
          Bucket: "test-bucket",
          Key: "test-key",
        }),
      ),
    ).rejects.toMatchObject({
      message: "Main error",
      cause: rootCause,
    });
  });

  test("should handle rejection with non-Error object", async () => {
    s3Mock
      .on(GetObjectCommand)
      .callsFake(() => Promise.reject(new Error("string error")));

    await expect(
      s3Client.send(
        new GetObjectCommand({
          Bucket: "test-bucket",
          Key: "test-key",
        }),
      ),
    ).rejects.toThrow("string error");
  });

  test("should handle error in stream creation", async () => {
    s3Mock.on(GetObjectCommand).callsFake(() => {
      const errorStream = new Readable({
        read() {
          this.destroy(new Error("Stream creation error"));
        },
      });
      return Promise.resolve({
        Body: errorStream as unknown as GetObjectCommandOutput["Body"],
      });
    });

    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    const stream = result.Body as Readable;

    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of stream) {
        // Stream will error
      }
    }).rejects.toThrow("Stream creation error");
  });

  test("should handle multiple sequential errors", async () => {
    s3Mock
      .on(GetObjectCommand)
      .rejectsOnce(new Error("First error"))
      .rejectsOnce(new Error("Second error"))
      .resolves({
        Body: "success" as unknown as GetObjectCommandOutput["Body"],
      });

    await expect(
      s3Client.send(
        new GetObjectCommand({
          Bucket: "test-bucket",
          Key: "test-key",
        }),
      ),
    ).rejects.toThrow("First error");

    await expect(
      s3Client.send(
        new GetObjectCommand({
          Bucket: "test-bucket",
          Key: "test-key",
        }),
      ),
    ).rejects.toThrow("Second error");

    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    expect(result.Body).toBe("success");
  });
});

describe("Concurrent Operations", () => {
  let s3Mock: ReturnType<typeof mockClient>;
  let s3Client: S3Client;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
    s3Client = new S3Client({});
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test("should handle concurrent commands with different mocks", async () => {
    s3Mock.on(GetObjectCommand, { Key: "file1.txt" }).resolves({
      Body: "file1" as unknown as GetObjectCommandOutput["Body"],
    });
    s3Mock.on(GetObjectCommand, { Key: "file2.txt" }).resolves({
      Body: "file2" as unknown as GetObjectCommandOutput["Body"],
    });
    s3Mock.on(GetObjectCommand, { Key: "file3.txt" }).resolves({
      Body: "file3" as unknown as GetObjectCommandOutput["Body"],
    });

    const promises = [
      s3Client.send(
        new GetObjectCommand({ Bucket: "test-bucket", Key: "file1.txt" }),
      ),
      s3Client.send(
        new GetObjectCommand({ Bucket: "test-bucket", Key: "file2.txt" }),
      ),
      s3Client.send(
        new GetObjectCommand({ Bucket: "test-bucket", Key: "file3.txt" }),
      ),
    ];

    const results = await Promise.all(promises);

    expect(results[0].Body).toBe("file1");
    expect(results[1].Body).toBe("file2");
    expect(results[2].Body).toBe("file3");
  });

  test("should handle concurrent once handlers", async () => {
    s3Mock
      .on(GetObjectCommand)
      .resolvesOnce({
        Body: "first" as unknown as GetObjectCommandOutput["Body"],
      })
      .resolvesOnce({
        Body: "second" as unknown as GetObjectCommandOutput["Body"],
      })
      .resolvesOnce({
        Body: "third" as unknown as GetObjectCommandOutput["Body"],
      })
      .resolves({
        Body: "default" as unknown as GetObjectCommandOutput["Body"],
      });

    const promises = [
      s3Client.send(
        new GetObjectCommand({ Bucket: "test-bucket", Key: "test-key" }),
      ),
      s3Client.send(
        new GetObjectCommand({ Bucket: "test-bucket", Key: "test-key" }),
      ),
      s3Client.send(
        new GetObjectCommand({ Bucket: "test-bucket", Key: "test-key" }),
      ),
    ];

    const results = await Promise.all(promises);

    // Results should be in order of mock registration
    const bodies: string[] = [];
    for (const result of results) {
      bodies.push(result.Body as unknown as string);
    }
    // eslint-disable-next-line unicorn/no-array-sort -- toSorted() causes type inference issues here
    const sortedBodies = [...bodies].sort();
    expect(sortedBodies).toContain("first");
    expect(sortedBodies).toContain("second");
    expect(sortedBodies).toContain("third");
  });

  test("should track all concurrent calls", async () => {
    s3Mock
      .on(GetObjectCommand)
      .resolves({ Body: "data" as unknown as GetObjectCommandOutput["Body"] });

    const promises = Array.from({ length: 10 }, () =>
      s3Client.send(
        new GetObjectCommand({ Bucket: "test-bucket", Key: "test-key" }),
      ),
    );

    await Promise.all(promises);

    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 10);
  });

  test("should handle mixed success and failure concurrently", async () => {
    s3Mock.on(GetObjectCommand, { Key: "success.txt" }).resolves({
      Body: "success" as unknown as GetObjectCommandOutput["Body"],
    });
    s3Mock
      .on(GetObjectCommand, { Key: "error.txt" })
      .rejects(new Error("Not found"));

    const results = await Promise.allSettled([
      s3Client.send(
        new GetObjectCommand({ Bucket: "test-bucket", Key: "success.txt" }),
      ),
      s3Client.send(
        new GetObjectCommand({ Bucket: "test-bucket", Key: "error.txt" }),
      ),
      s3Client.send(
        new GetObjectCommand({ Bucket: "test-bucket", Key: "success.txt" }),
      ),
    ]);

    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    expect(results[2].status).toBe("fulfilled");
  });
});

describe("Mock Lifecycle and Memory", () => {
  test("should clear call history after reset but keep mocks", async () => {
    const s3Mock = mockClient(S3Client);
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

    s3Mock.restore();
  });

  test("should handle multiple reset calls", () => {
    const s3Mock = mockClient(S3Client);

    s3Mock.on(GetObjectCommand).resolves({
      Body: "test" as unknown as GetObjectCommandOutput["Body"],
    });
    s3Mock.reset();
    s3Mock.reset();
    s3Mock.reset();

    expect(s3Mock).toHaveReceivedCommandTimes(GetObjectCommand, 0);

    s3Mock.restore();
  });

  test("should support overriding mocks after reset", async () => {
    const s3Mock = mockClient(S3Client);
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

    s3Mock.restore();
  });

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

describe("Type Safety and Validation", () => {
  test("should throw when command is not mocked", async () => {
    const s3Mock = mockClient(S3Client);
    const s3Client = new S3Client({});

    await expect(
      s3Client.send(
        new GetObjectCommand({ Bucket: "test-bucket", Key: "test-key" }),
      ),
    ).rejects.toThrow("No mock configured for command: GetObjectCommand");

    s3Mock.restore();
  });

  test("should throw when no matcher matches", async () => {
    const s3Mock = mockClient(S3Client);
    const s3Client = new S3Client({});

    s3Mock
      .on(GetObjectCommand, { Bucket: "other-bucket" })
      .resolves({ Body: "test" as unknown as GetObjectCommandOutput["Body"] });

    await expect(
      s3Client.send(
        new GetObjectCommand({ Bucket: "test-bucket", Key: "test-key" }),
      ),
    ).rejects.toThrow("No matching mock found for GetObjectCommand");

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
      new GetObjectCommand({ Bucket: "test-bucket", Key: "test-key" }),
    );

    const dynamoResult = await dynamoClient.send(
      new GetItemCommand({ TableName: "test-table", Key: { id: { S: "1" } } }),
    );

    expect(s3Result.Body).toBe("s3-data");
    expect(dynamoResult.Item?.id.S).toBe("1");

    s3Mock.restore();
    dynamoMock.restore();
  });

  test("should handle empty input objects", async () => {
    const dynamoMock = mockClient(DynamoDBClient);
    const dynamoClient = new DynamoDBClient({});

    dynamoMock.on(PutItemCommand, {}).resolves({});

    const result = await dynamoClient.send(
      new PutItemCommand({
        TableName: "test-table",
        Item: { id: { S: "1" } },
      }),
    );

    expect(result).toBeDefined();

    dynamoMock.restore();
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
