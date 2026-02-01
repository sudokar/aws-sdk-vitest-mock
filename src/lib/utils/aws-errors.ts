/**
 * Common AWS SDK error types and factory functions
 */

export class AwsError extends Error {
  public readonly name: string;
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly retryable?: boolean;
  public readonly $metadata?: {
    httpStatusCode?: number;
    requestId?: string;
    extendedRequestId?: string;
    cfId?: string;
    attempts?: number;
    totalRetryDelay?: number;
  };

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    retryable?: boolean,
  ) {
    super(message);
    this.name = code;
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.$metadata = {
      httpStatusCode: statusCode,
    };

    // Fix prototype chain for proper instanceof behavior across environments
    Object.setPrototypeOf(this, AwsError.prototype);
  }
}

// S3 Errors
export const createNoSuchKeyError = (key?: string): AwsError =>
  new AwsError(
    key
      ? `The specified key does not exist. Key: ${key}`
      : "The specified key does not exist.",
    "NoSuchKey",
    404,
    false,
  );

export const createNoSuchBucketError = (bucket?: string): AwsError =>
  new AwsError(
    bucket
      ? `The specified bucket does not exist. Bucket: ${bucket}`
      : "The specified bucket does not exist.",
    "NoSuchBucket",
    404,
    false,
  );

export const createAccessDeniedError = (resource?: string): AwsError =>
  new AwsError(
    resource ? `Access Denied for resource: ${resource}` : "Access Denied",
    "AccessDenied",
    403,
    false,
  );

// DynamoDB Errors
export const createResourceNotFoundError = (resource?: string): AwsError =>
  new AwsError(
    resource
      ? `Requested resource not found: ${resource}`
      : "Requested resource not found",
    "ResourceNotFoundException",
    400,
    false,
  );

export const createConditionalCheckFailedError = (): AwsError =>
  new AwsError(
    "The conditional request failed",
    "ConditionalCheckFailedException",
    400,
    false,
  );

// General AWS Errors
export const createThrottlingError = (): AwsError =>
  new AwsError("Rate exceeded", "Throttling", 400, true);

export const createInternalServerError = (): AwsError =>
  new AwsError(
    "We encountered an internal error. Please try again.",
    "InternalServerError",
    500,
    true,
  );
