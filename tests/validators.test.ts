/**
 * Tests for utils/validators — input validation utilities.
 */

import { describe, it, expect } from "vitest";
import {
  isNonEmptyString,
  isValidTelegramUserId,
  KebabCaseIdSchema,
} from "../src/utils/validators.js";

// ---------------------------------------------------------------------------
// isNonEmptyString
// ---------------------------------------------------------------------------

describe("isNonEmptyString", () => {
  it("returns true for non-empty strings", () => {
    expect(isNonEmptyString("hello")).toBe(true);
    expect(isNonEmptyString("a")).toBe(true);
    expect(isNonEmptyString("  text  ")).toBe(true);
  });

  it("returns false for empty or whitespace-only strings", () => {
    expect(isNonEmptyString("")).toBe(false);
    expect(isNonEmptyString("   ")).toBe(false);
    expect(isNonEmptyString("\t\n")).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect(isNonEmptyString(null)).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
    expect(isNonEmptyString(42)).toBe(false);
    expect(isNonEmptyString({})).toBe(false);
    expect(isNonEmptyString([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidTelegramUserId
// ---------------------------------------------------------------------------

describe("isValidTelegramUserId", () => {
  it("returns true for positive integers", () => {
    expect(isValidTelegramUserId(12345)).toBe(true);
    expect(isValidTelegramUserId(1)).toBe(true);
    expect(isValidTelegramUserId(685255178)).toBe(true);
  });

  it("returns true for positive integer strings", () => {
    expect(isValidTelegramUserId("12345")).toBe(true);
    expect(isValidTelegramUserId("1")).toBe(true);
  });

  it("returns false for zero or negative numbers", () => {
    expect(isValidTelegramUserId(0)).toBe(false);
    expect(isValidTelegramUserId(-1)).toBe(false);
    expect(isValidTelegramUserId("-5")).toBe(false);
  });

  it("returns false for non-integer values", () => {
    expect(isValidTelegramUserId(1.5)).toBe(false);
    expect(isValidTelegramUserId("abc")).toBe(false);
    expect(isValidTelegramUserId("")).toBe(false);
    expect(isValidTelegramUserId(NaN)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// KebabCaseIdSchema
// ---------------------------------------------------------------------------

describe("KebabCaseIdSchema", () => {
  it("accepts valid kebab-case identifiers", () => {
    expect(KebabCaseIdSchema.safeParse("gmail").success).toBe(true);
    expect(KebabCaseIdSchema.safeParse("google-calendar").success).toBe(true);
    expect(KebabCaseIdSchema.safeParse("my-awesome-plugin").success).toBe(true);
    expect(KebabCaseIdSchema.safeParse("a1-b2-c3").success).toBe(true);
    expect(KebabCaseIdSchema.safeParse("x").success).toBe(true);
  });

  it("rejects non-kebab-case identifiers", () => {
    expect(KebabCaseIdSchema.safeParse("").success).toBe(false);
    expect(KebabCaseIdSchema.safeParse("CamelCase").success).toBe(false);
    expect(KebabCaseIdSchema.safeParse("snake_case").success).toBe(false);
    expect(KebabCaseIdSchema.safeParse("with spaces").success).toBe(false);
    expect(KebabCaseIdSchema.safeParse("-leading-dash").success).toBe(false);
    expect(KebabCaseIdSchema.safeParse("trailing-dash-").success).toBe(false);
    expect(KebabCaseIdSchema.safeParse("double--dash").success).toBe(false);
  });
});
