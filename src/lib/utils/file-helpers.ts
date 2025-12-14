import { readFileSync } from "node:fs";
import path from "node:path";

export function loadFixture(filePath: string): unknown {
  const resolvedPath = path.resolve(filePath);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- Dynamic file loading is core functionality for fixture loading
  const content = readFileSync(resolvedPath, "utf8");

  if (filePath.endsWith(".json")) {
    return JSON.parse(content);
  }

  return content;
}
