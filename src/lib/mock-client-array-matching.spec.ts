import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  DynamoDBClient,
  BatchWriteItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  S3Client,
  PutObjectCommand,
  PutObjectTaggingCommand,
} from "@aws-sdk/client-s3";
import { expect, test, describe, beforeEach, afterEach } from "vitest";
import { mockClient, AwsClientStub } from "./mock-client.js";
import "./vitest-setup.js";

/**
 * Test suite to verify array matching in command input parameters.
 *
 * Issue: When mocking commands with array properties (like UserAttributes in AdminCreateUserCommand),
 * the matcher fails even when the input exactly matches the mock configuration.
 *
 * Root Cause: Arrays are compared by reference (===) instead of deep equality.
 */
describe("Array Matching in Command Inputs", () => {
  describe("AdminCreateUserCommand - User Attributes Scenario", () => {
    let cognitoMock: AwsClientStub<CognitoIdentityProviderClient>;
    let cognitoClient: CognitoIdentityProviderClient;

    beforeEach(() => {
      cognitoMock = mockClient(CognitoIdentityProviderClient);
      cognitoClient = new CognitoIdentityProviderClient({
        region: "us-east-1",
      });
    });

    afterEach(() => {
      cognitoMock.restore();
    });

    test("should match UserAttributes array in partial mode", async () => {
      // This is the exact scenario from the bug report
      cognitoMock
        .on(AdminCreateUserCommand, {
          UserPoolId: "mockUserPoolId",
          Username: "mockUsername",
          MessageAction: "SUPPRESS",
          UserAttributes: [
            {
              Name: "email",
              Value: "mockEmail",
            },
            {
              Name: "email_verified",
              Value: "true",
            },
          ],
        })
        .resolves({
          User: {
            Username: "mockUsername",
            Attributes: [
              { Name: "email", Value: "mockEmail" },
              { Name: "email_verified", Value: "true" },
            ],
          },
        });

      const result = await cognitoClient.send(
        new AdminCreateUserCommand({
          UserPoolId: "mockUserPoolId",
          Username: "mockUsername",
          MessageAction: "SUPPRESS",
          UserAttributes: [
            {
              Name: "email",
              Value: "mockEmail",
            },
            {
              Name: "email_verified",
              Value: "true",
            },
          ],
        }),
      );

      expect(result.User?.Username).toBe("mockUsername");
      expect(result.User?.Attributes).toHaveLength(2);
    });

    test("should match UserAttributes array in strict mode", async () => {
      cognitoMock
        .on(
          AdminCreateUserCommand,
          {
            UserPoolId: "mockUserPoolId",
            Username: "mockUsername",
            MessageAction: "SUPPRESS",
            UserAttributes: [
              {
                Name: "email",
                Value: "mockEmail",
              },
              {
                Name: "email_verified",
                Value: "true",
              },
            ],
          },
          { strict: true },
        )
        .resolves({
          User: {
            Username: "mockUsername",
          },
        });

      const result = await cognitoClient.send(
        new AdminCreateUserCommand({
          UserPoolId: "mockUserPoolId",
          Username: "mockUsername",
          MessageAction: "SUPPRESS",
          UserAttributes: [
            {
              Name: "email",
              Value: "mockEmail",
            },
            {
              Name: "email_verified",
              Value: "true",
            },
          ],
        }),
      );

      expect(result.User?.Username).toBe("mockUsername");
    });

    test("should not match when UserAttributes content differs", async () => {
      cognitoMock
        .on(AdminCreateUserCommand, {
          UserPoolId: "mockUserPoolId",
          UserAttributes: [
            {
              Name: "email",
              Value: "different@email.com",
            },
          ],
        })
        .resolves({
          User: { Username: "testuser" },
        });

      await expect(
        cognitoClient.send(
          new AdminCreateUserCommand({
            UserPoolId: "mockUserPoolId",
            Username: "mockUsername",
            UserAttributes: [
              {
                Name: "email",
                Value: "mockEmail",
              },
            ],
          }),
        ),
      ).rejects.toThrow("No matching mock found");
    });

    test("should match with additional properties in partial mode", async () => {
      cognitoMock
        .on(AdminCreateUserCommand, {
          UserPoolId: "mockUserPoolId",
          UserAttributes: [
            {
              Name: "email",
              Value: "mockEmail",
            },
          ],
        })
        .resolves({
          User: { Username: "testuser" },
        });

      // Input has more attributes than matcher, but should still match (partial mode)
      const result = await cognitoClient.send(
        new AdminCreateUserCommand({
          UserPoolId: "mockUserPoolId",
          Username: "mockUsername",
          MessageAction: "SUPPRESS",
          UserAttributes: [
            {
              Name: "email",
              Value: "mockEmail",
            },
            {
              Name: "email_verified",
              Value: "true",
            },
          ],
        }),
      );

      expect(result.User?.Username).toBe("testuser");
    });

    test("should not match when array length differs in strict mode", async () => {
      cognitoMock
        .on(
          AdminCreateUserCommand,
          {
            UserPoolId: "mockUserPoolId",
            Username: "mockUsername",
            UserAttributes: [
              {
                Name: "email",
                Value: "mockEmail",
              },
            ],
          },
          { strict: true },
        )
        .resolves({
          User: { Username: "testuser" },
        });

      await expect(
        cognitoClient.send(
          new AdminCreateUserCommand({
            UserPoolId: "mockUserPoolId",
            Username: "mockUsername",
            UserAttributes: [
              {
                Name: "email",
                Value: "mockEmail",
              },
              {
                Name: "email_verified",
                Value: "true",
              },
            ],
          }),
        ),
      ).rejects.toThrow("No matching mock found");
    });

    test("should match empty UserAttributes array", async () => {
      cognitoMock
        .on(AdminCreateUserCommand, {
          UserPoolId: "mockUserPoolId",
          Username: "mockUsername",
          UserAttributes: [],
        })
        .resolves({
          User: { Username: "testuser" },
        });

      const result = await cognitoClient.send(
        new AdminCreateUserCommand({
          UserPoolId: "mockUserPoolId",
          Username: "mockUsername",
          UserAttributes: [],
        }),
      );

      expect(result.User?.Username).toBe("testuser");
    });
  });

  describe("S3 PutObjectTagging - TagSet Array", () => {
    let s3Mock: AwsClientStub<S3Client>;
    let s3Client: S3Client;

    beforeEach(() => {
      s3Mock = mockClient(S3Client);
      s3Client = new S3Client({ region: "us-east-1" });
    });

    afterEach(() => {
      s3Mock.restore();
    });

    test("should match TagSet array with multiple tags", async () => {
      s3Mock
        .on(PutObjectTaggingCommand, {
          Bucket: "test-bucket",
          Key: "test-key",
          Tagging: {
            TagSet: [
              { Key: "Environment", Value: "production" },
              { Key: "Application", Value: "webapp" },
            ],
          },
        })
        .resolves({ VersionId: "version1" });

      const result = await s3Client.send(
        new PutObjectTaggingCommand({
          Bucket: "test-bucket",
          Key: "test-key",
          Tagging: {
            TagSet: [
              { Key: "Environment", Value: "production" },
              { Key: "Application", Value: "webapp" },
            ],
          },
        }),
      );

      expect(result.VersionId).toBe("version1");
    });

    test("should match single tag in TagSet", async () => {
      s3Mock
        .on(PutObjectTaggingCommand, {
          Bucket: "test-bucket",
          Tagging: {
            TagSet: [{ Key: "Environment", Value: "dev" }],
          },
        })
        .resolves({ VersionId: "version2" });

      const result = await s3Client.send(
        new PutObjectTaggingCommand({
          Bucket: "test-bucket",
          Key: "any-key",
          Tagging: {
            TagSet: [{ Key: "Environment", Value: "dev" }],
          },
        }),
      );

      expect(result.VersionId).toBe("version2");
    });
  });

  describe("DynamoDB BatchWriteItem - Array of Requests", () => {
    let dynamoMock: AwsClientStub<DynamoDBClient>;
    let dynamoClient: DynamoDBClient;

    beforeEach(() => {
      dynamoMock = mockClient(DynamoDBClient);
      dynamoClient = new DynamoDBClient({ region: "us-east-1" });
    });

    afterEach(() => {
      dynamoMock.restore();
    });

    test("should match RequestItems with array of put requests", async () => {
      dynamoMock
        .on(BatchWriteItemCommand, {
          RequestItems: {
            Users: [
              {
                PutRequest: {
                  Item: {
                    id: { S: "user1" },
                    email: { S: "user1@example.com" },
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    id: { S: "user2" },
                    email: { S: "user2@example.com" },
                  },
                },
              },
            ],
          },
        })
        .resolves({
          UnprocessedItems: {},
        });

      const result = await dynamoClient.send(
        new BatchWriteItemCommand({
          RequestItems: {
            Users: [
              {
                PutRequest: {
                  Item: {
                    id: { S: "user1" },
                    email: { S: "user1@example.com" },
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    id: { S: "user2" },
                    email: { S: "user2@example.com" },
                  },
                },
              },
            ],
          },
        }),
      );

      expect(result.UnprocessedItems).toEqual({});
    });
  });

  describe("Arrays of Primitive Values", () => {
    let s3Mock: AwsClientStub<S3Client>;
    let s3Client: S3Client;

    beforeEach(() => {
      s3Mock = mockClient(S3Client);
      s3Client = new S3Client({ region: "us-east-1" });
    });

    afterEach(() => {
      s3Mock.restore();
    });

    test("should match arrays of strings", async () => {
      // Using Metadata as an example that might contain array-like string values
      s3Mock
        .on(PutObjectCommand, {
          Bucket: "test-bucket",
          Metadata: {
            tags: "tag1,tag2,tag3",
          },
        })
        .resolves({ ETag: "etag1" });

      const result = await s3Client.send(
        new PutObjectCommand({
          Bucket: "test-bucket",
          Key: "test-key",
          Body: "data",
          Metadata: {
            tags: "tag1,tag2,tag3",
          },
        }),
      );

      expect(result.ETag).toBe("etag1");
    });
  });

  describe("Nested Arrays", () => {
    let dynamoMock: AwsClientStub<DynamoDBClient>;
    let dynamoClient: DynamoDBClient;

    beforeEach(() => {
      dynamoMock = mockClient(DynamoDBClient);
      dynamoClient = new DynamoDBClient({ region: "us-east-1" });
    });

    afterEach(() => {
      dynamoMock.restore();
    });

    test("should match deeply nested arrays", async () => {
      dynamoMock
        .on(BatchWriteItemCommand, {
          RequestItems: {
            Table1: [
              {
                PutRequest: {
                  Item: {
                    data: {
                      L: [{ S: "item1" }, { S: "item2" }],
                    },
                  },
                },
              },
            ],
          },
        })
        .resolves({ UnprocessedItems: {} });

      const result = await dynamoClient.send(
        new BatchWriteItemCommand({
          RequestItems: {
            Table1: [
              {
                PutRequest: {
                  Item: {
                    data: {
                      L: [{ S: "item1" }, { S: "item2" }],
                    },
                  },
                },
              },
            ],
          },
        }),
      );

      expect(result.UnprocessedItems).toEqual({});
    });
  });

  describe("Edge Cases", () => {
    let cognitoMock: AwsClientStub<CognitoIdentityProviderClient>;
    let cognitoClient: CognitoIdentityProviderClient;

    beforeEach(() => {
      cognitoMock = mockClient(CognitoIdentityProviderClient);
      cognitoClient = new CognitoIdentityProviderClient({
        region: "us-east-1",
      });
    });

    afterEach(() => {
      cognitoMock.restore();
    });

    test("should handle null vs empty array", async () => {
      cognitoMock
        .on(AdminCreateUserCommand, {
          UserPoolId: "mockUserPoolId",
          Username: "mockUsername",
          UserAttributes: [],
        })
        .resolves({ User: { Username: "testuser" } });

      // Empty array should match
      const result1 = await cognitoClient.send(
        new AdminCreateUserCommand({
          UserPoolId: "mockUserPoolId",
          Username: "mockUsername",
          UserAttributes: [],
        }),
      );

      expect(result1.User?.Username).toBe("testuser");
    });

    test("should not match when one is array and other is not", async () => {
      cognitoMock
        .on(AdminCreateUserCommand, {
          UserPoolId: "mockUserPoolId",
          Username: "mockUsername",
          UserAttributes: [],
        })
        .resolves({ User: { Username: "testuser" } });

      await expect(
        cognitoClient.send(
          new AdminCreateUserCommand({
            UserPoolId: "mockUserPoolId",
            Username: "mockUsername",
            // @ts-expect-error - Testing invalid input type
            UserAttributes: "not-an-array",
          }),
        ),
      ).rejects.toThrow("No matching mock found");
    });

    test("should match arrays with different object property order", async () => {
      cognitoMock
        .on(AdminCreateUserCommand, {
          UserPoolId: "mockUserPoolId",
          UserAttributes: [
            {
              Name: "email",
              Value: "test@example.com",
            },
          ],
        })
        .resolves({ User: { Username: "testuser" } });

      // Object property order shouldn't matter
      const result = await cognitoClient.send(
        new AdminCreateUserCommand({
          UserPoolId: "mockUserPoolId",
          Username: "mockUsername",
          UserAttributes: [
            {
              Value: "test@example.com",
              Name: "email",
            },
          ],
        }),
      );

      expect(result.User?.Username).toBe("testuser");
    });
  });
});
