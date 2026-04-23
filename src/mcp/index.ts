/**
 * @module mcp
 * @description Public API for co-assistant's MCP (Model Context Protocol) subsystem.
 *
 * Re-exports every type, schema, and helper that external modules need to
 * interact with MCP server configuration.
 */

export type {
  McpLocalServerConfig,
  McpHttpServerConfig,
  McpServerConfig,
  McpConfig,
  SdkMcpLocalEntry,
  SdkMcpHttpEntry,
  SdkMcpEntry,
  SdkMcpServers,
} from "./types.js";

export {
  McpLocalServerConfigSchema,
  McpHttpServerConfigSchema,
  McpServerConfigSchema,
  McpConfigSchema,
  toSdkMcpServers,
} from "./types.js";
