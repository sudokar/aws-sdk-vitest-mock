import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  GetObjectCommandInput,
  GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { expect, test, beforeEach, afterEach, describe } from "vitest";
import {
  mockClient,
  mockClientInstance,
  AwsClientStub,
} from "./mock-client.js";

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
    expect(calls[0][0]).toBeInstanceOf(GetObjectCommand);

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
      capturedClient = getClient();
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
      capturedClient = getClient();
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
        const c = getClient?.() as S3Client;
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
        const c = getClient?.() as S3Client;
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
