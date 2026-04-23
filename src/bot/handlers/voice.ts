/**
 * @module bot/handlers/voice
 * @description Voice message handler — transcribes OGG voice notes via
 * whisper.cpp and feeds the resulting text into the message handler pipeline.
 *
 * Pipeline:
 *  1. Reject messages that exceed the configured max duration.
 *  2. Download the OGG file from Telegram.
 *  3. Convert OGG → 16 kHz mono WAV with FFmpeg.
 *  4. Transcribe the WAV with whisper.cpp.
 *  5. Normalize the transcript and relay it to the message handler.
 *  6. Always clean up temp files in the finally block.
 */

import type { Context } from "telegraf";
import { randomUUID } from "node:crypto";
import { execFile as _execFile } from "node:child_process";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createChildLogger } from "../../core/logger.js";

const logger = createChildLogger("bot:voice");
const execFile = promisify(_execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Dependencies injected into the voice handler factory. */
export interface VoiceHandlerDeps {
  /** Downstream handler that processes transcribed text like a typed message. */
  messageHandler: (ctx: Context, text: string) => Promise<void>;
  /** Absolute path to the whisper.cpp CLI binary. */
  whisperBinaryPath: string;
  /** Absolute path to the whisper.cpp GGML model file. */
  whisperModelPath: string;
  /** Maximum allowed voice message duration in seconds. */
  maxDurationSeconds: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Ensure the temp directory used for voice processing exists.
 *
 * Files are written inside `<cwd>/.voice-temp/` so they stay local to the
 * project and are easy to inspect or clean up manually if needed.
 */
async function ensureTempDir(): Promise<string> {
  const dir = path.join(process.cwd(), ".voice-temp");
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Silently attempt to remove a file, ignoring any errors. */
async function tryUnlink(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // Intentionally ignored — best-effort cleanup
  }
}

/**
 * Parse whisper.cpp stdout into a single transcript string.
 *
 * Whisper prints timing metadata followed by the transcription at the end.
 * We split on newlines, drop empty lines, and take the last non-empty line.
 */
function parseWhisperOutput(stdout: string): string {
  const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
  return lines.at(-1)?.trim() ?? "";
}

/**
 * Normalise a raw transcript: lower-case and strip non-word punctuation so
 * the AI receives clean, uniform input.
 */
function normalizeTranscript(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, "").trim();
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the voice message handler wired to the provided dependencies.
 *
 * @param deps - Injected dependencies ({@link VoiceHandlerDeps}).
 * @returns An async handler that accepts a Telegraf context carrying a voice
 *   message update.
 */
export function createVoiceHandler(
  deps: VoiceHandlerDeps,
): (ctx: Context) => Promise<void> {
  const { messageHandler, whisperBinaryPath, whisperModelPath, maxDurationSeconds } = deps;

  return async (ctx: Context): Promise<void> => {
    const voice = (ctx.message as any).voice as { file_id: string; duration: number };

    // 1. Duration guard
    if (voice.duration > maxDurationSeconds) {
      await ctx.reply(
        `🎙️ Voice message too long. Maximum duration is ${maxDurationSeconds} seconds.`,
      );
      return;
    }

    const id = randomUUID();
    let tempDir: string;
    let oggPath: string;
    let wavPath: string;

    try {
      tempDir = await ensureTempDir();
      oggPath = path.join(tempDir, `${id}.ogg`);
      wavPath = path.join(tempDir, `${id}.wav`);
    } catch (err) {
      logger.error({ err }, "Failed to create temp directory");
      await ctx.reply("🎙️ Sorry, I couldn't process that voice message.");
      return;
    }

    try {
      // 2. Download OGG from Telegram
      const fileLink = await ctx.telegram.getFileLink(voice.file_id);
      const response = await fetch(fileLink.href);
      if (!response.ok) {
        throw new Error(`Telegram file download failed: ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await writeFile(oggPath, buffer);
      logger.debug({ oggPath }, "Voice OGG downloaded");

      // 3. Convert OGG → WAV via FFmpeg
      try {
        await execFile(
          "ffmpeg",
          ["-y", "-i", oggPath, "-ar", "16000", "-ac", "1", wavPath],
          { timeout: 10_000 },
        );
        logger.debug({ wavPath }, "FFmpeg conversion successful");
      } catch (err) {
        logger.error({ err }, "FFmpeg conversion failed");
        await ctx.reply("🎙️ Audio conversion failed. Please try again.");
        return;
      }

      // 4. Transcribe via whisper.cpp
      let rawTranscript: string;
      try {
        const { stdout } = await execFile(
          whisperBinaryPath,
          ["-m", whisperModelPath, "-f", wavPath, "-nt", "-t", "2"],
          { timeout: 10_000 },
        );
        rawTranscript = parseWhisperOutput(stdout);
        logger.debug({ rawTranscript }, "Whisper transcription done");
      } catch (err) {
        logger.error({ err }, "Whisper transcription failed");
        await ctx.reply("🎙️ Transcription failed. Please try again.");
        return;
      }

      // 5–6. Normalise
      const normalizedText = normalizeTranscript(rawTranscript);

      // 7. Empty transcript guard
      if (!normalizedText) {
        await ctx.reply("🎙️ I couldn't make out what you said. Please try again.");
        return;
      }

      // 8. Echo transcription to the user
      await ctx.reply(`🎙️ _Transcribed:_ "${normalizedText}"`, {
        parse_mode: "Markdown",
      });

      // 9. Feed into the AI pipeline exactly like typed text
      await messageHandler(ctx, normalizedText);
    } catch (err) {
      logger.error({ err }, "Unexpected error in voice handler");
      await ctx.reply("🎙️ Sorry, I couldn't process that voice message.");
    } finally {
      // 10. Cleanup — always attempt, never throw
      await tryUnlink(oggPath!);
      await tryUnlink(wavPath!);
    }
  };
}
