// ANSI color codes for terminal output
export const colors = {
  red: (text: string): string => `\u001B[31m${text}\u001B[39m`,
  green: (text: string): string => `\u001B[32m${text}\u001B[39m`,
  yellow: (text: string): string => `\u001B[33m${text}\u001B[39m`,
  blue: (text: string): string => `\u001B[34m${text}\u001B[39m`,
  magenta: (text: string): string => `\u001B[35m${text}\u001B[39m`,
  cyan: (text: string): string => `\u001B[36m${text}\u001B[39m`,
  gray: (text: string): string => `\u001B[90m${text}\u001B[39m`,
  bold: (text: string): string => `\u001B[1m${text}\u001B[22m`,
} as const;
