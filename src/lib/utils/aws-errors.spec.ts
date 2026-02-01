import { describe, it, expect } from "vitest";
import {
  AwsError,
  createNoSuchKeyError,
  createNoSuchBucketError,
  createAccessDeniedError,
  createResourceNotFoundError,
  createConditionalCheckFailedError,
  createThrottlingError,
  createInternalServerError,
} from "./aws-errors.js";

describe("aws-errors", () => {
  describe("AwsError", () => {
    it("should create error with all properties", () => {
      const error = new AwsError("Test message", "TestCode", 400, true);

      expect(error.message).toBe("Test message");
      expect(error.name).toBe("TestCode");
      expect(error.code).toBe("TestCode");
      expect(error.statusCode).toBe(400);
      expect(error.retryable).toBe(true);
    });

    it("should create error with optional properties undefined", () => {
      const error = new AwsError("Test message", "TestCode");

      expect(error.message).toBe("Test message");
      expect(error.name).toBe("TestCode");
      expect(error.code).toBe("TestCode");
      expect(error.statusCode).toBeUndefined();
      expect(error.retryable).toBeUndefined();
    });

    it("should have $metadata with httpStatusCode matching statusCode", () => {
      const error = new AwsError("Test message", "TestCode", 404, false);

      expect(error.$metadata).toBeDefined();
      expect(error.$metadata?.httpStatusCode).toBe(404);
    });

    it("should have $metadata with undefined httpStatusCode when statusCode not provided", () => {
      const error = new AwsError("Test message", "TestCode");

      expect(error.$metadata).toBeDefined();
      expect(error.$metadata?.httpStatusCode).toBeUndefined();
    });

    it("should be an instance of AwsError", () => {
      const error = new AwsError("Test message", "TestCode");

      expect(error).toBeInstanceOf(AwsError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("S3 Errors", () => {
    describe("createNoSuchKeyError", () => {
      it("should create error with key parameter", () => {
        const error = createNoSuchKeyError("test-key");

        expect(error.code).toBe("NoSuchKey");
        expect(error.name).toBe("NoSuchKey");
        expect(error.statusCode).toBe(404);
        expect(error.retryable).toBe(false);
        expect(error.message).toBe(
          "The specified key does not exist. Key: test-key",
        );
      });

      it("should create error without key parameter", () => {
        const error = createNoSuchKeyError();

        expect(error.code).toBe("NoSuchKey");
        expect(error.name).toBe("NoSuchKey");
        expect(error.message).toBe("The specified key does not exist.");
      });
    });

    describe("createNoSuchBucketError", () => {
      it("should create error with bucket parameter", () => {
        const error = createNoSuchBucketError("test-bucket");

        expect(error.code).toBe("NoSuchBucket");
        expect(error.name).toBe("NoSuchBucket");
        expect(error.statusCode).toBe(404);
        expect(error.retryable).toBe(false);
        expect(error.message).toBe(
          "The specified bucket does not exist. Bucket: test-bucket",
        );
      });

      it("should create error without bucket parameter", () => {
        const error = createNoSuchBucketError();

        expect(error.code).toBe("NoSuchBucket");
        expect(error.name).toBe("NoSuchBucket");
        expect(error.message).toBe("The specified bucket does not exist.");
      });
    });

    describe("createAccessDeniedError", () => {
      it("should create error with resource parameter", () => {
        const error = createAccessDeniedError("test-resource");

        expect(error.code).toBe("AccessDenied");
        expect(error.name).toBe("AccessDenied");
        expect(error.statusCode).toBe(403);
        expect(error.retryable).toBe(false);
        expect(error.message).toBe("Access Denied for resource: test-resource");
      });

      it("should create error without resource parameter", () => {
        const error = createAccessDeniedError();

        expect(error.code).toBe("AccessDenied");
        expect(error.name).toBe("AccessDenied");
        expect(error.message).toBe("Access Denied");
      });
    });
  });

  describe("DynamoDB Errors", () => {
    describe("createResourceNotFoundError", () => {
      it("should create error with resource parameter", () => {
        const error = createResourceNotFoundError("test-table");

        expect(error.code).toBe("ResourceNotFoundException");
        expect(error.name).toBe("ResourceNotFoundException");
        expect(error.statusCode).toBe(400);
        expect(error.retryable).toBe(false);
        expect(error.message).toBe("Requested resource not found: test-table");
      });

      it("should create error without resource parameter", () => {
        const error = createResourceNotFoundError();

        expect(error.code).toBe("ResourceNotFoundException");
        expect(error.name).toBe("ResourceNotFoundException");
        expect(error.message).toBe("Requested resource not found");
      });
    });

    describe("createConditionalCheckFailedError", () => {
      it("should create error with correct properties", () => {
        const error = createConditionalCheckFailedError();

        expect(error.code).toBe("ConditionalCheckFailedException");
        expect(error.name).toBe("ConditionalCheckFailedException");
        expect(error.statusCode).toBe(400);
        expect(error.retryable).toBe(false);
        expect(error.message).toBe("The conditional request failed");
      });
    });
  });

  describe("General AWS Errors", () => {
    describe("createThrottlingError", () => {
      it("should create error with correct properties", () => {
        const error = createThrottlingError();

        expect(error.code).toBe("Throttling");
        expect(error.name).toBe("Throttling");
        expect(error.statusCode).toBe(400);
        expect(error.retryable).toBe(true);
        expect(error.message).toBe("Rate exceeded");
      });
    });

    describe("createInternalServerError", () => {
      it("should create error with correct properties", () => {
        const error = createInternalServerError();

        expect(error.code).toBe("InternalServerError");
        expect(error.name).toBe("InternalServerError");
        expect(error.statusCode).toBe(500);
        expect(error.retryable).toBe(true);
        expect(error.message).toBe(
          "We encountered an internal error. Please try again.",
        );
      });
    });
  });
});
