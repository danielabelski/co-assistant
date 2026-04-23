/**
 * @module cli/commands/mcp
 * @description CLI commands for managing MCP (Model Context Protocol) server
 * configurations stored in `config.json`.
 *
 * Subcommands:
 *  - `list`           — Table of all configured servers with status and type
 *  - `add`            — Interactive wizard to add a new server
 *  - `remove <id>`    — Remove a server from config
 *  - `enable <id>`    — Enable a server
 *  - `disable <id>`   — Disable a server
 *  - `info <id>`      — Show full server config details
 */

import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  McpServerConfigSchema,
  type McpServerConfig,
} from "../../mcp/types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIG_PATH = "./config.json";

// ---------------------------------------------------------------------------
// Config read/write helpers
// ---------------------------------------------------------------------------

/**
 * Read `config.json` as a raw object.  Returns `{}` when the file is absent.
 */
function readRawConfig(): Record<string, unknown> {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as Record<string, unknown>;
  } catch (err) {
    console.error(`✗ Failed to read ${CONFIG_PATH}: ${(err as Error).message}`);
    process.exit(1);
  }
}

/**
 * Write an object back to `config.json` with pretty-printing.
 */
function writeRawConfig(config: Record<string, unknown>): void {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
  } catch (err) {
    console.error(`✗ Failed to write ${CONFIG_PATH}: ${(err as Error).message}`);
    process.exit(1);
  }
}

/**
 * Return the `mcp.servers` map from `config.json`, or an empty object.
 */
function readServers(): Record<string, unknown> {
  const config = readRawConfig();
  const mcp = config.mcp as Record<string, unknown> | undefined;
  return (mcp?.servers as Record<string, unknown>) ?? {};
}

/**
 * Persist an updated `mcp.servers` map back to `config.json`.
 */
function writeServers(servers: Record<string, unknown>): void {
  const config = readRawConfig();
  if (!config.mcp || typeof config.mcp !== "object") {
    config.mcp = {};
  }
  (config.mcp as Record<string, unknown>).servers = servers;
  writeRawConfig(config);
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

/** `mcp list` — Print all configured servers as a formatted table. */
function handleList(): void {
  const servers = readServers();
  const entries = Object.entries(servers);

  if (entries.length === 0) {
    console.log("\n🔌 No MCP servers configured.");
    console.log("   Add one with: co-assistant mcp add\n");
    return;
  }

  console.log("\n🔌 Configured MCP Servers:\n");

  for (const [id, rawSrv] of entries) {
    const result = McpServerConfigSchema.safeParse(rawSrv);
    if (!result.success) {
      console.log(`  ⚠️  ${id} — invalid config (run "mcp info ${id}" for details)`);
      continue;
    }
    const srv = result.data;
    const statusIcon = srv.enabled ? "✅ Enabled" : "❌ Disabled";
    const connection =
      srv.type === "local" || srv.type === "stdio"
        ? `stdio  command: ${srv.command} ${srv.args.join(" ")}`
        : `${srv.type.padEnd(5)}  url: ${srv.url}`;

    console.log(`  ${id} — ${srv.name}`);
    console.log(`  Status: ${statusIcon} | Type: ${srv.type} | Tools: ${srv.tools?.join(", ") ?? "*"}`);
    console.log(`  ${connection}\n`);
  }
}

/** `mcp enable <id>` — Set a server's `enabled` flag to `true`. */
function handleEnable(id: string): void {
  const servers = readServers();
  if (!Object.prototype.hasOwnProperty.call(servers, id)) {
    console.error(`✗ MCP server "${id}" not found.`);
    process.exit(1);
  }
  (servers[id] as Record<string, unknown>).enabled = true;
  writeServers(servers);
  console.log(`✅ MCP server "${id}" enabled.`);
}

/** `mcp disable <id>` — Set a server's `enabled` flag to `false`. */
function handleDisable(id: string): void {
  const servers = readServers();
  if (!Object.prototype.hasOwnProperty.call(servers, id)) {
    console.error(`✗ MCP server "${id}" not found.`);
    process.exit(1);
  }
  (servers[id] as Record<string, unknown>).enabled = false;
  writeServers(servers);
  console.log(`✅ MCP server "${id}" disabled.`);
}

/** `mcp remove <id>` — Delete a server from `config.json`. */
function handleRemove(id: string): void {
  const servers = readServers();
  if (!Object.prototype.hasOwnProperty.call(servers, id)) {
    console.error(`✗ MCP server "${id}" not found.`);
    process.exit(1);
  }
  delete servers[id];
  writeServers(servers);
  console.log(`🗑️  MCP server "${id}" removed.`);
}

/** `mcp info <id>` — Print the full config for a single server. */
function handleInfo(id: string): void {
  const servers = readServers();
  if (!Object.prototype.hasOwnProperty.call(servers, id)) {
    console.error(`✗ MCP server "${id}" not found.`);
    process.exit(1);
  }

  const result = McpServerConfigSchema.safeParse(servers[id]);

  console.log(`\n🔌 MCP Server: ${id}\n`);

  if (!result.success) {
    console.log("  ⚠️  Config is invalid:");
    for (const issue of result.error.issues) {
      console.log(`    • ${issue.path.join(".")}: ${issue.message}`);
    }
    console.log("\n  Raw config:");
    console.log(JSON.stringify(servers[id], null, 4).replace(/^/gm, "  "));
    return;
  }

  const srv = result.data;
  console.log(`  Name:    ${srv.name}`);
  console.log(`  Type:    ${srv.type}`);
  console.log(`  Enabled: ${srv.enabled ? "yes" : "no"}`);
  console.log(`  Tools:   ${srv.tools?.join(", ") ?? "*"}`);
  if (srv.timeout !== undefined) console.log(`  Timeout: ${srv.timeout}ms`);

  if (srv.type === "local" || srv.type === "stdio") {
    console.log(`  Command: ${srv.command}`);
    console.log(`  Args:    ${srv.args.join(" ") || "(none)"}`);
    if (srv.cwd) console.log(`  Cwd:     ${srv.cwd}`);
    if (srv.env && Object.keys(srv.env).length > 0) {
      console.log("  Env:");
      for (const [k, v] of Object.entries(srv.env)) {
        console.log(`    ${k} = ${v}`);
      }
    }
  } else {
    console.log(`  URL:     ${srv.url}`);
    if (srv.headers && Object.keys(srv.headers).length > 0) {
      console.log("  Headers:");
      for (const [k, v] of Object.entries(srv.headers)) {
        console.log(`    ${k}: ${v}`);
      }
    }
  }
  console.log("");
}

/**
 * `mcp add` — Interactive wizard to configure a new MCP server.
 *
 * Prompts for all required fields based on the server type chosen, validates
 * the result against {@link McpServerConfigSchema}, and writes to `config.json`.
 */
async function handleAdd(): Promise<void> {
  const rl = readline.createInterface({ input, output });

  const ask = (prompt: string, defaultVal?: string): Promise<string> => {
    const hint = defaultVal !== undefined ? ` [${defaultVal}]` : "";
    return rl.question(`  ${prompt}${hint}: `);
  };

  console.log("\n🔌 Add a new MCP Server\n");

  try {
    // --- Common fields -------------------------------------------------
    let id = (await ask("Server ID (kebab-case, e.g. filesystem)")).trim();
    if (!id) {
      console.error("✗ Server ID is required.");
      rl.close();
      process.exit(1);
    }

    // Validate ID — kebab-case only
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
      console.error("✗ Server ID must be lowercase kebab-case (e.g. my-server).");
      rl.close();
      process.exit(1);
    }

    const servers = readServers();
    if (Object.prototype.hasOwnProperty.call(servers, id)) {
      console.error(`✗ A server with ID "${id}" already exists. Use "mcp remove ${id}" first.`);
      rl.close();
      process.exit(1);
    }

    const name = (await ask("Display name", id)).trim() || id;

    const typeRaw = (await ask("Type: local (stdio) or http (SSE/HTTP)?", "local")).trim().toLowerCase();
    const isLocal = typeRaw === "local" || typeRaw === "stdio";
    const type = isLocal ? "local" : (typeRaw === "sse" ? "sse" : "http");

    // --- Type-specific fields ------------------------------------------
    let serverConfig: McpServerConfig;

    if (isLocal) {
      const command = (await ask("Command (e.g. npx, node, python)")).trim();
      if (!command) {
        console.error("✗ Command is required for local servers.");
        rl.close();
        process.exit(1);
      }

      const argsRaw = (await ask("Arguments (space-separated)", "")).trim();
      const args = argsRaw ? argsRaw.split(/\s+/) : [];

      const cwd = (await ask("Working directory (leave blank for default)", "")).trim() || undefined;

      const toolsRaw = (await ask("Tool filter (* for all, or comma-separated names)", "*")).trim();
      const tools = toolsRaw === "*" ? ["*"] : toolsRaw.split(/\s*,\s*/).filter(Boolean);

      const timeoutRaw = (await ask("Timeout in ms (leave blank for default)", "")).trim();
      const timeout = timeoutRaw ? Number(timeoutRaw) : undefined;

      serverConfig = {
        type: type as "local",
        name,
        enabled: true,
        command,
        args,
        ...(cwd ? { cwd } : {}),
        tools,
        ...(timeout !== undefined && !isNaN(timeout) ? { timeout } : {}),
      };
    } else {
      const url = (await ask("Server URL (e.g. https://api.example.com/mcp)")).trim();
      if (!url) {
        console.error("✗ URL is required for HTTP servers.");
        rl.close();
        process.exit(1);
      }

      const authHeader = (await ask("Authorization header value (leave blank to skip)", "")).trim();

      const toolsRaw = (await ask("Tool filter (* for all, or comma-separated names)", "*")).trim();
      const tools = toolsRaw === "*" ? ["*"] : toolsRaw.split(/\s*,\s*/).filter(Boolean);

      const timeoutRaw = (await ask("Timeout in ms (leave blank for default)", "")).trim();
      const timeout = timeoutRaw ? Number(timeoutRaw) : undefined;

      serverConfig = {
        type: type as "http",
        name,
        enabled: true,
        url,
        ...(authHeader ? { headers: { Authorization: authHeader } } : {}),
        tools,
        ...(timeout !== undefined && !isNaN(timeout) ? { timeout } : {}),
      };
    }

    // --- Validate and persist ------------------------------------------
    const validation = McpServerConfigSchema.safeParse(serverConfig);
    if (!validation.success) {
      console.error("\n✗ Validation failed:");
      for (const issue of validation.error.issues) {
        console.error(`  • ${issue.path.join(".")}: ${issue.message}`);
      }
      rl.close();
      process.exit(1);
    }

    servers[id] = validation.data;
    writeServers(servers);

    console.log(`\n✅ MCP server "${id}" added successfully!`);
    console.log(`   Enable it: co-assistant mcp enable ${id}`);
    console.log(`   View info: co-assistant mcp info ${id}\n`);
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Register the `mcp` subcommand on the given Commander program.
 *
 * @param program - Root Commander program instance.
 */
export function registerMcpCommand(program: Command): void {
  const mcp = program
    .command("mcp")
    .description("Manage MCP (Model Context Protocol) server configurations");

  mcp
    .command("list")
    .description("List all configured MCP servers")
    .action(handleList);

  mcp
    .command("add")
    .description("Add a new MCP server (interactive wizard)")
    .action(handleAdd);

  mcp
    .command("remove")
    .description("Remove a configured MCP server")
    .argument("<id>", "Server ID to remove")
    .action(handleRemove);

  mcp
    .command("enable")
    .description("Enable a configured MCP server")
    .argument("<id>", "Server ID to enable")
    .action(handleEnable);

  mcp
    .command("disable")
    .description("Disable a configured MCP server")
    .argument("<id>", "Server ID to disable")
    .action(handleDisable);

  mcp
    .command("info")
    .description("Show detailed configuration for a specific MCP server")
    .argument("<id>", "Server ID to inspect")
    .action(handleInfo);
}
