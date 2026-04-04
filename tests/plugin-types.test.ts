/**
 * Tests for plugins/types — Zod manifest schema validation.
 */

import { describe, it, expect } from "vitest";
import { PluginManifestSchema, CredentialRequirementSchema } from "../src/plugins/types.js";

// ---------------------------------------------------------------------------
// CredentialRequirementSchema
// ---------------------------------------------------------------------------

describe("CredentialRequirementSchema", () => {
  it("parses a valid credential with defaults", () => {
    const result = CredentialRequirementSchema.parse({
      key: "API_KEY",
      description: "The API key",
    });
    expect(result.key).toBe("API_KEY");
    expect(result.type).toBe("text"); // default
  });

  it("accepts explicit type values", () => {
    for (const type of ["text", "oauth", "apikey"]) {
      const result = CredentialRequirementSchema.parse({
        key: "K",
        description: "D",
        type,
      });
      expect(result.type).toBe(type);
    }
  });

  it("rejects invalid type values", () => {
    const result = CredentialRequirementSchema.safeParse({
      key: "K",
      description: "D",
      type: "invalid",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PluginManifestSchema
// ---------------------------------------------------------------------------

describe("PluginManifestSchema", () => {
  const validManifest = {
    id: "my-plugin",
    name: "My Plugin",
    version: "1.0.0",
    description: "A test plugin",
  };

  it("parses a minimal valid manifest", () => {
    const result = PluginManifestSchema.parse(validManifest);
    expect(result.id).toBe("my-plugin");
    expect(result.requiredCredentials).toEqual([]);
    expect(result.dependencies).toEqual([]);
  });

  it("parses a full manifest with credentials and deps", () => {
    const result = PluginManifestSchema.parse({
      ...validManifest,
      author: "Test Author",
      requiredCredentials: [
        { key: "TOKEN", description: "API token", type: "apikey" },
      ],
      dependencies: ["core-auth"],
    });
    expect(result.author).toBe("Test Author");
    expect(result.requiredCredentials).toHaveLength(1);
    expect(result.dependencies).toEqual(["core-auth"]);
  });

  // ID validation
  describe("id field", () => {
    it("accepts kebab-case ids", () => {
      expect(
        PluginManifestSchema.safeParse({ ...validManifest, id: "gmail" }).success,
      ).toBe(true);
      expect(
        PluginManifestSchema.safeParse({ ...validManifest, id: "google-calendar" }).success,
      ).toBe(true);
      expect(
        PluginManifestSchema.safeParse({ ...validManifest, id: "a1-b2" }).success,
      ).toBe(true);
    });

    it("rejects non-kebab-case ids", () => {
      expect(
        PluginManifestSchema.safeParse({ ...validManifest, id: "MyPlugin" }).success,
      ).toBe(false);
      expect(
        PluginManifestSchema.safeParse({ ...validManifest, id: "my_plugin" }).success,
      ).toBe(false);
      expect(
        PluginManifestSchema.safeParse({ ...validManifest, id: "my plugin" }).success,
      ).toBe(false);
    });
  });

  // Version validation
  describe("version field", () => {
    it("accepts semver strings", () => {
      expect(
        PluginManifestSchema.safeParse({ ...validManifest, version: "0.1.0" }).success,
      ).toBe(true);
      expect(
        PluginManifestSchema.safeParse({ ...validManifest, version: "12.34.56" }).success,
      ).toBe(true);
    });

    it("rejects non-semver strings", () => {
      expect(
        PluginManifestSchema.safeParse({ ...validManifest, version: "1.0" }).success,
      ).toBe(false);
      expect(
        PluginManifestSchema.safeParse({ ...validManifest, version: "v1.0.0" }).success,
      ).toBe(false);
      expect(
        PluginManifestSchema.safeParse({ ...validManifest, version: "latest" }).success,
      ).toBe(false);
    });
  });

  // Required fields
  describe("required fields", () => {
    it("rejects missing id", () => {
      const { id, ...rest } = validManifest;
      expect(PluginManifestSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects missing name", () => {
      const { name, ...rest } = validManifest;
      expect(PluginManifestSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects empty name", () => {
      expect(
        PluginManifestSchema.safeParse({ ...validManifest, name: "" }).success,
      ).toBe(false);
    });

    it("rejects missing version", () => {
      const { version, ...rest } = validManifest;
      expect(PluginManifestSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects missing description", () => {
      const { description, ...rest } = validManifest;
      expect(PluginManifestSchema.safeParse(rest).success).toBe(false);
    });
  });
});
