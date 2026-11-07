import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { expect, test, beforeEach, afterEach, describe } from "vitest";
import { mockClient, type AwsClientStub } from "./mock-client.js";
import { createNoSuchKeyError } from "./utils/aws-errors.js";
import "./vitest-setup.js";

describe("migration parity", () => {
  let s3Mock: AwsClientStub<S3Client>;
  let client: S3Client;

  beforeEach(() => {
    s3Mock = mockClient(S3Client);
    client = new S3Client({ region: "us-east-1" });
  });

  afterEach(() => {
    s3Mock.restore();
  });

  describe("SDK stream bodies", () => {
    test("resolvesStream body supports transformToString", async () => {
      s3Mock.on(GetObjectCommand).resolvesStream("a;b");
      const response = await client.send(
        new GetObjectCommand({ Bucket: "b", Key: "k" }),
      );
      await expect(response.Body?.transformToString()).resolves.toBe("a;b");
    });

    test("resolvesStreamOnce body supports transformToByteArray", async () => {
      s3Mock.on(GetObjectCommand).resolvesStreamOnce("abc");
      const response = await client.send(
        new GetObjectCommand({ Bucket: "b", Key: "k" }),
      );
      const bytes = await response.Body?.transformToByteArray();
      expect(new TextDecoder().decode(bytes)).toBe("abc");
    });

    test("resolvesStream body supports transformToWebStream", async () => {
      s3Mock.on(GetObjectCommand).resolvesStream("web");
      const response = await client.send(
        new GetObjectCommand({ Bucket: "b", Key: "k" }),
      );
      const text = await new Response(
        response.Body?.transformToWebStream(),
      ).text();
      expect(text).toBe("web");
    });
  });

  describe("one-time error helpers", () => {
    test("rejectsWithNoSuchKeyOnce rejects once then falls back", async () => {
      s3Mock
        .on(GetObjectCommand)
        .resolves({})
        .rejectsWithNoSuchKeyOnce("missing.csv");

      await expect(
        client.send(new GetObjectCommand({ Bucket: "b", Key: "k" })),
      ).rejects.toMatchObject({ name: "NoSuchKey" });
      await expect(
        client.send(new GetObjectCommand({ Bucket: "b", Key: "k" })),
      ).resolves.toBeDefined();
    });

    test.each([
      ["rejectsWithNoSuchBucketOnce", "NoSuchBucket"],
      ["rejectsWithAccessDeniedOnce", "AccessDenied"],
      ["rejectsWithResourceNotFoundOnce", "ResourceNotFoundException"],
      [
        "rejectsWithConditionalCheckFailedOnce",
        "ConditionalCheckFailedException",
      ],
      ["rejectsWithThrottlingOnce", "Throttling"],
      ["rejectsWithInternalServerErrorOnce", "InternalServerError"],
    ] as const)("%s rejects with %s only once", async (method, name) => {
      const stub = s3Mock.on(GetObjectCommand).resolves({});
      stub[method]();

      await expect(
        client.send(new GetObjectCommand({ Bucket: "b", Key: "k" })),
      ).rejects.toMatchObject({ name });
      await expect(
        client.send(new GetObjectCommand({ Bucket: "b", Key: "k" })),
      ).resolves.toBeDefined();
    });

    test("exported factories work with rejectsOnce", async () => {
      s3Mock.on(GetObjectCommand).rejectsOnce(createNoSuchKeyError("x"));
      await expect(
        client.send(new GetObjectCommand({ Bucket: "b", Key: "k" })),
      ).rejects.toMatchObject({ name: "NoSuchKey" });
    });
  });

  describe("synchronous callsFake", () => {
    test("callsFake accepts a sync handler", async () => {
      s3Mock.on(GetObjectCommand).callsFake(() => ({ ContentLength: 3 }));
      const response = await client.send(
        new GetObjectCommand({ Bucket: "b", Key: "k" }),
      );
      expect(response.ContentLength).toBe(3);
    });

    test("callsFakeOnce accepts a sync handler", async () => {
      s3Mock.on(GetObjectCommand).callsFakeOnce(() => ({ ContentLength: 1 }));
      const response = await client.send(
        new GetObjectCommand({ Bucket: "b", Key: "k" }),
      );
      expect(response.ContentLength).toBe(1);
    });

    test("sync callsFake that throws rejects the send", async () => {
      s3Mock.on(GetObjectCommand).callsFake(() => {
        throw new Error("boom");
      });
      await expect(
        client.send(new GetObjectCommand({ Bucket: "b", Key: "k" })),
      ).rejects.toThrow("boom");
    });
  });

  describe("commandCalls", () => {
    test("returns typed calls of one command type", async () => {
      s3Mock.on(GetObjectCommand).resolves({});
      s3Mock.on(PutObjectCommand).resolves({});
      await client.send(new PutObjectCommand({ Bucket: "b", Key: "p" }));
      await client.send(new GetObjectCommand({ Bucket: "b", Key: "g" }));

      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.input.Key).toBe("g");
    });

    test("includes sends that failed with no matching mock", async () => {
      s3Mock.on(GetObjectCommand, { Bucket: "other" }).resolves({});
      await expect(
        client.send(new GetObjectCommand({ Bucket: "b", Key: "k" })),
      ).rejects.toThrow();

      expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(1);
    });
  });

  describe("matchers", () => {
    beforeEach(() => {
      s3Mock.on(GetObjectCommand).resolves({});
      s3Mock.on(PutObjectCommand).resolves({});
    });

    test("toHaveReceivedCommandOnce", async () => {
      await client.send(new GetObjectCommand({ Bucket: "b", Key: "k" }));
      expect(s3Mock).toHaveReceivedCommandOnce(GetObjectCommand);
      expect(s3Mock).not.toHaveReceivedCommandOnce(PutObjectCommand);

      await client.send(new GetObjectCommand({ Bucket: "b", Key: "k" }));
      expect(s3Mock).not.toHaveReceivedCommandOnce(GetObjectCommand);
    });

    test("toHaveReceivedCommandExactlyOnceWith", async () => {
      await client.send(new GetObjectCommand({ Bucket: "b", Key: "k" }));
      expect(s3Mock).toHaveReceivedCommandExactlyOnceWith(GetObjectCommand, {
        Bucket: "b",
        Key: "k",
      });
      expect(s3Mock).not.toHaveReceivedCommandExactlyOnceWith(
        GetObjectCommand,
        { Bucket: "b", Key: "other" },
      );

      await client.send(new GetObjectCommand({ Bucket: "b", Key: "k" }));
      expect(s3Mock).not.toHaveReceivedCommandExactlyOnceWith(
        GetObjectCommand,
        { Bucket: "b", Key: "k" },
      );
    });

    test("toHaveReceivedLastCommandWith", async () => {
      await client.send(new GetObjectCommand({ Bucket: "b", Key: "1" }));
      await client.send(new GetObjectCommand({ Bucket: "b", Key: "2" }));
      await client.send(new PutObjectCommand({ Bucket: "b", Key: "3" }));

      expect(s3Mock).toHaveReceivedLastCommandWith(GetObjectCommand, {
        Bucket: "b",
        Key: "2",
      });
      expect(s3Mock).not.toHaveReceivedLastCommandWith(GetObjectCommand, {
        Bucket: "b",
        Key: "1",
      });
    });

    test("toHaveReceivedAnyCommand", async () => {
      expect(s3Mock).not.toHaveReceivedAnyCommand();
      await client.send(new GetObjectCommand({ Bucket: "b", Key: "k" }));
      expect(s3Mock).toHaveReceivedAnyCommand();
    });

    test("toHaveReceivedNthCommandOfTypeWith counts per command", async () => {
      await client.send(new GetObjectCommand({ Bucket: "b", Key: "g" }));
      await client.send(new PutObjectCommand({ Bucket: "b", Key: "1" }));
      await client.send(new PutObjectCommand({ Bucket: "b", Key: "2" }));

      expect(s3Mock).toHaveReceivedNthCommandOfTypeWith(2, PutObjectCommand, {
        Bucket: "b",
        Key: "2",
      });
      expect(s3Mock).not.toHaveReceivedNthCommandWith(2, PutObjectCommand, {
        Bucket: "b",
        Key: "2",
      });
      expect(s3Mock).not.toHaveReceivedNthCommandOfTypeWith(
        3,
        PutObjectCommand,
        { Bucket: "b", Key: "2" },
      );
    });
  });

  describe("pagination tokens", () => {
    const keys = ["a", "b", "c", "d", "e"].map((Key) => ({ Key }));
    const base = {
      pageSize: 2,
      itemsKey: "Contents",
      tokenKey: "NextContinuationToken",
      inputTokenKey: "ContinuationToken",
    };

    test("tokens option sets exact tokens and matches them on input", async () => {
      s3Mock
        .on(ListObjectsV2Command)
        .resolvesPaginated(keys, { ...base, tokens: ["t1", "t2"] });

      const p1 = await client.send(new ListObjectsV2Command({ Bucket: "b" }));
      expect(p1.NextContinuationToken).toBe("t1");
      const p2 = await client.send(
        new ListObjectsV2Command({ Bucket: "b", ContinuationToken: "t1" }),
      );
      expect(p2.Contents).toEqual([{ Key: "c" }, { Key: "d" }]);
      expect(p2.NextContinuationToken).toBe("t2");
      const p3 = await client.send(
        new ListObjectsV2Command({ Bucket: "b", ContinuationToken: "t2" }),
      );
      expect(p3.Contents).toEqual([{ Key: "e" }]);
      expect(p3.NextContinuationToken).toBeUndefined();
    });

    test("tokenFor computes tokens", async () => {
      s3Mock.on(ListObjectsV2Command).resolvesPaginated(keys, {
        ...base,
        tokenFor: (index) => `page-${index + 1}`,
      });
      const p1 = await client.send(new ListObjectsV2Command({ Bucket: "b" }));
      expect(p1.NextContinuationToken).toBe("page-1");
      const p2 = await client.send(
        new ListObjectsV2Command({ Bucket: "b", ContinuationToken: "page-1" }),
      );
      expect(p2.NextContinuationToken).toBe("page-2");
    });

    test("tokens wins over tokenFor", async () => {
      s3Mock.on(ListObjectsV2Command).resolvesPaginated(keys, {
        ...base,
        tokens: ["t1", "t2"],
        tokenFor: () => "ignored",
      });
      const p1 = await client.send(new ListObjectsV2Command({ Bucket: "b" }));
      expect(p1.NextContinuationToken).toBe("t1");
    });

    test("throws when tokens has too few entries", () => {
      expect(() =>
        s3Mock
          .on(ListObjectsV2Command)
          .resolvesPaginated(keys, { ...base, tokens: ["t1"] }),
      ).toThrow(TypeError);
    });

    test("throws when tokens are duplicated", () => {
      expect(() =>
        s3Mock
          .on(ListObjectsV2Command)
          .resolvesPaginated(keys, { ...base, tokens: ["t", "t"] }),
      ).toThrow("unique");
      expect(() =>
        s3Mock
          .on(ListObjectsV2Command)
          .resolvesPaginated(keys, { ...base, tokenFor: () => "same" }),
      ).toThrow("unique");
    });

    test("throws when a non-last page token is undefined or null", () => {
      expect(() =>
        s3Mock
          .on(ListObjectsV2Command)
          .resolvesPaginated(keys, { ...base, tokens: [undefined, "t2"] }),
      ).toThrow("undefined or null");
      expect(() =>
        s3Mock
          .on(ListObjectsV2Command)
          // eslint-disable-next-line unicorn/no-null -- testing null rejection
          .resolvesPaginated(keys, { ...base, tokenFor: () => null }),
      ).toThrow("undefined or null");
    });

    test("resolvesPaginatedOnce ignores the input token", async () => {
      s3Mock
        .on(ListObjectsV2Command)
        .resolvesPaginatedOnce(keys.slice(0, 3), { ...base, tokens: ["t1"] });

      await client.send(new ListObjectsV2Command({ Bucket: "b" }));
      const p2 = await client.send(
        new ListObjectsV2Command({ Bucket: "b", ContinuationToken: "wrong" }),
      );
      expect(p2.Contents).toEqual([{ Key: "c" }]);
    });

    test("resolvesPaginatedOnce serves the sequence once then falls through", async () => {
      s3Mock
        .on(ListObjectsV2Command)
        .resolves({ Contents: [{ Key: "fallback" }] })
        .resolvesPaginatedOnce(keys.slice(0, 3), { ...base, tokens: ["t1"] });

      const p1 = await client.send(new ListObjectsV2Command({ Bucket: "b" }));
      expect(p1.NextContinuationToken).toBe("t1");
      const p2 = await client.send(
        new ListObjectsV2Command({ Bucket: "b", ContinuationToken: "t1" }),
      );
      expect(p2.Contents).toEqual([{ Key: "c" }]);
      const p3 = await client.send(new ListObjectsV2Command({ Bucket: "b" }));
      expect(p3.Contents).toEqual([{ Key: "fallback" }]);
    });
  });
});
