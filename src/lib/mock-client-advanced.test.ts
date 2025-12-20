import { Readable } from "node:stream";
import {
  S3Client,
  GetObjectCommand,
  GetObjectCommandInput,
  GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { expect, test, beforeEach, afterEach, describe } from "vitest";
import {
  mockClient,
  mockClientInstance,
  AwsClientStub,
} from "./mock-client.js";
import "./vitest-setup.js";

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
