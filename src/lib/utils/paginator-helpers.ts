export interface PaginatorOptions {
  pageSize?: number;
  tokenKey?: string;
  itemsKey?: string;
}

export interface PaginatedResponse<T = unknown> {
  [key: string]: unknown;
  NextToken?: string;
  ContinuationToken?: string;
  Items?: T[];
  Contents?: T[];
}

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
      // eslint-disable-next-line security/detect-object-injection -- Dynamic token key assignment required for AWS pagination simulation
      responseRecord[tokenKey] = `token-${index + pageSize}`;
    }

    responses.push(response);
  }

  return responses;
}
