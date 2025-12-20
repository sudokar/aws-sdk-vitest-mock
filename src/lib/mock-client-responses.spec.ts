import { Readable } from "node:stream";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import {
  S3Client,
  GetObjectCommand,
  GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { marshall } from "@aws-sdk/util-dynamodb";
import { expect, test, beforeEach, afterEach, describe } from "vitest";
import { mockClient, AwsClientStub } from "./mock-client.js";
import "./vitest-setup.js";

describe("resolvesOnce / rejectsOnce", () => {
  let s3Mock: AwsClientStub<S3Client>;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test("should consume resolvesOnce in order before falling back to resolves", async () => {
    s3Mock
      .on(GetObjectCommand)
      .resolvesOnce({
        Body: "first" as unknown as GetObjectCommandOutput["Body"],
      })
      .resolvesOnce({
        Body: "second" as unknown as GetObjectCommandOutput["Body"],
      })
      .resolves({
        Body: "default" as unknown as GetObjectCommandOutput["Body"],
      });

    const client = new S3Client({});
    const result1 = await client.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );
    const result2 = await client.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );
    const result3 = await client.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );
    const result4 = await client.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );

    expect(result1.Body).toBe("first");
    expect(result2.Body).toBe("second");
    expect(result3.Body).toBe("default");
    expect(result4.Body).toBe("default");
  });

  test("should consume rejectsOnce then fall back to resolves", async () => {
    s3Mock
      .on(GetObjectCommand)
      .rejectsOnce(new Error("Temporary failure"))
      .resolves({
        Body: "success" as unknown as GetObjectCommandOutput["Body"],
      });

    const client = new S3Client({});

    await expect(
      client.send(new GetObjectCommand({ Bucket: "test", Key: "test.txt" })),
    ).rejects.toThrow("Temporary failure");
    const result = await client.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );
    expect(result.Body).toBe("success");
  });

  test("should support rejectsOnce with string error", async () => {
    s3Mock
      .on(GetObjectCommand)
      .rejectsOnce("Temporary string failure")
      .resolves({
        Body: "string-recovery" as unknown as GetObjectCommandOutput["Body"],
      });

    const client = new S3Client({});

    await expect(
      client.send(new GetObjectCommand({ Bucket: "test", Key: "test.txt" })),
    ).rejects.toThrow("Temporary string failure");
    const result = await client.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );
    expect(result.Body).toBe("string-recovery");
  });

  test("should support chainable API", () => {
    const stub = s3Mock.on(GetObjectCommand);

    // Chain multiple calls
    const returned = stub
      .resolvesOnce({ Body: "a" as unknown as GetObjectCommandOutput["Body"] })
      .resolvesOnce({ Body: "b" as unknown as GetObjectCommandOutput["Body"] })
      .rejectsOnce(new Error("temp error"))
      .resolves({ Body: "final" as unknown as GetObjectCommandOutput["Body"] });

    // Should return the same stub for chaining
    expect(returned).toBe(stub);
  });

  test("should prioritize once handlers added after permanent handler", async () => {
    const stub = s3Mock.on(GetObjectCommand);

    stub
      .resolves({
        Body: "permanent" as unknown as GetObjectCommandOutput["Body"],
      })
      .resolvesOnce({
        Body: "once-1" as unknown as GetObjectCommandOutput["Body"],
      })
      .resolvesOnce({
        Body: "once-2" as unknown as GetObjectCommandOutput["Body"],
      });

    const client = new S3Client({});
    const first = await client.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );
    const second = await client.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );
    const third = await client.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );

    expect(first.Body).toBe("once-1");
    expect(second.Body).toBe("once-2");
    expect(third.Body).toBe("permanent");
  });

  test("should support callsFakeOnce", async () => {
    let callCount = 0;

    s3Mock
      .on(GetObjectCommand)
      .callsFakeOnce(() => {
        callCount++;
        return Promise.resolve({
          Body: `call-${callCount}` as unknown as GetObjectCommandOutput["Body"],
          $metadata: {},
        } as GetObjectCommandOutput);
      })
      .callsFake(() => {
        return Promise.resolve({
          Body: "permanent" as unknown as GetObjectCommandOutput["Body"],
          $metadata: {},
        } as GetObjectCommandOutput);
      });

    const client = new S3Client({});
    const result1 = await client.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );
    const result2 = await client.send(
      new GetObjectCommand({ Bucket: "test", Key: "test.txt" }),
    );

    expect(result1.Body).toBe("call-1");
    expect(result2.Body).toBe("permanent");
    expect(callCount).toBe(1);
  });
});
describe("Stream Mocking", () => {
  let s3Mock: ReturnType<typeof mockClient>;
  let s3Client: S3Client;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
    s3Client = new S3Client({});
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test("should mock S3 GetObject with string stream", async () => {
    const testData = "Hello, World!";
    s3Mock.on(GetObjectCommand).resolvesStream(testData);

    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    expect(result.Body).toBeDefined();
  });

  test("should mock S3 GetObject with Buffer stream", async () => {
    const testData = Buffer.from("Binary data");
    s3Mock.on(GetObjectCommand).resolvesStream(testData);

    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    expect(result.Body).toBeDefined();
  });

  test("should mock S3 GetObject with stream once", async () => {
    s3Mock
      .on(GetObjectCommand)
      .resolvesStreamOnce("First call")
      .resolvesStream("Subsequent calls");

    const result1 = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    const result2 = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    expect(result1.Body).toBeDefined();
    expect(result2.Body).toBeDefined();
  });

  test("should create fresh streams for multiple calls with resolvesStream", async () => {
    const testData = "test content";
    s3Mock.on(GetObjectCommand).resolvesStream(testData);

    // Helper to consume stream
    const consumeStream = async (stream: Readable): Promise<string> => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Uint8Array);
      }
      return Buffer.concat(chunks).toString("utf8");
    };

    // First call - consume stream
    const result1 = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );
    const content1 = await consumeStream(result1.Body as Readable);
    expect(content1).toBe(testData);

    // Second call - should get a fresh stream, not exhausted one
    const result2 = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );
    const content2 = await consumeStream(result2.Body as Readable);
    expect(content2).toBe(testData);

    // Third call - verify it still works
    const result3 = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );
    const content3 = await consumeStream(result3.Body as Readable);
    expect(content3).toBe(testData);
  });

  test("should handle sequential resolvesStreamOnce and resolvesStream calls", async () => {
    const testData1 = "First call content";
    const testData2 = "Second call content";
    const testData3 = "Subsequent calls content";

    s3Mock
      .on(GetObjectCommand)
      .resolvesStreamOnce(testData1)
      .resolvesStreamOnce(testData2)
      .resolvesStream(testData3);

    // Helper to consume stream
    const consumeStream = async (stream: Readable): Promise<string> => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Uint8Array);
      }
      return Buffer.concat(chunks).toString("utf8");
    };

    // First call
    const result1 = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );
    const content1 = await consumeStream(result1.Body as Readable);
    expect(content1).toBe(testData1);

    // Second call
    const result2 = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );
    const content2 = await consumeStream(result2.Body as Readable);
    expect(content2).toBe(testData2);

    // Third call - uses permanent resolvesStream
    const result3 = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );
    const content3 = await consumeStream(result3.Body as Readable);
    expect(content3).toBe(testData3);

    // Fourth call - should still use permanent resolvesStream
    const result4 = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );
    const content4 = await consumeStream(result4.Body as Readable);
    expect(content4).toBe(testData3);
  });

  test("should handle Buffer streams for multiple calls", async () => {
    const testData = Buffer.from("Binary content");
    s3Mock.on(GetObjectCommand).resolvesStream(testData);

    // Helper to consume stream
    const consumeStream = async (stream: Readable): Promise<Buffer> => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Uint8Array);
      }
      return Buffer.concat(chunks);
    };

    // Multiple calls should all work
    for (let callIndex = 0; callIndex < 3; callIndex++) {
      const result = await s3Client.send(
        new GetObjectCommand({
          Bucket: "test-bucket",
          Key: "test-key",
        }),
      );
      const content = await consumeStream(result.Body as Readable);
      expect(content.equals(testData)).toBe(true);
    }
  });

  test("should handle Uint8Array stream input", async () => {
    const testData = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    s3Mock.on(GetObjectCommand).resolvesStream(testData);

    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    const consumeStream = async (stream: Readable): Promise<Buffer> => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Uint8Array);
      }
      return Buffer.concat(chunks);
    };

    const content = await consumeStream(result.Body as Readable);
    expect(content.toString()).toBe("Hello");
  });

  test("should handle large stream data", async () => {
    const largeData = "x".repeat(10_000);
    s3Mock.on(GetObjectCommand).resolvesStream(largeData);

    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    const consumeStream = async (stream: Readable): Promise<string> => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Uint8Array);
      }
      return Buffer.concat(chunks).toString("utf8");
    };

    const content = await consumeStream(result.Body as Readable);
    expect(content).toBe(largeData);
    expect(content.length).toBe(10_000);
  });

  test("should handle concurrent stream consumption", async () => {
    const testData = "concurrent test";
    s3Mock.on(GetObjectCommand).resolvesStream(testData);

    const consumeStream = async (stream: Readable): Promise<string> => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Uint8Array);
      }
      return Buffer.concat(chunks).toString("utf8");
    };

    const promises = Array.from({ length: 5 }, () =>
      s3Client
        .send(
          new GetObjectCommand({
            Bucket: "test-bucket",
            Key: "test-key",
          }),
        )
        .then((result) => consumeStream(result.Body as Readable)),
    );

    const results = await Promise.all(promises);
    for (const result of results) {
      expect(result).toBe(testData);
    }
  });

  test("should handle empty stream data", async () => {
    const emptyData = "";
    s3Mock.on(GetObjectCommand).resolvesStream(emptyData);

    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    const consumeStream = async (stream: Readable): Promise<string> => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Uint8Array);
      }
      return Buffer.concat(chunks).toString("utf8");
    };

    const content = await consumeStream(result.Body as Readable);
    expect(content).toBe("");
  });
});
describe("Delay Simulation", () => {
  let s3Mock: ReturnType<typeof mockClient>;
  let s3Client: S3Client;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
    s3Client = new S3Client({});
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test("should resolve with delay", async () => {
    const startTime = Date.now();
    s3Mock
      .on(GetObjectCommand)
      .resolvesWithDelay(
        { Body: "delayed data" as unknown as GetObjectCommandOutput["Body"] },
        100,
      );

    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    const endTime = Date.now();
    expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    expect(result.Body).toBe("delayed data");
  });

  test("should reject with delay", async () => {
    const startTime = Date.now();
    s3Mock.on(GetObjectCommand).rejectsWithDelay("Delayed error", 50);

    await expect(
      s3Client.send(
        new GetObjectCommand({
          Bucket: "test-bucket",
          Key: "test-key",
        }),
      ),
    ).rejects.toThrow("Delayed error");

    const endTime = Date.now();
    expect(endTime - startTime).toBeGreaterThanOrEqual(50);
  });

  test("should handle zero delay", async () => {
    const startTime = Date.now();
    s3Mock
      .on(GetObjectCommand)
      .resolvesWithDelay(
        { Body: "instant" as unknown as GetObjectCommandOutput["Body"] },
        0,
      );

    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    const endTime = Date.now();
    expect(result.Body).toBe("instant");
    expect(endTime - startTime).toBeLessThan(50);
  });

  test("should handle reject with zero delay", async () => {
    s3Mock.on(GetObjectCommand).rejectsWithDelay(new Error("Instant error"), 0);

    await expect(
      s3Client.send(
        new GetObjectCommand({
          Bucket: "test-bucket",
          Key: "test-key",
        }),
      ),
    ).rejects.toThrow("Instant error");
  });
});
describe("AWS Error Simulation", () => {
  let s3Mock: ReturnType<typeof mockClient>;
  let dynamoMock: ReturnType<typeof mockClient>;
  let s3Client: S3Client;
  let dynamoClient: DynamoDBClient;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
    dynamoMock = mockClient(DynamoDBClient);
    s3Client = new S3Client({});
    dynamoClient = new DynamoDBClient({});
  });

  afterEach(() => {
    s3Mock.restore();
    dynamoMock.restore();
  });

  test("should reject with NoSuchKey error", async () => {
    s3Mock.on(GetObjectCommand).rejectsWithNoSuchKey("missing-key");

    await expect(
      s3Client.send(
        new GetObjectCommand({
          Bucket: "test-bucket",
          Key: "missing-key",
        }),
      ),
    ).rejects.toMatchObject({
      code: "NoSuchKey",
      statusCode: 404,
      message: expect.stringContaining("missing-key") as string,
    });
  });

  test("should reject with NoSuchBucket error", async () => {
    s3Mock.on(GetObjectCommand).rejectsWithNoSuchBucket("missing-bucket");

    await expect(
      s3Client.send(
        new GetObjectCommand({
          Bucket: "missing-bucket",
          Key: "test-key",
        }),
      ),
    ).rejects.toMatchObject({
      code: "NoSuchBucket",
      statusCode: 404,
      message: expect.stringContaining("missing-bucket") as string,
    });
  });

  test("should reject with AccessDenied error", async () => {
    s3Mock.on(GetObjectCommand).rejectsWithAccessDenied("protected-resource");

    await expect(
      s3Client.send(
        new GetObjectCommand({
          Bucket: "test-bucket",
          Key: "protected-key",
        }),
      ),
    ).rejects.toMatchObject({
      code: "AccessDenied",
      statusCode: 403,
      message: expect.stringContaining("protected-resource") as string,
    });
  });

  test("should reject with DynamoDB ResourceNotFound error", async () => {
    dynamoMock.on(GetItemCommand).rejectsWithResourceNotFound("missing-table");

    await expect(
      dynamoClient.send(
        new GetItemCommand({
          TableName: "missing-table",
          Key: marshall({ id: "123" }),
        }),
      ),
    ).rejects.toMatchObject({
      code: "ResourceNotFoundException",
      statusCode: 400,
      message: expect.stringContaining("missing-table") as string,
    });
  });

  test("should reject with ConditionalCheckFailed error", async () => {
    dynamoMock.on(GetItemCommand).rejectsWithConditionalCheckFailed();

    await expect(
      dynamoClient.send(
        new GetItemCommand({
          TableName: "test-table",
          Key: marshall({ id: "123" }),
        }),
      ),
    ).rejects.toMatchObject({
      code: "ConditionalCheckFailedException",
      statusCode: 400,
    });
  });

  test("should reject with Throttling error", async () => {
    s3Mock.on(GetObjectCommand).rejectsWithThrottling();

    await expect(
      s3Client.send(
        new GetObjectCommand({
          Bucket: "test-bucket",
          Key: "test-key",
        }),
      ),
    ).rejects.toMatchObject({
      code: "Throttling",
      statusCode: 400,
      retryable: true,
    });
  });

  test("should reject with InternalServerError", async () => {
    s3Mock.on(GetObjectCommand).rejectsWithInternalServerError();

    await expect(
      s3Client.send(
        new GetObjectCommand({
          Bucket: "test-bucket",
          Key: "test-key",
        }),
      ),
    ).rejects.toMatchObject({
      code: "InternalServerError",
      statusCode: 500,
      retryable: true,
    });
  });

  test("should support custom error objects", async () => {
    const customError = new Error("Custom error") as Error & {
      customProperty: string;
    };
    customError.name = "CustomErrorType";
    customError.customProperty = "custom value";

    s3Mock.on(GetObjectCommand).rejects(customError);

    await expect(
      s3Client.send(
        new GetObjectCommand({
          Bucket: "test-bucket",
          Key: "test-key",
        }),
      ),
    ).rejects.toMatchObject({
      message: "Custom error",
      name: "CustomErrorType",
      customProperty: "custom value",
    });
  });
});
describe("Fixture Loading", () => {
  let s3Mock: ReturnType<typeof mockClient>;
  let s3Client: S3Client;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
    s3Client = new S3Client({});
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test("should load response from JSON file", async () => {
    const { writeFileSync, mkdirSync, rmSync } = await import("node:fs");
    // eslint-disable-next-line unicorn/import-style
    const pathModule = await import("node:path");
    const path = pathModule.default;

    const testDirectory = path.join(process.cwd(), "test-fixture-temp");
    const jsonFile = path.join(testDirectory, "response.json");

    mkdirSync(testDirectory, { recursive: true });
    writeFileSync(
      jsonFile,
      JSON.stringify({ Body: "file content", ContentType: "application/json" }),
    );

    s3Mock.on(GetObjectCommand).resolvesFromFile(jsonFile);

    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    expect(result.Body).toBe("file content");
    expect(result.ContentType).toBe("application/json");

    rmSync(testDirectory, { recursive: true, force: true });
  });

  test("should load response from text file", async () => {
    const { writeFileSync, mkdirSync, rmSync } = await import("node:fs");
    // eslint-disable-next-line unicorn/import-style
    const pathModule = await import("node:path");
    const path = pathModule.default;

    const testDirectory = path.join(process.cwd(), "test-fixture-temp");
    const textFile = path.join(testDirectory, "response.txt");

    mkdirSync(testDirectory, { recursive: true });
    writeFileSync(textFile, "plain text response");

    s3Mock.on(GetObjectCommand).resolvesFromFile(textFile);

    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    expect(result).toBe("plain text response");

    rmSync(testDirectory, { recursive: true, force: true });
  });
});
