import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { expect, test, beforeEach, afterEach, describe } from "vitest";
import { mockClient } from "./mock-client.js";
import "./vitest-setup.js";

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
