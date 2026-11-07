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

  /**
   * Explicit token for each page, by page index. Needs at least one entry per
   * page except the last, and entries must be unique and not undefined/null. Takes precedence over `tokenFor`.
   *
   * @example ["token-1", "token-2"]
   */
  tokens?: unknown[];

  /**
   * Computes the token for a page. Not called for the last page.
   * Ignored when `tokens` is set.
   *
   * @example (pageIndex) => `token-${pageIndex + 1}`
   */
  tokenFor?: (pageIndex: number, pageItems: unknown[]) => unknown;
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
export const createPaginatedResponses = <T>(
  items: T[],
  options: PaginatorOptions = {},
): PaginatedResponse<T>[] => {
  const {
    pageSize = 10,
    tokenKey = "NextToken",
    itemsKey = "Items",
    tokens,
    tokenFor,
  } = options;

  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new TypeError("pageSize must be a positive integer");
  }

  const neededTokens = Math.ceil(items.length / pageSize) - 1;
  if (tokens && tokens.length < neededTokens) {
    throw new TypeError(
      `tokens must have at least ${neededTokens} entries for ${items.length} items with pageSize ${pageSize}`,
    );
  }

  if (items.length === 0) {
    return [{ [itemsKey]: [] }];
  }

  const responses: PaginatedResponse<T>[] = [];

  for (let index = 0; index < items.length; index += pageSize) {
    const pageItems = items.slice(index, index + pageSize);
    const hasMore = index + pageSize < items.length;

    const response = { [itemsKey]: pageItems } as PaginatedResponse<T>;

    if (hasMore) {
      const responseRecord = response as Record<string, unknown>;
      const pageIndex = index / pageSize;

      // Default: last item of the page (works for both DynamoDB and S3)
      responseRecord[tokenKey] = tokens
        ? tokens[pageIndex]
        : tokenFor
          ? tokenFor(pageIndex, pageItems)
          : pageItems.at(-1);
    }

    responses.push(response);
  }

  if (tokens || tokenFor) {
    const issued = responses
      .slice(0, -1)
      .map((r) => (r as Record<string, unknown>)[tokenKey]);
    if (issued.some((t) => t === undefined || t === null)) {
      throw new TypeError("page tokens must not be undefined or null");
    }
    const keys = issued.map((t) => JSON.stringify(t));
    if (new Set(keys).size !== keys.length) {
      throw new TypeError("page tokens must be unique");
    }
  }

  return responses;
};
