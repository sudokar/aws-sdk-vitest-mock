import { readFileSync } from "node:fs";
import path from "node:path";

export const loadFixture = (filePath: string): unknown => {
  const resolvedPath = path.resolve(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Dynamic file loading is core functionality for fixture loading
  const content = readFileSync(resolvedPath, "utf8");

  return filePath.endsWith(".json") ? JSON.parse(content) : content;
};
