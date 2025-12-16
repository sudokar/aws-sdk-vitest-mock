import { Readable } from "node:stream";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  GetObjectCommandInput,
  GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { expect, test, beforeEach, afterEach, describe, vi } from "vitest";
import {
  mockClient,
  mockClientInstance,
  AwsClientStub,
} from "./mock-client.js";
import "./vitest-setup.js";

describe("mockClient", () => {
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

  test("reset should clear mocks and calls", async () => {
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
    await expect(
      client.send(new GetObjectCommand({ Bucket: "test", Key: "reset.txt" })),
    ).rejects.toThrow("No mock configured for command: GetObjectCommand");
  });

  test("should reject with error", async () => {
    s3Mock.on(GetObjectCommand).rejects(new Error("Not found"));

    const client = new S3Client({});
    await expect(
      client.send(new GetObjectCommand({ Bucket: "test", Key: "missing.txt" })),
    ).rejects.toThrow("Not found");
  });
});

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

    mock
      .on(GetObjectCommand)
      .resolves({ Body: "data" as unknown as GetObjectCommandOutput["Body"] });

    await clientInstance.send(
      new GetObjectCommand({ Bucket: "bucket1", Key: "key1.txt" }),
    );
    await clientInstance.send(
      new GetObjectCommand({ Bucket: "bucket2", Key: "key2.txt" }),
    );

    const calls = mock.calls();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBeInstanceOf(GetObjectCommand);

    mock.restore();
  });

  test("reset should clear instance mocks", async () => {
    const clientInstance = new S3Client({});
    const mock = mockClientInstance(clientInstance);

    mock.on(GetObjectCommand).resolves({
      Body: "before-reset" as unknown as GetObjectCommandOutput["Body"],
    });

    await clientInstance.send(
      new GetObjectCommand({ Bucket: "test", Key: "reset.txt" }),
    );
    expect(mock.calls()).toHaveLength(1);

    mock.reset();

    expect(mock.calls()).toHaveLength(0);
    await expect(
      clientInstance.send(
        new GetObjectCommand({ Bucket: "test", Key: "reset.txt" }),
      ),
    ).rejects.toThrow("No mock configured for command: GetObjectCommand");

    mock.restore();
  });
});

describe("strict matching", () => {
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
    ).rejects.toThrow("No mock configured for command: GetObjectCommand");
  });

  test("should match nested objects with strict: true", async () => {
    s3Mock
      .on(
        PutObjectCommand,
        { Bucket: "nested", Metadata: { stage: "dev", flags: { copy: true } } },
        { strict: true },
      )
      .resolves({ ETag: "strict-nested" });

    const client = new S3Client({ region: "us-east-1" });
    const result = await client.send(
      new PutObjectCommand({
        Bucket: "nested",
        Metadata: { stage: "dev", flags: { copy: true } },
      }),
    );

    expect(result.ETag).toBe("strict-nested");
  });

  test("should reject when nested objects differ with strict: true", async () => {
    s3Mock
      .on(
        PutObjectCommand,
        { Bucket: "nested", Metadata: { stage: "dev", flags: { copy: true } } },
        { strict: true },
      )
      .resolves({ ETag: "strict-nested" });

    const client = new S3Client({ region: "us-east-1" });
    await expect(
      client.send(
        new PutObjectCommand({
          Bucket: "nested",
          Metadata: {
            stage: "dev",
            flags: { copy: true, retry: false },
          },
        }),
      ),
    ).rejects.toThrow("No mock configured for command: PutObjectCommand");
  });

  test("should match identical reference objects with strict: true", async () => {
    const request = { Bucket: "ref-bucket" };

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
        { Bucket: "strict", Expected: "present" },
        { strict: true },
      )
      .resolves({
        Body: "should-not-match" as unknown as GetObjectCommandOutput["Body"],
      });

    const client = new S3Client({ region: "us-east-1" });
    await expect(
      client.send(new GetObjectCommand({ Bucket: "strict" })),
    ).rejects.toThrow("No mock configured for command: GetObjectCommand");
  });
});

describe("client access in handler", () => {
  let s3Mock: AwsClientStub<S3Client>;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
  });

  afterEach(() => {
    s3Mock.restore();
  });

  test("callsFake should receive getClient", async () => {
    let capturedClient: S3Client | undefined;
    s3Mock.on(GetObjectCommand).callsFake((input, getClient) => {
      capturedClient = getClient;
      return Promise.resolve({
        Body: "ok" as unknown as GetObjectCommandOutput["Body"],
        $metadata: {},
      } as GetObjectCommandOutput);
    });

    const client = new S3Client({ region: "us-east-1" });
    await client.send(new GetObjectCommand({ Bucket: "b", Key: "k" }));

    expect(capturedClient).toBe(client);
  });

  test("callsFake on instance mock should receive client instance", async () => {
    const clientInstance = new S3Client({});
    const mock = mockClientInstance(clientInstance);

    let capturedClient: unknown;
    mock.on(GetObjectCommand).callsFake((input, getClient) => {
      capturedClient = getClient;
      return Promise.resolve({
        Body: "ok" as unknown as GetObjectCommandOutput["Body"],
        $metadata: {},
      } as GetObjectCommandOutput);
    });

    await clientInstance.send(new GetObjectCommand({ Bucket: "b", Key: "k" }));
    expect(capturedClient).toBe(clientInstance);

    mock.restore();
  });

  test("callsFakeOnce should allow accessing client instance", async () => {
    const client = new S3Client({ region: "us-east-1" });
    const mock = mockClientInstance(client);

    mock
      .on(GetObjectCommand)
      .callsFakeOnce(async (input: GetObjectCommandInput, getClient) => {
        const c = getClient as S3Client;
        expect(c).toBe(client);
        expect(await c?.config.region()).toBe("us-east-1");
        return {
          Body: "client-access-once" as unknown as GetObjectCommandOutput["Body"],
          $metadata: {},
        } as GetObjectCommandOutput;
      });

    const response = await client.send(
      new GetObjectCommand({ Bucket: "b", Key: "k" }),
    );
    expect(response.Body).toBe("client-access-once");
  });

  test("callsFake should allow accessing client instance", async () => {
    const client = new S3Client({ region: "us-east-1" });
    const mock = mockClientInstance(client);

    mock
      .on(GetObjectCommand)
      .callsFake(async (input: GetObjectCommandInput, getClient) => {
        const c = getClient as S3Client;
        expect(c).toBe(client);
        expect(await c?.config.region()).toBe("us-east-1");
        return {
          Body: "client-access" as unknown as GetObjectCommandOutput["Body"],
          $metadata: {},
        } as GetObjectCommandOutput;
      });

    const response = await client.send(
      new GetObjectCommand({ Bucket: "b", Key: "k" }),
    );
    expect(response.Body).toBe("client-access");
  });
});

describe("multiple clients", () => {
  test("should support mocking multiple clients independently", async () => {
    const s3Mock = mockClient(S3Client);
    const ddbMock = mockClient(DynamoDBClient);

    s3Mock.on(GetObjectCommand).resolves({
      Body: "s3-data" as unknown as GetObjectCommandOutput["Body"],
    });
    ddbMock.on(GetItemCommand).resolves({ Item: { id: { S: "ddb-data" } } });

    const s3 = new S3Client({});
    const ddb = new DynamoDBClient({});

    const s3Response = await s3.send(
      new GetObjectCommand({ Bucket: "b", Key: "k" }),
    );
    const ddbResponse = await ddb.send(
      new GetItemCommand({ TableName: "t", Key: { id: { S: "1" } } }),
    );

    expect(s3Response.Body).toBe("s3-data");
    expect(ddbResponse.Item).toEqual({ id: { S: "ddb-data" } });

    s3Mock.restore();
    ddbMock.restore();
  });

  test("should throw error if command is not mocked (and crash if bug exists)", async () => {
    mockClient(S3Client);
    const client = new S3Client({});
    // We don't call s3Mock.on(PutObjectCommand)
    await expect(
      client.send(new PutObjectCommand({ Bucket: "b", Key: "k" })),
    ).rejects.toThrow("No mock configured for command: PutObjectCommand");
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
      .resolvesWithDelay({ Body: "delayed data" }, 100);

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
          Key: { id: { S: "123" } },
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
          Key: { id: { S: "123" } },
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
});

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
    s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

    await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    expect(s3Mock).toHaveReceivedNoOtherCommands([GetObjectCommand]);
  });

  test("should fail when unexpected commands are received", async () => {
    s3Mock.on(GetObjectCommand).resolves({ Body: "test" });
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
    s3Mock.on(GetObjectCommand).resolves({ Body: "test" });
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
  });
});

describe("Paginator Support", () => {
  let dynamoMock: ReturnType<typeof mockClient>;
  let s3Mock: ReturnType<typeof mockClient>;
  let dynamoClient: DynamoDBClient;
  let s3Client: S3Client;

  beforeEach(() => {
    dynamoMock = mockClient(DynamoDBClient);
    s3Mock = mockClient(S3Client);
    dynamoClient = new DynamoDBClient({});
    s3Client = new S3Client({});
  });

  afterEach(() => {
    dynamoMock.restore();
    s3Mock.restore();
  });

  test("should simulate DynamoDB scan pagination", async () => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      id: { S: `item-${index + 1}` },
    }));

    dynamoMock.on(GetItemCommand).resolvesPaginated(items, {
      pageSize: 10,
      itemsKey: "Items",
    });

    // First page
    const result1 = await dynamoClient.send(
      new GetItemCommand({
        TableName: "test-table",
      }),
    );

    expect(result1.Items).toHaveLength(10);
    expect((result1.Items as Array<{ id: { S: string } }>)[0]).toEqual({
      id: { S: "item-1" },
    });
    expect(result1.NextToken).toBe("token-10");

    // Second page
    const result2 = await dynamoClient.send(
      new GetItemCommand({
        TableName: "test-table",
        NextToken: "token-10",
      }),
    );

    expect(result2.Items).toHaveLength(10);
    expect((result2.Items as Array<{ id: { S: string } }>)[0]).toEqual({
      id: { S: "item-11" },
    });
    expect(result2.NextToken).toBe("token-20");

    // Third page
    const result3 = await dynamoClient.send(
      new GetItemCommand({
        TableName: "test-table",
        NextToken: "token-20",
      }),
    );

    expect(result3.Items).toHaveLength(5);
    expect((result3.Items as Array<{ id: { S: string } }>)[0]).toEqual({
      id: { S: "item-21" },
    });
    expect(result3.NextToken).toBeUndefined();
  });

  test("should simulate S3 list objects pagination", async () => {
    const objects = Array.from({ length: 15 }, (_, index) => ({
      Key: `file-${index + 1}.txt`,
    }));

    s3Mock.on(GetObjectCommand).resolvesPaginated(objects, {
      pageSize: 10,
      tokenKey: "ContinuationToken",
      itemsKey: "Contents",
    });

    // First page
    const result1 = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
      }),
    );

    expect(result1.Contents).toHaveLength(10);
    expect((result1.Contents as Array<{ Key: string }>)[0]).toEqual({
      Key: "file-1.txt",
    });
    expect(result1.ContinuationToken).toBe("token-10");

    // Second page
    const result2 = await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        ContinuationToken: "token-10",
      }),
    );

    expect(result2.Contents).toHaveLength(5);
    expect((result2.Contents as Array<{ Key: string }>)[0]).toEqual({
      Key: "file-11.txt",
    });
    expect(result2.ContinuationToken).toBeUndefined();
  });

  test("should handle empty paginated results", async () => {
    dynamoMock.on(GetItemCommand).resolvesPaginated([]);

    const result = await dynamoClient.send(
      new GetItemCommand({
        TableName: "test-table",
      }),
    );

    expect(result.Items).toEqual([]);
    expect(result.NextToken).toBeUndefined();
  });

  test("should handle single page results", async () => {
    const items = [{ id: { S: "item-1" } }, { id: { S: "item-2" } }];

    dynamoMock.on(GetItemCommand).resolvesPaginated(items, { pageSize: 10 });

    const result = await dynamoClient.send(
      new GetItemCommand({
        TableName: "test-table",
      }),
    );

    expect(result.Items).toEqual(items);
    expect(result.NextToken).toBeUndefined();
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
    s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

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
    s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

    await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      "[aws-sdk-vitest-mock](Debug) Received command: GetObjectCommand",
      { Bucket: "test-bucket", Key: "test-key" },
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "[aws-sdk-vitest-mock](Debug) Found 1 mock(s) for GetObjectCommand",
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "[aws-sdk-vitest-mock](Debug) Using mock at index 0 for GetObjectCommand",
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

    expect(consoleSpy).toHaveBeenCalledWith(
      "[aws-sdk-vitest-mock](Debug) Received command: GetObjectCommand",
      { Bucket: "test-bucket", Key: "test-key" },
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "[aws-sdk-vitest-mock](Debug) No mocks configured for GetObjectCommand",
    );
  });

  test("should log when mock does not match", async () => {
    s3Mock.enableDebug();
    s3Mock
      .on(GetObjectCommand, { Bucket: "other-bucket" })
      .resolves({ Body: "test" });

    await expect(
      s3Client.send(
        new GetObjectCommand({
          Bucket: "test-bucket",
          Key: "test-key",
        }),
      ),
    ).rejects.toThrow();

    expect(consoleSpy).toHaveBeenCalledWith(
      "[aws-sdk-vitest-mock](Debug) Found 1 mock(s) for GetObjectCommand",
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "[aws-sdk-vitest-mock](Debug) No matching mock found for GetObjectCommand",
      { Bucket: "test-bucket", Key: "test-key" },
    );
  });

  test("should log when one-time mock is removed", async () => {
    s3Mock.enableDebug();
    s3Mock.on(GetObjectCommand).resolvesOnce({ Body: "test" });

    await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      "[aws-sdk-vitest-mock](Debug) Removed one-time mock for GetObjectCommand",
    );
  });

  test("should stop logging when debug is disabled", async () => {
    s3Mock.enableDebug();
    s3Mock.disableDebug();
    s3Mock.on(GetObjectCommand).resolves({ Body: "test" });

    await s3Client.send(
      new GetObjectCommand({
        Bucket: "test-bucket",
        Key: "test-key",
      }),
    );

    expect(consoleSpy).not.toHaveBeenCalled();
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
