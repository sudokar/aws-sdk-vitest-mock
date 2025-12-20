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
    expect(logger.explicitlySet).toBe(false);
  });

  test("should create logger with initial enabled state", () => {
    const logger: DebugLogger = createDebugLogger(true);

    expect(logger.enabled).toBe(true);
    expect(logger.explicitlySet).toBe(false);
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

  test("should set explicitlySet flag when enabling debug", () => {
    const logger: DebugLogger = createDebugLogger();

    expect(logger.explicitlySet).toBe(false);

    enableDebug(logger);

    expect(logger.enabled).toBe(true);
    expect(logger.explicitlySet).toBe(true);
  });

  test("should set explicitlySet flag when disabling debug", () => {
    const logger: DebugLogger = createDebugLogger(true);

    expect(logger.explicitlySet).toBe(false);

    disableDebug(logger);

    expect(logger.enabled).toBe(false);
    expect(logger.explicitlySet).toBe(true);
  });

  test("should keep explicitlySet flag after multiple enable/disable calls", () => {
    const logger: DebugLogger = createDebugLogger();

    enableDebug(logger);
    expect(logger.explicitlySet).toBe(true);

    disableDebug(logger);
    expect(logger.explicitlySet).toBe(true);

    enableDebug(logger);
    expect(logger.explicitlySet).toBe(true);
  });

  describe("logDirect", () => {
    test("should log directly without checking enabled flag", () => {
      const logger: DebugLogger = createDebugLogger();

      expect(logger.enabled).toBe(false);

      logger.logDirect("test message");

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const call = consoleSpy.mock.calls[0]?.[0] as string;
      expect(call).toContain("aws-sdk-vitest-mock(debug):");
      expect(call).toContain("test message");
    });

    test("should log directly with data", () => {
      const logger: DebugLogger = createDebugLogger();
      const data = { key: "value" };

      logger.logDirect("test message", data);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const loggedMessage = (consoleSpy.mock.calls[0]?.[0] ?? "") as string;
      expect(loggedMessage).toContain("aws-sdk-vitest-mock(debug):");
      expect(loggedMessage).toContain("test message");
      expect(loggedMessage).toContain('"key"');
      expect(loggedMessage).toContain('"value"');
    });

    test("should log directly even when debug is disabled", () => {
      const logger: DebugLogger = createDebugLogger();
      disableDebug(logger);

      expect(logger.enabled).toBe(false);

      logger.logDirect("direct message");

      expect(consoleSpy).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const call = consoleSpy.mock.calls[0]?.[0] as string;
      expect(call).toContain("direct message");
    });

    test("should log directly even when debug is enabled", () => {
      const logger: DebugLogger = createDebugLogger();
      enableDebug(logger);

      logger.logDirect("direct message");

      expect(consoleSpy).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const call = consoleSpy.mock.calls[0]?.[0] as string;
      expect(call).toContain("direct message");
    });
  });
});
