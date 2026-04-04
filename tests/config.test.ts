/**
 * Tests for core/config — Zod schema validation and config loading.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  EnvConfigSchema,
  AppConfigSchema,
  PluginConfigSchema,
  BotConfigSchema,
  AIConfigSchema,
  PluginHealthConfigSchema,
  loadAppConfig,
} from "../src/core/config.js";

// ---------------------------------------------------------------------------
// Schema unit tests — these validate the Zod schemas in isolation
// ---------------------------------------------------------------------------

describe("EnvConfigSchema", () => {
  it("parses valid env with all fields", () => {
    const result = EnvConfigSchema.safeParse({
      TELEGRAM_BOT_TOKEN: "123:ABC",
      TELEGRAM_USER_ID: "999",
      GITHUB_TOKEN: "ghp_xxx",
      LOG_LEVEL: "debug",
      DEFAULT_MODEL: "gpt-5",
      HEARTBEAT_INTERVAL_MINUTES: "5",
      AI_SESSION_POOL_SIZE: "2",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TELEGRAM_BOT_TOKEN).toBe("123:ABC");
      expect(result.data.LOG_LEVEL).toBe("debug");
      expect(result.data.DEFAULT_MODEL).toBe("gpt-5");
    }
  });

  it("applies defaults for optional fields", () => {
    const result = EnvConfigSchema.safeParse({
      TELEGRAM_BOT_TOKEN: "tok",
      TELEGRAM_USER_ID: "1",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.LOG_LEVEL).toBe("info");
      expect(result.data.DEFAULT_MODEL).toBe("gpt-4.1");
      expect(result.data.HEARTBEAT_INTERVAL_MINUTES).toBe("0");
      expect(result.data.AI_SESSION_POOL_SIZE).toBe("3");
    }
  });

  it("rejects missing TELEGRAM_BOT_TOKEN", () => {
    const result = EnvConfigSchema.safeParse({
      TELEGRAM_USER_ID: "1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty TELEGRAM_BOT_TOKEN", () => {
    const result = EnvConfigSchema.safeParse({
      TELEGRAM_BOT_TOKEN: "",
      TELEGRAM_USER_ID: "1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid LOG_LEVEL", () => {
    const result = EnvConfigSchema.safeParse({
      TELEGRAM_BOT_TOKEN: "tok",
      TELEGRAM_USER_ID: "1",
      LOG_LEVEL: "verbose",
    });
    expect(result.success).toBe(false);
  });
});

describe("PluginConfigSchema", () => {
  it("parses valid plugin config", () => {
    const result = PluginConfigSchema.safeParse({
      enabled: true,
      credentials: { API_KEY: "secret" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing enabled field", () => {
    const result = PluginConfigSchema.safeParse({
      credentials: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("BotConfigSchema", () => {
  it("applies defaults", () => {
    const result = BotConfigSchema.parse({});
    expect(result.maxMessageLength).toBe(4096);
    expect(result.typingIndicator).toBe(true);
  });

  it("accepts overrides", () => {
    const result = BotConfigSchema.parse({
      maxMessageLength: 2000,
      typingIndicator: false,
    });
    expect(result.maxMessageLength).toBe(2000);
    expect(result.typingIndicator).toBe(false);
  });
});

describe("AIConfigSchema", () => {
  it("applies defaults", () => {
    const result = AIConfigSchema.parse({});
    expect(result.maxRetries).toBe(3);
    expect(result.sessionTimeout).toBe(3600000);
  });
});

describe("PluginHealthConfigSchema", () => {
  it("applies defaults", () => {
    const result = PluginHealthConfigSchema.parse({});
    expect(result.maxFailures).toBe(5);
    expect(result.checkInterval).toBe(60000);
  });
});

describe("AppConfigSchema", () => {
  it("parses empty object with all defaults", () => {
    const result = AppConfigSchema.parse({});
    expect(result.plugins).toEqual({});
    expect(result.bot.maxMessageLength).toBe(4096);
    expect(result.ai.maxRetries).toBe(3);
    expect(result.pluginHealth.maxFailures).toBe(5);
  });

  it("parses full config with plugins", () => {
    const result = AppConfigSchema.parse({
      plugins: {
        gmail: { enabled: true, credentials: { API_KEY: "key" } },
      },
      bot: { maxMessageLength: 2048, typingIndicator: false },
    });
    expect(result.plugins.gmail.enabled).toBe(true);
    expect(result.bot.maxMessageLength).toBe(2048);
  });
});

// ---------------------------------------------------------------------------
// loadAppConfig — file-based tests
// ---------------------------------------------------------------------------

describe("loadAppConfig", () => {
  const tmpDir = path.join(process.cwd(), "tests", ".tmp");
  const tmpConfig = path.join(tmpDir, "test-config.json");

  beforeEach(() => {
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpConfig)) unlinkSync(tmpConfig);
  });

  it("loads and validates an existing config file", () => {
    writeFileSync(
      tmpConfig,
      JSON.stringify({
        plugins: {},
        bot: { maxMessageLength: 1000, typingIndicator: true },
        ai: { maxRetries: 5, sessionTimeout: 7200000 },
        pluginHealth: { maxFailures: 10, checkInterval: 30000 },
      }),
    );

    const config = loadAppConfig(tmpConfig);
    expect(config.bot.maxMessageLength).toBe(1000);
    expect(config.ai.maxRetries).toBe(5);
    expect(config.pluginHealth.maxFailures).toBe(10);
  });

  it("creates default config when file does not exist", () => {
    const newPath = path.join(tmpDir, "auto-created-config.json");
    try {
      const config = loadAppConfig(newPath);
      expect(config.plugins).toEqual({});
      expect(config.bot.maxMessageLength).toBe(4096);
      expect(existsSync(newPath)).toBe(true);
    } finally {
      if (existsSync(newPath)) unlinkSync(newPath);
    }
  });

  it("throws on invalid JSON in config file", () => {
    writeFileSync(tmpConfig, "{ not valid json }}}");
    expect(() => loadAppConfig(tmpConfig)).toThrow();
  });
});
