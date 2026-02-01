import { readFileSync } from "node:fs";
import path from "node:path";

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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to parse JSON fixture at ${resolvedPath}: ${message}`,
        );
      }
    }

    return content;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load fixture at ${resolvedPath}: ${message}`);
  }
};
