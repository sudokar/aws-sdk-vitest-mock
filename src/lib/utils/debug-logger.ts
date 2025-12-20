import { colors } from "./colors.js";

export interface DebugLogger {
  enabled: boolean;
  log: (message: string, data?: unknown) => void;
}

/**
 * Format objects with full depth for debugging.
 * Works in both Node.js and browser environments.
 */
const formatData = (data: unknown): string => {
  try {
    return JSON.stringify(data, undefined, 2);
  } catch {
    // Fallback for circular references or non-serializable objects
    if (typeof data === "object" && data !== null) {
      return "[Complex Object]" as const;
    }
    if (typeof data === "string") {
      return data;
    }
    if (typeof data === "number" || typeof data === "boolean") {
      return String(data);
    }
    return "[Non-serializable value]" as const;
  }
};

export const createDebugLogger = (): DebugLogger => ({
  enabled: false,
  log(this: DebugLogger, message: string, data?: unknown): void {
    if (!this.enabled) return;

    const prefix = colors.magenta("aws-sdk-vitest-mock(debug):");

    if (data === undefined) {
      console.log(`${prefix} ${message}`);
    } else {
      // Format data with full depth to avoid [Object] truncation
      const formatted = formatData(data);
      console.log(`${prefix} ${message}\n${formatted}`);
    }
  },
});

export const enableDebug = (logger: DebugLogger): void => {
  logger.enabled = true;
};

export const disableDebug = (logger: DebugLogger): void => {
  logger.enabled = false;
};
