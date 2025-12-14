export interface DebugLogger {
  enabled: boolean;
  log: (message: string, data?: unknown) => void;
}

export function createDebugLogger(): DebugLogger {
  return {
    enabled: false,
    log(this: DebugLogger, message: string, data?: unknown) {
      if (this.enabled) {
        if (data === undefined) {
          console.log(`[AWS Mock Debug] ${message}`);
        } else {
          console.log(`[AWS Mock Debug] ${message}`, data);
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
