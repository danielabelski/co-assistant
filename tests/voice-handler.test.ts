/**
 * Tests for bot/handlers/voice — voice message transcription pipeline.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { execFile } from "node:child_process";
import { createVoiceHandler } from "../src/bot/handlers/voice.js";
import type { VoiceHandlerDeps } from "../src/bot/handlers/voice.js";

// ---------------------------------------------------------------------------
// Module mocks (hoisted by vitest before imports)
// ---------------------------------------------------------------------------

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/core/logger.js", () => ({
  createChildLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockExecFile = execFile as ReturnType<typeof vi.fn>;

/** Makes execFile call its callback with success stdout.
 *
 * We pass a single `{ stdout, stderr }` object (not two separate args) so
 * that `util.promisify`'s default wrapping resolves with the object intact
 * rather than resolving with just the first string value.
 */
function execSuccess(stdout: string) {
  return (_cmd: unknown, _args: unknown, _opts: unknown, cb: Function) => {
    cb(null, { stdout, stderr: "" });
    return {} as any;
  };
}

/** Makes execFile call its callback with an error. */
function execFailure(message: string) {
  return (_cmd: unknown, _args: unknown, _opts: unknown, cb: Function) => {
    cb(new Error(message));
    return {} as any;
  };
}

/** Sets up global.fetch to return a fake successful response. */
function mockFetchOk() {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  });
}

function makeMockCtx(voiceDuration = 5) {
  return {
    message: {
      voice: { file_id: "file123", duration: voiceDuration },
      message_id: 1,
    },
    reply: vi.fn().mockResolvedValue({}),
    telegram: {
      getFileLink: vi
        .fn()
        .mockResolvedValue({ href: "https://api.telegram.org/file/test.ogg" }),
    },
  };
}

function makeDeps(overrides: Partial<VoiceHandlerDeps> = {}): VoiceHandlerDeps {
  return {
    messageHandler: vi.fn().mockResolvedValue(undefined),
    whisperBinaryPath: "/usr/local/bin/whisper",
    whisperModelPath: "/models/ggml-base.en.bin",
    maxDurationSeconds: 60,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createVoiceHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("duration guard — rejects messages longer than maxDurationSeconds", async () => {
    const deps = makeDeps({ maxDurationSeconds: 30 });
    const handler = createVoiceHandler(deps);
    const ctx = makeMockCtx(45); // 45s > 30s limit

    await handler(ctx as any);

    expect(ctx.reply).toHaveBeenCalledOnce();
    expect(ctx.reply.mock.calls[0][0]).toContain("30 seconds");
    expect(deps.messageHandler).not.toHaveBeenCalled();
  });

  it("empty transcript guard — replies with 'couldn't make out' when whisper output is whitespace", async () => {
    const deps = makeDeps();
    const handler = createVoiceHandler(deps);
    const ctx = makeMockCtx();

    mockFetchOk();
    mockExecFile
      .mockImplementationOnce(execSuccess("")) // ffmpeg
      .mockImplementationOnce(execSuccess("   ")); // whisper → blank after parse

    await handler(ctx as any);

    const replyTexts = ctx.reply.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(replyTexts.some((r) => /couldn.*t make out/i.test(r))).toBe(true);
    expect(deps.messageHandler).not.toHaveBeenCalled();
  });

  it("normalization — strips punctuation and lowercases via full handler pipeline", async () => {
    const deps = makeDeps();
    const handler = createVoiceHandler(deps);
    const ctx = makeMockCtx();

    mockFetchOk();
    mockExecFile
      .mockImplementationOnce(execSuccess("")) // ffmpeg
      .mockImplementationOnce(execSuccess("Hello, World! How are YOU?\n")); // whisper

    await handler(ctx as any);

    expect(deps.messageHandler).toHaveBeenCalledWith(
      expect.anything(),
      "hello world how are you",
    );
  });

  it("ffmpeg failure — replies with 'Audio conversion failed'", async () => {
    const deps = makeDeps();
    const handler = createVoiceHandler(deps);
    const ctx = makeMockCtx();

    mockFetchOk();
    mockExecFile.mockImplementationOnce(execFailure("ffmpeg: command not found"));

    await handler(ctx as any);

    const replyTexts = ctx.reply.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(replyTexts.some((r) => /audio conversion failed/i.test(r))).toBe(true);
    expect(deps.messageHandler).not.toHaveBeenCalled();
  });

  it("whisper failure — replies with 'Transcription failed'", async () => {
    const deps = makeDeps();
    const handler = createVoiceHandler(deps);
    const ctx = makeMockCtx();

    mockFetchOk();
    mockExecFile
      .mockImplementationOnce(execSuccess("")) // ffmpeg succeeds
      .mockImplementationOnce(execFailure("whisper: model not found")); // whisper throws

    await handler(ctx as any);

    const replyTexts = ctx.reply.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(replyTexts.some((r) => /transcription failed/i.test(r))).toBe(true);
    expect(deps.messageHandler).not.toHaveBeenCalled();
  });

  it("happy path — echoes transcription then calls messageHandler with normalized text", async () => {
    const deps = makeDeps();
    const handler = createVoiceHandler(deps);
    const ctx = makeMockCtx();

    mockFetchOk();
    mockExecFile
      .mockImplementationOnce(execSuccess("")) // ffmpeg
      .mockImplementationOnce(execSuccess("Hello, World!\n")); // whisper

    await handler(ctx as any);

    // Echo reply must include the normalized transcript
    const echoCall = ctx.reply.mock.calls.find(
      (c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("Transcribed"),
    );
    expect(echoCall).toBeDefined();
    expect(echoCall![0]).toContain("hello world");

    // messageHandler called once with normalized text
    expect(deps.messageHandler).toHaveBeenCalledOnce();
    expect(deps.messageHandler).toHaveBeenCalledWith(
      expect.anything(),
      "hello world",
    );

    // Echo reply precedes messageHandler call (reply index < messageHandler call order)
    const replyOrder = ctx.reply.mock.invocationCallOrder.find(
      (_: number, i: number) =>
        typeof ctx.reply.mock.calls[i][0] === "string" &&
        (ctx.reply.mock.calls[i][0] as string).includes("Transcribed"),
    );
    const handlerOrder = (deps.messageHandler as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    expect(replyOrder).toBeLessThan(handlerOrder);
  });
});
