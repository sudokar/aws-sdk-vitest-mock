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
 * Custom Vitest matchers for AWS SDK assertions
 * @category Matchers
 */
export { matchers } from "./lib/matchers.js";

/**
 * TypeScript types for matcher interfaces
 * @category Matchers
 */
export type { AwsSdkMatchers } from "./lib/matchers.js";
