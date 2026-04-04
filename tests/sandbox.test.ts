/**
 * Tests for plugins/sandbox — error isolation and health monitoring.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { PluginSandbox } from "../src/plugins/sandbox.js";

// ---------------------------------------------------------------------------
// PluginSandbox
// ---------------------------------------------------------------------------

describe("PluginSandbox", () => {
  let sandbox: PluginSandbox;

  beforeEach(() => {
    // Use a small threshold (3) for faster test cycles
    sandbox = new PluginSandbox(3);
  });

  // -----------------------------------------------------------------------
  // safeExecute
  // -----------------------------------------------------------------------

  describe("safeExecute", () => {
    it("returns the value on success", async () => {
      const result = await sandbox.safeExecute("test", "method", async () => 42);
      expect(result).toBe(42);
    });

    it("returns undefined on failure", async () => {
      const result = await sandbox.safeExecute("test", "method", async () => {
        throw new Error("boom");
      });
      expect(result).toBeUndefined();
    });

    it("resets failure count on success", async () => {
      // Trigger a failure first
      await sandbox.safeExecute("test", "method", async () => {
        throw new Error("fail");
      });
      expect(sandbox.getFailureCount("test")).toBe(1);

      // Succeed — counter should reset to 0
      await sandbox.safeExecute("test", "method", async () => "ok");
      expect(sandbox.getFailureCount("test")).toBe(0);
    });

    it("skips disabled plugins and returns undefined", async () => {
      // Exceed the threshold to auto-disable
      for (let i = 0; i < 3; i++) {
        await sandbox.safeExecute("broken", "method", async () => {
          throw new Error("fail");
        });
      }
      expect(sandbox.isDisabled("broken")).toBe(true);

      // Subsequent calls should be skipped
      let callCount = 0;
      const result = await sandbox.safeExecute("broken", "method", async () => {
        callCount++;
        return "should not run";
      });
      expect(result).toBeUndefined();
      expect(callCount).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Failure tracking & auto-disable
  // -----------------------------------------------------------------------

  describe("failure tracking", () => {
    it("increments failure count per plugin", () => {
      sandbox.recordFailure("a", new Error("err"), "method");
      sandbox.recordFailure("a", new Error("err"), "method");
      sandbox.recordFailure("b", new Error("err"), "method");

      expect(sandbox.getFailureCount("a")).toBe(2);
      expect(sandbox.getFailureCount("b")).toBe(1);
    });

    it("auto-disables plugin at threshold", () => {
      let disabled = false;
      for (let i = 0; i < 3; i++) {
        disabled = sandbox.recordFailure("flaky", new Error("err"), "method");
      }
      expect(disabled).toBe(true);
      expect(sandbox.isDisabled("flaky")).toBe(true);
    });

    it("does not disable below threshold", () => {
      sandbox.recordFailure("flaky", new Error("err"), "method");
      sandbox.recordFailure("flaky", new Error("err"), "method");
      expect(sandbox.isDisabled("flaky")).toBe(false);
    });

    it("recordSuccess resets counter", () => {
      sandbox.recordFailure("p", new Error("err"), "method");
      sandbox.recordFailure("p", new Error("err"), "method");
      sandbox.recordSuccess("p");
      expect(sandbox.getFailureCount("p")).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // wrapToolHandler
  // -----------------------------------------------------------------------

  describe("wrapToolHandler", () => {
    it("returns handler result on success", async () => {
      const handler = sandbox.wrapToolHandler("gmail", "send", async (args) => {
        return `sent to ${args.to}`;
      });
      const result = await handler({ to: "alice@example.com" });
      expect(result).toBe("sent to alice@example.com");
    });

    it("returns error string on failure", async () => {
      const handler = sandbox.wrapToolHandler("gmail", "send", async () => {
        throw new Error("API down");
      });
      const result = await handler({});
      expect(typeof result).toBe("string");
      expect(result).toContain("Error");
      expect(result).toContain("send");
    });

    it("returns disabled message after threshold exceeded", async () => {
      // Exhaust the threshold
      for (let i = 0; i < 3; i++) {
        sandbox.recordFailure("gmail", new Error("err"), "tool");
      }

      const handler = sandbox.wrapToolHandler("gmail", "send", async () => "ok");
      const result = await handler({});
      expect(result).toContain("disabled");
    });
  });

  // -----------------------------------------------------------------------
  // resetPlugin
  // -----------------------------------------------------------------------

  describe("resetPlugin", () => {
    it("re-enables a disabled plugin", async () => {
      for (let i = 0; i < 3; i++) {
        sandbox.recordFailure("p", new Error("err"), "m");
      }
      expect(sandbox.isDisabled("p")).toBe(true);

      sandbox.resetPlugin("p");
      expect(sandbox.isDisabled("p")).toBe(false);
      expect(sandbox.getFailureCount("p")).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getHealthSummary
  // -----------------------------------------------------------------------

  describe("getHealthSummary", () => {
    it("returns summary for all tracked plugins", () => {
      sandbox.recordFailure("a", new Error("err"), "m");
      sandbox.recordSuccess("b");

      const summary = sandbox.getHealthSummary();
      expect(summary.get("a")).toEqual({ failures: 1, disabled: false });
      expect(summary.get("b")).toEqual({ failures: 0, disabled: false });
    });

    it("includes disabled plugins", () => {
      for (let i = 0; i < 3; i++) {
        sandbox.recordFailure("broken", new Error("err"), "m");
      }

      const summary = sandbox.getHealthSummary();
      expect(summary.get("broken")?.disabled).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // isDisabled / getFailureCount edge cases
  // -----------------------------------------------------------------------

  describe("edge cases", () => {
    it("unknown plugin returns 0 failures and not disabled", () => {
      expect(sandbox.getFailureCount("unknown")).toBe(0);
      expect(sandbox.isDisabled("unknown")).toBe(false);
    });
  });
});
