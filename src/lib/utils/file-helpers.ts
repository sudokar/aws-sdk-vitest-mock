import { readFileSync } from "node:fs";
import path from "node:path";

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
};

const createErrorWithCause = (message: string, cause: unknown): Error => {
  const error = new Error(message);
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
};

export const loadFixture = (filePath: string): unknown => {
  if (!filePath || typeof filePath !== "string") {
    throw new TypeError("filePath must be a non-empty string");
  }
  const resolvedPath = path.resolve(filePath);
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Dynamic file loading is core functionality for fixture loading
    const content = readFileSync(resolvedPath, "utf8");

    if (filePath.endsWith(".json")) {
      try {
        return JSON.parse(content);
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        throw createErrorWithCause(
          `Failed to parse JSON fixture at ${resolvedPath}: ${message}`,
          error,
        );
      }
    }

    return content;
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    throw createErrorWithCause(
      `Failed to load fixture at ${resolvedPath}: ${message}`,
      error,
    );
  }
};
