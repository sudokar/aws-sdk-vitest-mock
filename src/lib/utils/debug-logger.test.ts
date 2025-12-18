import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createDebugLogger,
  enableDebug,
  disableDebug,
} from "./debug-logger.js";
import type { DebugLogger } from "./debug-logger.js";

describe("debug-logger", () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => void 0);
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    consoleSpy.mockRestore();
  });

  test("should create logger with debug disabled by default", () => {
    const logger: DebugLogger = createDebugLogger();

    expect(logger.enabled).toBe(false);
  });

  test("should not log when disabled", () => {
    const logger: DebugLogger = createDebugLogger();

    logger.log("test message");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  test("should log when enabled", () => {
    const logger: DebugLogger = createDebugLogger();

    enableDebug(logger);

    logger.log("test message");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const call = consoleSpy.mock.calls[0]?.[0] as string;
    expect(call).toContain("aws-sdk-vitest-mock(debug):");
    expect(call).toContain("test message");
  });

  test("should log with data when provided", () => {
    const logger: DebugLogger = createDebugLogger();

    enableDebug(logger);
    const data = { key: "value" };

    logger.log("test message", data);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const loggedMessage = (consoleSpy.mock.calls[0]?.[0] ?? "") as string;
    expect(loggedMessage).toContain("aws-sdk-vitest-mock(debug):");
    expect(loggedMessage).toContain("test message");
    expect(loggedMessage).toContain('"key"');
    expect(loggedMessage).toContain('"value"');
  });

  test("should disable logging", () => {
    const logger: DebugLogger = createDebugLogger();

    enableDebug(logger);

    disableDebug(logger);

    logger.log("test message");
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
