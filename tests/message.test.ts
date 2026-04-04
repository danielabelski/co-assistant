/**
 * Tests for bot/handlers/message — splitMessage and safeSendMarkdown helpers.
 */

import { describe, it, expect, vi } from "vitest";
import { splitMessage, safeSendMarkdown } from "../src/bot/handlers/message.js";

// ---------------------------------------------------------------------------
// splitMessage
// ---------------------------------------------------------------------------

describe("splitMessage", () => {
  it("returns the message as-is when under the limit", () => {
    const text = "Hello, world!";
    expect(splitMessage(text, 4096)).toEqual([text]);
  });

  it("returns the message as-is when exactly at the limit", () => {
    const text = "a".repeat(4096);
    expect(splitMessage(text, 4096)).toEqual([text]);
  });

  it("splits on paragraph boundaries", () => {
    const para1 = "a".repeat(50);
    const para2 = "b".repeat(50);
    const text = `${para1}\n\n${para2}`;
    const chunks = splitMessage(text, 60);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(para1);
    expect(chunks[1]).toBe(para2);
  });

  it("splits on newline when no paragraph boundary fits", () => {
    const line1 = "a".repeat(50);
    const line2 = "b".repeat(50);
    const text = `${line1}\n${line2}`;
    const chunks = splitMessage(text, 60);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(line1);
    expect(chunks[1]).toBe(line2);
  });

  it("hard splits when no newline fits", () => {
    const text = "a".repeat(100);
    const chunks = splitMessage(text, 40);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    // All chunks should be at most 40 chars
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(40);
    }
    // Concatenated result should equal original
    expect(chunks.join("")).toBe(text);
  });

  it("filters out empty chunks", () => {
    const text = "Hello\n\n\n\nWorld";
    const chunks = splitMessage(text, 10);
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
    }
  });

  it("handles a single very long paragraph", () => {
    const text = "a".repeat(10000);
    const chunks = splitMessage(text, 4096);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks.join("")).toBe(text);
  });
});

// ---------------------------------------------------------------------------
// safeSendMarkdown
// ---------------------------------------------------------------------------

describe("safeSendMarkdown", () => {
  it("sends with Markdown parse_mode on success", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    await safeSendMarkdown(sendFn, "**bold** text");

    expect(sendFn).toHaveBeenCalledOnce();
    expect(sendFn.mock.calls[0][1]).toEqual(
      expect.objectContaining({ parse_mode: "Markdown" }),
    );
  });

  it("falls back to plain text on Markdown parse error", async () => {
    const sendFn = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("400: Bad Request: can't parse entities: unmatched *"),
      )
      .mockResolvedValueOnce(undefined);

    await safeSendMarkdown(sendFn, "**broken * markdown");

    expect(sendFn).toHaveBeenCalledTimes(2);
    // Second call should be plain text without Markdown markers
    const plainText = sendFn.mock.calls[1][0];
    expect(plainText).not.toContain("*");
    expect(plainText).not.toContain("_");
    expect(plainText).not.toContain("`");
  });

  it("passes through extra options", async () => {
    const sendFn = vi.fn().mockResolvedValue(undefined);
    const extra = { reply_parameters: { message_id: 123 } };
    await safeSendMarkdown(sendFn, "hello", extra);

    expect(sendFn.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        parse_mode: "Markdown",
        reply_parameters: { message_id: 123 },
      }),
    );
  });

  it("re-throws non-parse errors", async () => {
    const sendFn = vi.fn().mockRejectedValue(new Error("network timeout"));

    await expect(safeSendMarkdown(sendFn, "text")).rejects.toThrow("network timeout");
  });

  it("strips markdown chars in fallback", async () => {
    const sendFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("can't parse entities: bad markdown"))
      .mockResolvedValueOnce(undefined);

    await safeSendMarkdown(sendFn, "**bold** _italic_ `code`");

    const fallback = sendFn.mock.calls[1][0];
    expect(fallback).toBe("bold italic code");
  });
});
