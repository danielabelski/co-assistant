/**
 * Tests for core/errors — custom error classes and formatting utilities.
 */

import { describe, it, expect } from "vitest";
import {
  CoAssistantError,
  ConfigError,
  PluginError,
  AIError,
  BotError,
  isCoAssistantError,
  formatError,
} from "../src/core/errors.js";

// ---------------------------------------------------------------------------
// CoAssistantError (base)
// ---------------------------------------------------------------------------

describe("CoAssistantError", () => {
  it("stores code and message", () => {
    const err = new CoAssistantError("boom", "TEST_CODE");
    expect(err.message).toBe("boom");
    expect(err.code).toBe("TEST_CODE");
    expect(err.name).toBe("CoAssistantError");
    expect(err).toBeInstanceOf(Error);
  });

  it("stores optional context", () => {
    const ctx = { key: "value", num: 42 };
    const err = new CoAssistantError("ctx test", "CTX", ctx);
    expect(err.context).toEqual(ctx);
  });

  it("context is undefined when not provided", () => {
    const err = new CoAssistantError("no ctx", "NO_CTX");
    expect(err.context).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ConfigError
// ---------------------------------------------------------------------------

describe("ConfigError", () => {
  it("is a CoAssistantError", () => {
    const err = ConfigError.missingEnvVar("FOO");
    expect(err).toBeInstanceOf(CoAssistantError);
    expect(err).toBeInstanceOf(ConfigError);
  });

  it("missingEnvVar — sets code and context", () => {
    const err = ConfigError.missingEnvVar("GITHUB_TOKEN");
    expect(err.code).toBe("CONFIG_MISSING_ENV");
    expect(err.context?.varName).toBe("GITHUB_TOKEN");
    expect(err.message).toContain("GITHUB_TOKEN");
  });

  it("invalidValue — sets code and context", () => {
    const err = ConfigError.invalidValue("LOG_LEVEL", "must be debug|info|warn|error");
    expect(err.code).toBe("CONFIG_INVALID_VALUE");
    expect(err.context?.key).toBe("LOG_LEVEL");
    expect(err.context?.reason).toContain("must be");
  });

  it("fileNotFound — sets code and context", () => {
    const err = ConfigError.fileNotFound("/etc/missing.json");
    expect(err.code).toBe("CONFIG_FILE_NOT_FOUND");
    expect(err.context?.path).toBe("/etc/missing.json");
  });
});

// ---------------------------------------------------------------------------
// PluginError
// ---------------------------------------------------------------------------

describe("PluginError", () => {
  it("carries pluginId", () => {
    const err = PluginError.initFailed("gmail", "timeout");
    expect(err.pluginId).toBe("gmail");
    expect(err.code).toBe("PLUGIN_INIT_FAILED");
    expect(err.context?.pluginId).toBe("gmail");
    expect(err.context?.reason).toBe("timeout");
  });

  it("toolFailed — includes tool name", () => {
    const err = PluginError.toolFailed("gmail", "send_email", "network error");
    expect(err.code).toBe("PLUGIN_TOOL_FAILED");
    expect(err.context?.toolName).toBe("send_email");
  });

  it("credentialsMissing — lists keys", () => {
    const err = PluginError.credentialsMissing("gcal", ["CLIENT_ID", "CLIENT_SECRET"]);
    expect(err.code).toBe("PLUGIN_CREDENTIALS_MISSING");
    expect(err.context?.keys).toEqual(["CLIENT_ID", "CLIENT_SECRET"]);
  });

  it("healthCheckFailed — sets code", () => {
    const err = PluginError.healthCheckFailed("weather", "API down");
    expect(err.code).toBe("PLUGIN_HEALTH_CHECK_FAILED");
  });

  it("disabled — sets code", () => {
    const err = PluginError.disabled("weather", "too many failures");
    expect(err.code).toBe("PLUGIN_DISABLED");
  });
});

// ---------------------------------------------------------------------------
// AIError
// ---------------------------------------------------------------------------

describe("AIError", () => {
  it("clientStartFailed", () => {
    const err = AIError.clientStartFailed("no token");
    expect(err.code).toBe("AI_CLIENT_START_FAILED");
    expect(err).toBeInstanceOf(CoAssistantError);
  });

  it("sessionCreateFailed", () => {
    const err = AIError.sessionCreateFailed("rate limited");
    expect(err.code).toBe("AI_SESSION_CREATE_FAILED");
  });

  it("modelNotFound", () => {
    const err = AIError.modelNotFound("gpt-99");
    expect(err.code).toBe("AI_MODEL_NOT_FOUND");
    expect(err.context?.model).toBe("gpt-99");
  });

  it("sendFailed", () => {
    const err = AIError.sendFailed("timeout");
    expect(err.code).toBe("AI_SEND_FAILED");
  });
});

// ---------------------------------------------------------------------------
// BotError
// ---------------------------------------------------------------------------

describe("BotError", () => {
  it("unauthorized — stores userId", () => {
    const err = BotError.unauthorized(12345);
    expect(err.code).toBe("BOT_UNAUTHORIZED");
    expect(err.context?.userId).toBe(12345);
  });

  it("sendFailed", () => {
    const err = BotError.sendFailed("network");
    expect(err.code).toBe("BOT_SEND_FAILED");
  });

  it("commandFailed — stores command", () => {
    const err = BotError.commandFailed("help", "handler threw");
    expect(err.code).toBe("BOT_COMMAND_FAILED");
    expect(err.context?.command).toBe("help");
  });
});

// ---------------------------------------------------------------------------
// isCoAssistantError
// ---------------------------------------------------------------------------

describe("isCoAssistantError", () => {
  it("returns true for CoAssistantError subclasses", () => {
    expect(isCoAssistantError(ConfigError.missingEnvVar("X"))).toBe(true);
    expect(isCoAssistantError(PluginError.initFailed("p", "r"))).toBe(true);
    expect(isCoAssistantError(AIError.sendFailed("r"))).toBe(true);
    expect(isCoAssistantError(BotError.sendFailed("r"))).toBe(true);
  });

  it("returns false for plain errors and non-errors", () => {
    expect(isCoAssistantError(new Error("plain"))).toBe(false);
    expect(isCoAssistantError("string")).toBe(false);
    expect(isCoAssistantError(null)).toBe(false);
    expect(isCoAssistantError(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatError
// ---------------------------------------------------------------------------

describe("formatError", () => {
  it("formats CoAssistantError with code and context", () => {
    const err = ConfigError.missingEnvVar("TOKEN");
    const formatted = formatError(err);
    expect(formatted).toContain("[CONFIG_MISSING_ENV]");
    expect(formatted).toContain("TOKEN");
    expect(formatted).toContain("context:");
  });

  it("formats plain Error with message only", () => {
    expect(formatError(new Error("plain"))).toBe("plain");
  });

  it("formats non-Error values via String()", () => {
    expect(formatError("oops")).toBe("oops");
    expect(formatError(42)).toBe("42");
    expect(formatError(null)).toBe("null");
  });
});
