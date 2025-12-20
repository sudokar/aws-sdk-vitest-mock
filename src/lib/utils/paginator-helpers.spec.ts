import { describe, it, expect } from "vitest";
import { createPaginatedResponses } from "./paginator-helpers.js";

describe("paginator-helpers", () => {
  describe("createPaginatedResponses", () => {
    it("should create single page for empty items", () => {
      const responses = createPaginatedResponses([]);

      expect(responses).toHaveLength(1);
      expect(responses[0]).toEqual({ Items: [] });
    });

    it("should create single page for items within page size", () => {
      const items = [1, 2, 3];
      const responses = createPaginatedResponses(items);

      expect(responses).toHaveLength(1);
      expect(responses[0]).toEqual({ Items: [1, 2, 3] });
      expect(responses[0].NextToken).toBeUndefined();
    });

    it("should create multiple pages for items exceeding page size", () => {
      const items = Array.from({ length: 25 }, (_, index) => index + 1);
      const responses = createPaginatedResponses(items, { pageSize: 10 });

      expect(responses).toHaveLength(3);

      expect(responses[0]).toEqual({
        Items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        NextToken: 10, // Last item of the page
      });

      expect(responses[1]).toEqual({
        Items: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
        NextToken: 20, // Last item of the page
      });

      expect(responses[2]).toEqual({
        Items: [21, 22, 23, 24, 25],
      });
      expect(responses[2].NextToken).toBeUndefined();
    });

    it("should use custom token key", () => {
      const items = Array.from({ length: 15 }, (_, index) => index + 1);
      const responses = createPaginatedResponses(items, {
        pageSize: 10,
        tokenKey: "ContinuationToken",
      });

      expect(responses).toHaveLength(2);
      expect(responses[0].ContinuationToken).toBe(10); // Last item
      expect(responses[0].NextToken).toBeUndefined();
    });

    it("should use custom items key", () => {
      const items = ["file1.txt", "file2.txt"];
      const responses = createPaginatedResponses(items, {
        itemsKey: "Contents",
      });

      expect(responses).toHaveLength(1);
      expect(responses[0]).toEqual({ Contents: ["file1.txt", "file2.txt"] });
      expect(responses[0].Items).toBeUndefined();
    });

    it("should handle custom page size", () => {
      const items = [1, 2, 3, 4, 5];
      const responses = createPaginatedResponses(items, { pageSize: 2 });

      expect(responses).toHaveLength(3);
      expect(responses[0]).toEqual({
        Items: [1, 2],
        NextToken: 2, // Last item
      });
      expect(responses[1]).toEqual({
        Items: [3, 4],
        NextToken: 4, // Last item
      });
      expect(responses[2]).toEqual({
        Items: [5],
      });
    });

    it("should support DynamoDB-style pagination with custom output token", () => {
      // DynamoDB uses LastEvaluatedKey in the response
      // and ExclusiveStartKey in the request (handled by mock-client.ts)
      const items = Array.from({ length: 15 }, (_, index) => ({
        id: { S: `item-${index + 1}` },
      }));
      const responses = createPaginatedResponses(items, {
        pageSize: 10,
        tokenKey: "LastEvaluatedKey", // Output token key
      });

      expect(responses).toHaveLength(2);

      // First page has LastEvaluatedKey as the last item (object)
      expect(responses[0].LastEvaluatedKey).toEqual({ id: { S: "item-10" } });
      expect(responses[0].NextToken).toBeUndefined();
      expect(responses[0].Items).toHaveLength(10);

      // Last page has no token
      expect(responses[1].LastEvaluatedKey).toBeUndefined();
      expect(responses[1].Items).toHaveLength(5);
    });

    it("should support S3-style pagination with Contents", () => {
      // S3 ListObjectsV2 uses Contents and ContinuationToken
      const items = Array.from({ length: 15 }, (_, index) => ({
        Key: `file-${index + 1}.txt`,
      }));
      const responses = createPaginatedResponses(items, {
        pageSize: 10,
        itemsKey: "Contents",
        tokenKey: "NextContinuationToken",
      });

      expect(responses).toHaveLength(2);
      expect(responses[0].Contents).toHaveLength(10);
      expect(responses[0].NextContinuationToken).toEqual({
        Key: "file-10.txt",
      }); // Last item
      expect(responses[0].Items).toBeUndefined();
    });

    it("should use last item as token for all pagination types", () => {
      // Tokens are always the last item of the page (works for DynamoDB, S3, etc.)
      const items = Array.from({ length: 5 }, (_, index) => ({
        id: { S: `item-${index + 1}` },
      }));

      const responses = createPaginatedResponses(items, {
        pageSize: 2,
        tokenKey: "LastEvaluatedKey",
      });

      expect(responses).toHaveLength(3);

      // First page should have LastEvaluatedKey as an object (last item of the page)
      expect(responses[0].Items).toHaveLength(2);
      expect(responses[0].LastEvaluatedKey).toEqual({ id: { S: "item-2" } });
      expect(typeof responses[0].LastEvaluatedKey).toBe("object");

      // Second page
      expect(responses[1].Items).toHaveLength(2);
      expect(responses[1].LastEvaluatedKey).toEqual({ id: { S: "item-4" } });
      expect(typeof responses[1].LastEvaluatedKey).toBe("object");

      // Last page has no token
      expect(responses[2].Items).toHaveLength(1);
      expect(responses[2].LastEvaluatedKey).toBeUndefined();
    });

    it("should work with simple scalar items", () => {
      const items = [1, 2, 3, 4, 5];

      const responses = createPaginatedResponses(items, {
        pageSize: 2,
        tokenKey: "NextToken",
      });

      expect(responses).toHaveLength(3);

      // Tokens are the last items (scalars in this case)
      expect(responses[0].NextToken).toBe(2);
      expect(responses[1].NextToken).toBe(4);
      expect(responses[2].NextToken).toBeUndefined();
    });
  });
});
