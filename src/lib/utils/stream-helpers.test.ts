import { Readable } from "node:stream";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createStream } from "./stream-helpers.js";

describe("stream-helpers", () => {
  let originalProcess: typeof process;

  beforeEach(() => {
    originalProcess = globalThis.process;
  });

  afterEach(() => {
    globalThis.process = originalProcess;
  });

  describe("createStream", () => {
    it("should create Node.js Readable stream for string input", () => {
      const stream = createStream("test data");
      expect(stream).toBeInstanceOf(Readable);
    });

    it("should create Node.js Readable stream for Buffer input", () => {
      const buffer = Buffer.from("test data");
      const stream = createStream(buffer);
      expect(stream).toBeInstanceOf(Readable);
    });

    it("should create Node.js Readable stream for Uint8Array input", () => {
      const uint8Array = new Uint8Array([116, 101, 115, 116]);
      const stream = createStream(uint8Array);
      expect(stream).toBeInstanceOf(Readable);
    });

    it("should create ReadableStream for browser environment", () => {
      // Mock browser environment
      globalThis.process = undefined as unknown as typeof process;

      const stream = createStream("test data");
      expect(stream).toBeInstanceOf(ReadableStream);
    });

    it("should create ReadableStream for browser with Buffer input", () => {
      // Mock browser environment
      globalThis.process = undefined as unknown as typeof process;

      const buffer = Buffer.from("test data");
      const stream = createStream(buffer);
      expect(stream).toBeInstanceOf(ReadableStream);
    });

    it("should create ReadableStream for browser with Uint8Array input", () => {
      // Mock browser environment
      globalThis.process = undefined as unknown as typeof process;

      const uint8Array = new Uint8Array([116, 101, 115, 116]);
      const stream = createStream(uint8Array);
      expect(stream).toBeInstanceOf(ReadableStream);
    });

    it("should detect Bun environment correctly", () => {
      // Mock Bun environment
      globalThis.process = {
        versions: { bun: "1.0.0" },
      } as unknown as typeof process;

      const stream = createStream("test data");
      expect(stream).toBeInstanceOf(Readable);
    });

    it("should read data from web stream correctly", async () => {
      // Mock browser environment
      globalThis.process = undefined as unknown as typeof process;

      const testData = "test data";
      const stream = createStream(testData) as ReadableStream<Uint8Array>;

      const reader = stream.getReader();
      const { value, done } = await reader.read();

      expect(done).toBe(false);
      expect(new TextDecoder().decode(value)).toBe(testData);

      const { done: secondDone } = await reader.read();
      expect(secondDone).toBe(true);
    });
  });
});
