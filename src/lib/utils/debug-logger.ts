import { colors } from "./colors.js";

export interface DebugLogger {
  enabled: boolean;
  log: (message: string, data?: unknown) => void;
}

/**
 * Format objects with full depth for debugging.
 * Works in both Node.js and browser environments.
 */
function formatData(data: unknown): string {
  try {
    return JSON.stringify(data, undefined, 2);
  } catch {
    // Fallback for circular references or non-serializable objects
    if (typeof data === "object" && data !== null) {
      return "[Complex Object]";
    }
    if (typeof data === "string") {
      return data;
    }
    if (typeof data === "number" || typeof data === "boolean") {
      return String(data);
    }
    return "[Non-serializable value]";
  }
}

export function createDebugLogger(): DebugLogger {
  return {
    enabled: false,
    log(this: DebugLogger, message: string, data?: unknown) {
      if (this.enabled) {
        if (data === undefined) {
          console.log(
            `${colors.magenta("aws-sdk-vitest-mock(debug):")} ${message}`,
          );
        } else {
          // Format data with full depth to avoid [Object] truncation
          const formatted = formatData(data);
          console.log(
            `${colors.magenta("aws-sdk-vitest-mock(debug):")} ${message}\n${formatted}`,
          );
        }
      }
    },
  };
}

export function enableDebug(logger: DebugLogger): void {
  logger.enabled = true;
}

export function disableDebug(logger: DebugLogger): void {
  logger.enabled = false;
}
