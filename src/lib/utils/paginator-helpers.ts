/**
 * Configuration options for paginated responses.
 *
 * Tokens are automatically set to the last item of each page, which works for both
 * DynamoDB-style pagination (object tokens) and S3-style pagination (object tokens).
 *
 * @example DynamoDB configuration
 * ```typescript
 * {
 *   pageSize: 10,
 *   tokenKey: "LastEvaluatedKey",      // DynamoDB response key
 *   inputTokenKey: "ExclusiveStartKey", // DynamoDB request key
 *   itemsKey: "Items"
 * }
 * ```
 *
 * @example S3 configuration
 * ```typescript
 * {
 *   pageSize: 50,
 *   tokenKey: "NextContinuationToken",  // S3 response key
 *   inputTokenKey: "ContinuationToken",  // S3 request key
 *   itemsKey: "Contents"
 * }
 * ```
 */
export interface PaginatorOptions {
  /**
   * Number of items per page.
   * @default 10
   */
  pageSize?: number;

  /**
   * Property name for the pagination token in the response.
   * The token will be set to the last item of the page.
   *
   * Common values:
   * - DynamoDB: "LastEvaluatedKey"
   * - S3: "NextContinuationToken"
   * - Generic: "NextToken"
   *
   * @default "NextToken"
   */
  tokenKey?: string;

  /**
   * Property name for the pagination token in the request.
   * If not specified, uses the same value as tokenKey.
   *
   * Use this when the service uses different names for input and output tokens.
   *
   * Common values:
   * - DynamoDB: "ExclusiveStartKey" (when tokenKey is "LastEvaluatedKey")
   * - S3: "ContinuationToken" (when tokenKey is "NextContinuationToken")
   *
   * @default Same as tokenKey
   */
  inputTokenKey?: string;

  /**
   * Property name for the items array in the response.
   *
   * Common values:
   * - DynamoDB: "Items"
   * - S3: "Contents"
   *
   * @default "Items"
   */
  itemsKey?: string;
}

export interface PaginatedResponse<T = unknown> {
  [key: string]: unknown;
  NextToken?: string;
  ContinuationToken?: string;
  Items?: T[];
  Contents?: T[];
}

/**
 * Creates paginated responses from an array of items.
 *
 * Each page's token is set to the last item of that page, enabling proper
 * pagination for services like DynamoDB (where tokens are objects) and S3.
 *
 * @param items - Array of items to paginate
 * @param options - Pagination configuration options
 * @returns Array of paginated responses, each containing a subset of items
 *
 * @example
 * ```typescript
 * const items = [1, 2, 3, 4, 5];
 * const responses = createPaginatedResponses(items, { pageSize: 2 });
 * // Returns:
 * // [
 * //   { Items: [1, 2], NextToken: 2 },
 * //   { Items: [3, 4], NextToken: 4 },
 * //   { Items: [5] }
 * // ]
 * ```
 */
export function createPaginatedResponses<T>(
  items: T[],
  options: PaginatorOptions = {},
): PaginatedResponse<T>[] {
  const { pageSize = 10, tokenKey = "NextToken", itemsKey = "Items" } = options;

  if (items.length === 0) {
    return [{ [itemsKey]: [] } as PaginatedResponse<T>];
  }

  const responses: PaginatedResponse<T>[] = [];

  for (let index = 0; index < items.length; index += pageSize) {
    const pageItems = items.slice(index, index + pageSize);
    const hasMore = index + pageSize < items.length;

    const response = { [itemsKey]: pageItems } as PaginatedResponse<T>;

    if (hasMore) {
      const responseRecord = response as Record<string, unknown>;
      // eslint-disable-next-line unicorn/prefer-at -- TypeScript target doesn't support Array.at() method
      const lastItem = pageItems[pageItems.length - 1];

      // Always use the last item as the token (works for both DynamoDB and S3)
      // eslint-disable-next-line security/detect-object-injection -- Dynamic token key assignment required for AWS pagination simulation
      responseRecord[tokenKey] = lastItem;
    }

    responses.push(response);
  }

  return responses;
}
