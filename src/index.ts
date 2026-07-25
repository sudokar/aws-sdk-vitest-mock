/**
 * AWS SDK Vitest Mock - A powerful, type-safe mocking library for AWS SDK v3 with Vitest
 *
 * @packageDocumentation
 *
 * @example Basic Setup
 * ```typescript
 * import { mockClient } from 'aws-sdk-vitest-mock';
 * import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
 *
 * const s3Mock = mockClient(S3Client);
 * s3Mock.on(GetObjectCommand).resolves({ Body: 'file contents' });
 *
 * const client = new S3Client({});
 * const result = await client.send(new GetObjectCommand({ Bucket: 'test', Key: 'file.txt' }));
 * ```
 *
 * @example Using Matchers
 * ```typescript
 * import { expect } from 'vitest';
 * import { matchers } from 'aws-sdk-vitest-mock';
 *
 * expect.extend(matchers);
 *
 * expect(s3Mock).toHaveReceivedCommand(GetObjectCommand);
 * ```
 */

/**
 * Core Functions for mocking AWS SDK clients
 * @category Core Functions
 */
export {
  mockClient,
  mockClientInstance,
  setGlobalDebug,
} from "./lib/mock-client.js";

/**
 * Command stub interface for configuring mock behaviors
 * @category Command Stub
 */
export type { AwsCommandStub, AwsClientStub } from "./lib/mock-client.js";

/**
 * TypeScript utility types for working with AWS SDK mocks
 * @category Types
 */
export type {
  AnyClient,
  AwsCommandConstructor,
  AwsSdkCommand,
  ClientConstructor,
  CommandConstructor,
  CommandHandler,
  CommandInputType,
  CommandOutputType,
  DeepPartial,
  MockOptions,
  StructuralCommand,
} from "./lib/mock-client.js";

/**
 * Custom Vitest matchers for AWS SDK assertions
 * @category Matchers
 */
export { matchers } from "./lib/matchers.js";

/**
 * TypeScript types for matcher interfaces
 * @category Matchers
 */
export type { AwsSdkMatchers, MatcherResult } from "./lib/matchers.js";

/**
 * TypeScript utility types used in mock configuration
 * @category Types
 */
export type { PaginatorOptions } from "./lib/utils/paginator-helpers.js";
export type { StreamInput } from "./lib/utils/stream-helpers.js";
