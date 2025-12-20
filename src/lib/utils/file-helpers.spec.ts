import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { loadFixture } from "./file-helpers.js";

describe("file-helpers", () => {
  const testDirectory = path.join(process.cwd(), "test-fixtures");
  const jsonFile = path.join(testDirectory, "test.json");
  const textFile = path.join(testDirectory, "test.txt");

  beforeAll(() => {
    mkdirSync(testDirectory, { recursive: true });
    writeFileSync(
      jsonFile,
      JSON.stringify({ message: "test data", count: 42 }),
    );
    writeFileSync(textFile, "plain text content");
  });

  afterAll(() => {
    rmSync(testDirectory, { recursive: true, force: true });
  });

  test("should load and parse JSON files", () => {
    const result = loadFixture(jsonFile) as { message: string; count: number };
    expect(result).toEqual({ message: "test data", count: 42 });
  });

  test("should load text files as strings", () => {
    const result = loadFixture(textFile) as string;
    expect(result).toBe("plain text content");
  });

  test("should throw error for non-existent files", () => {
    expect(() => loadFixture("non-existent.json")).toThrow();
  });
});
