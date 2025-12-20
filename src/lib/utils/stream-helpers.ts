import { Readable } from "node:stream";

export type StreamInput = string | Buffer | Uint8Array;

/**
 * Detects the runtime environment
 */
const detectEnvironment = (): "node" | "browser" | "bun" => {
  if (typeof process !== "undefined" && process.versions?.node) {
    return "node" as const;
  }
  if (typeof process !== "undefined" && process.versions?.bun) {
    return "bun" as const;
  }
  return "browser" as const;
};

/**
 * Creates a Node.js Readable stream from input data
 */
const createNodeStream = (data: StreamInput): Readable => {
  const buffer =
    typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);

  let pushed = false;
  return new Readable({
    read() {
      if (!pushed) {
        this.push(buffer);
        // eslint-disable-next-line unicorn/no-null -- Node.js streams require null to signal end of stream
        this.push(null);
        pushed = true;
      }
    },
  });
};

/**
 * Creates a Web ReadableStream from input data
 */
const createWebStream = (data: StreamInput): ReadableStream<Uint8Array> => {
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
};

/**
 * Creates an appropriate stream for the current environment
 */
export const createStream = (
  data: StreamInput,
): Readable | ReadableStream<Uint8Array> => {
  const env = detectEnvironment();

  return env === "node" || env === "bun"
    ? createNodeStream(data)
    : createWebStream(data);
};
