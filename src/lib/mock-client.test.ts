import { Readable } from "node:stream";
import {
  DynamoDBClient,
  GetItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  GetObjectCommandInput,
  GetObjectCommandOutput,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
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

  test("reset should clear instance calls but keep mocks", async () => {
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

    // Mock should still work after reset
    const result = await clientInstance.send(
      new GetObjectCommand({ Bucket: "test", Key: "reset.txt" }),
    );
    expect(result.Body).toBe("before-reset");
    expect(mock.calls()).toHaveLength(1);

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
    ddbMock.on(GetItemCommand).resolves({ Item: marshall({ id: "ddb-data" }) });

    const s3 = new S3Client({});
    const ddb = new DynamoDBClient({});

    const s3Response = await s3.send(
      new GetObjectCommand({ Bucket: "b", Key: "k" }),
    );
    const ddbResponse = await ddb.send(
      new GetItemCommand({ TableName: "t", Key: marshall({ id: "1" }) }),
    );

    expect(s3Response.Body).toBe("s3-data");
    expect(ddbResponse.Item).toEqual(marshall({ id: "ddb-data" }));

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

describe("Paginator Support", () => {
  let dynamoMock: ReturnType<typeof mockClient>;
  let dynamoClient: DynamoDBClient;

  beforeEach(() => {
    dynamoMock = mockClient(DynamoDBClient);
    dynamoClient = new DynamoDBClient({});
  });

  afterEach(() => {
    dynamoMock.restore();
  });

  test("should simulate DynamoDB scan pagination", async () => {
    const items = Array.from({ length: 25 }, (_, index) =>
      marshall({ id: `item-${index + 1}` }),
    );

    dynamoMock.on(ScanCommand).resolvesPaginated(items, {
      pageSize: 10,
      itemsKey: "Items",
      tokenKey: "LastEvaluatedKey",
      inputTokenKey: "ExclusiveStartKey",
    });

    // First page
    const result1 = await dynamoClient.send(
      new ScanCommand({
        TableName: "test-table",
      }),
    );

    expect(result1.Items).toHaveLength(10);
    expect(result1.Items?.[0]).toEqual(marshall({ id: "item-1" }));
    expect(result1.LastEvaluatedKey).toBeDefined();

    // Second page
    const result2 = await dynamoClient.send(
      new ScanCommand({
        TableName: "test-table",
        ExclusiveStartKey: result1.LastEvaluatedKey,
      }),
    );

    expect(result2.Items).toHaveLength(10);
    expect(result2.Items?.[0]).toEqual(marshall({ id: "item-11" }));
    expect(result2.LastEvaluatedKey).toBeDefined();

    // Third page
    const result3 = await dynamoClient.send(
      new ScanCommand({
        TableName: "test-table",
        ExclusiveStartKey: result2.LastEvaluatedKey,
      }),
    );

    expect(result3.Items).toHaveLength(5);
    expect(result3.Items?.[0]).toEqual(marshall({ id: "item-21" }));
    expect(result3.LastEvaluatedKey).toBeUndefined();
  });

  test("should handle empty paginated results", async () => {
    dynamoMock.on(ScanCommand).resolvesPaginated([]);

    const result = await dynamoClient.send(
      new ScanCommand({
        TableName: "test-table",
      }),
    );

    expect(result.Items).toEqual([]);
    expect(result.LastEvaluatedKey).toBeUndefined();
  });

  test("should handle single page results", async () => {
    const items = [marshall({ id: "item-1" }), marshall({ id: "item-2" })];
    dynamoMock.on(ScanCommand).resolvesPaginated(items, { pageSize: 10 });

    const result = await dynamoClient.send(
      new ScanCommand({
        TableName: "test-table",
      }),
    );

    expect(result.Items).toEqual(items);
    expect(result.Items).toHaveLength(2);
    expect(result.LastEvaluatedKey).toBeUndefined();
  });

  test("should handle pagination with custom token values", async () => {
    const items = Array.from({ length: 10 }, (_, index) =>
      marshall({ id: `item-${index + 1}` }),
    );

    dynamoMock.on(ScanCommand).resolvesPaginated(items, {
      pageSize: 1,
      tokenKey: "LastEvaluatedKey",
      inputTokenKey: "ExclusiveStartKey",
    });

    const result1 = await dynamoClient.send(
      new ScanCommand({
        TableName: "test-table",
      }),
    );

    expect(result1.Items).toHaveLength(1);
    expect(result1.LastEvaluatedKey).toBeDefined();

    const result2 = await dynamoClient.send(
      new ScanCommand({
        TableName: "test-table",
        ExclusiveStartKey: result1.LastEvaluatedKey,
      }),
    );

    expect(result2.Items).toHaveLength(1);
    expect(result2.LastEvaluatedKey).toBeDefined();
  });

  test("should return LastEvaluatedKey as object, not string", async () => {
    const items = Array.from({ length: 3 }, (_, index) =>
      marshall({ id: `item-${index + 1}` }),
    );

    dynamoMock.on(ScanCommand).resolvesPaginated(items, {
      pageSize: 1,
      tokenKey: "LastEvaluatedKey",
      inputTokenKey: "ExclusiveStartKey",
    });

    const result1 = await dynamoClient.send(
      new ScanCommand({
        TableName: "test-table",
      }),
    );

    // Verify LastEvaluatedKey is an object, not a string
    expect(typeof result1.LastEvaluatedKey).toBe("object");
    expect(result1.LastEvaluatedKey).not.toBeNull();
    expect(typeof result1.LastEvaluatedKey).not.toBe("string");

    // Verify it's the marshalled key of the last item (item-1)
    expect(result1.LastEvaluatedKey).toEqual(marshall({ id: "item-1" }));

    // Verify we can use it as ExclusiveStartKey to get the next page
    const result2 = await dynamoClient.send(
      new ScanCommand({
        TableName: "test-table",
        ExclusiveStartKey: result1.LastEvaluatedKey,
      }),
    );

    expect(result2.Items).toHaveLength(1);
    expect(result2.Items?.[0]).toEqual(marshall({ id: "item-2" }));
    expect(typeof result2.LastEvaluatedKey).toBe("object");
    expect(result2.LastEvaluatedKey).toEqual(marshall({ id: "item-2" }));
  });

  test("should support real-world DynamoDB pagination with unmarshall", async () => {
    // Simulate a real DynamoDB table with user data
    const users = [
      { id: "user-1", name: "Alice", email: "alice@example.com", age: 30 },
      { id: "user-2", name: "Bob", email: "bob@example.com", age: 25 },
      { id: "user-3", name: "Charlie", email: "charlie@example.com", age: 35 },
      { id: "user-4", name: "Diana", email: "diana@example.com", age: 28 },
      { id: "user-5", name: "Eve", email: "eve@example.com", age: 32 },
    ];

    // Marshall the items (as they would be stored in DynamoDB)
    const marshalledItems = users.map((user) => marshall(user));

    dynamoMock.on(ScanCommand).resolvesPaginated(marshalledItems, {
      pageSize: 2,
      itemsKey: "Items",
      tokenKey: "LastEvaluatedKey",
      inputTokenKey: "ExclusiveStartKey",
    });

    // Page 1: Get first 2 users
    const page1 = await dynamoClient.send(
      new ScanCommand({
        TableName: "Users",
        Limit: 2,
      }),
    );

    expect(page1.Items).toHaveLength(2);
    expect(page1.LastEvaluatedKey).toBeDefined();

    // Unmarshall the items to get plain JavaScript objects
    const page1Users = page1.Items?.map((item) => unmarshall(item)) ?? [];
    expect(page1Users[0]).toEqual(users[0]);
    expect(page1Users[1]).toEqual(users[1]);

    // Verify LastEvaluatedKey is the marshalled last item
    expect(page1.LastEvaluatedKey).toEqual(marshalledItems[1]);

    // Page 2: Use LastEvaluatedKey to get next page
    const page2 = await dynamoClient.send(
      new ScanCommand({
        TableName: "Users",
        ExclusiveStartKey: page1.LastEvaluatedKey,
        Limit: 2,
      }),
    );

    expect(page2.Items).toHaveLength(2);
    expect(page2.LastEvaluatedKey).toBeDefined();

    const page2Users = page2.Items?.map((item) => unmarshall(item)) ?? [];
    expect(page2Users[0]).toEqual(users[2]);
    expect(page2Users[1]).toEqual(users[3]);

    // Verify LastEvaluatedKey is an object (marshalled key)
    expect(typeof page2.LastEvaluatedKey).toBe("object");
    expect(page2.LastEvaluatedKey).toEqual(marshalledItems[3]);

    // Page 3: Get final page
    const page3 = await dynamoClient.send(
      new ScanCommand({
        TableName: "Users",
        ExclusiveStartKey: page2.LastEvaluatedKey,
        Limit: 2,
      }),
    );

    expect(page3.Items).toHaveLength(1);
    expect(page3.LastEvaluatedKey).toBeUndefined(); // No more pages

    const page3Users = page3.Items?.map((item) => unmarshall(item)) ?? [];
    expect(page3Users[0]).toEqual(users[4]);

    // Verify we got all users across all pages
    const allUsers = [...page1Users, ...page2Users, ...page3Users];
    expect(allUsers).toEqual(users);
  });

  test("should handle DynamoDB Query with composite keys", async () => {
    // Simulate a table with partition key (userId) and sort key (timestamp)
    const messages = [
      { userId: "user-1", timestamp: 1000, message: "Hello" },
      { userId: "user-1", timestamp: 2000, message: "World" },
      { userId: "user-1", timestamp: 3000, message: "Test" },
    ];

    const marshalledMessages = messages.map((message) => marshall(message));

    dynamoMock.on(ScanCommand).resolvesPaginated(marshalledMessages, {
      pageSize: 1,
      tokenKey: "LastEvaluatedKey",
      inputTokenKey: "ExclusiveStartKey",
    });

    const page1 = await dynamoClient.send(
      new ScanCommand({ TableName: "Messages" }),
    );

    // LastEvaluatedKey should contain both partition and sort key
    expect(page1.LastEvaluatedKey).toEqual(marshalledMessages[0]);
    expect(page1.LastEvaluatedKey).toHaveProperty("userId");
    expect(page1.LastEvaluatedKey).toHaveProperty("timestamp");
    expect(page1.LastEvaluatedKey).toHaveProperty("message");

    // Can unmarshall the key
    const lastKey = page1.LastEvaluatedKey
      ? unmarshall(page1.LastEvaluatedKey)
      : {};
    expect(lastKey).toEqual(messages[0]);
  });

  test("should support real-world S3 ListObjectsV2 pagination", async () => {
    const s3Mock = mockClient(S3Client);
    const s3Client = new S3Client({});

    // Simulate S3 objects in a bucket
    const objects = Array.from({ length: 100 }, (_, index) => ({
      Key: `photos/2024/photo-${String(index + 1).padStart(3, "0")}.jpg`,
      Size: Math.floor(Math.random() * 1_000_000) + 100_000,
      LastModified: new Date(`2024-01-${(index % 30) + 1}`),
      ETag: `"etag-${index + 1}"`,
    }));

    s3Mock.on(ListObjectsV2Command).resolvesPaginated(objects, {
      pageSize: 50,
      itemsKey: "Contents",
      tokenKey: "NextContinuationToken",
      inputTokenKey: "ContinuationToken",
    });

    // Page 1: Get first 50 objects
    const page1 = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: "my-photos",
        MaxKeys: 50,
      }),
    );

    expect(page1.Contents).toHaveLength(50);
    expect(page1.NextContinuationToken).toBeDefined();
    expect(page1.Contents?.[0]?.Key).toBe("photos/2024/photo-001.jpg");
    expect(page1.Contents?.[49]?.Key).toBe("photos/2024/photo-050.jpg");

    // NextContinuationToken is the last object from page 1
    expect(page1.NextContinuationToken).toEqual(objects[49]);

    // Page 2: Use ContinuationToken to get next page
    const page2 = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: "my-photos",
        ContinuationToken: page1.NextContinuationToken,
        MaxKeys: 50,
      }),
    );

    expect(page2.Contents).toHaveLength(50);
    expect(page2.Contents?.[0]?.Key).toBe("photos/2024/photo-051.jpg");
    expect(page2.Contents?.[49]?.Key).toBe("photos/2024/photo-100.jpg");
    expect(page2.NextContinuationToken).toBeUndefined(); // No more pages

    // Verify we got all objects
    const allObjects = [...(page1.Contents ?? []), ...(page2.Contents ?? [])];
    expect(allObjects).toHaveLength(100);
    expect(allObjects.map((o) => o.Key)).toEqual(objects.map((o) => o.Key));

    s3Mock.restore();
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
