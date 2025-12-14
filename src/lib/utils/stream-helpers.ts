import { Readable } from "node:stream";

export type StreamInput = string | Buffer | Uint8Array;

/**
 * Detects the runtime environment
 */
function detectEnvironment(): "node" | "browser" | "bun" {
  if (typeof process !== "undefined" && process.versions?.node) {
    return "node";
  }
  if (typeof process !== "undefined" && process.versions?.bun) {
    return "bun";
  }
  return "browser";
}

/**
 * Creates a Node.js Readable stream from input data
 */
function createNodeStream(data: StreamInput): Readable {
  const buffer =
    typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);

  return new Readable({
    read() {
      this.push(buffer);
      this.push(undefined);
    },
  });
}

/**
 * Creates a Web ReadableStream from input data
 */
function createWebStream(data: StreamInput): ReadableStream<Uint8Array> {
  let buffer: Uint8Array;

  if (typeof data === "string") {
    buffer = new TextEncoder().encode(data);
  } else if (data instanceof Buffer) {
    buffer = new Uint8Array(data);
  } else {
    buffer = data;
  }

  return new ReadableStream({
    start(controller) {
      controller.enqueue(buffer);
      controller.close();
    },
  });
}

/**
 * Creates an appropriate stream for the current environment
 */
export function createStream(
  data: StreamInput,
): Readable | ReadableStream<Uint8Array> {
  const env = detectEnvironment();

  if (env === "node" || env === "bun") {
    return createNodeStream(data);
  }

  return createWebStream(data);
}
