# MCP (Model Context Protocol) Support

Co-Assistant supports the [Model Context Protocol](https://modelcontextprotocol.io/) natively through the GitHub Copilot SDK. MCP servers let you extend the AI with tools served over **stdio** (local process) or **HTTP/SSE** (remote service) — no additional npm dependencies required.

---

## How it works

When co-assistant starts, it reads the `mcp.servers` section of `config.json`, filters out disabled servers, resolves `${ENV_VAR}` placeholders in headers and env values, then passes the resulting map directly to the Copilot SDK's `createSession()` call. The SDK handles process spawning (stdio), HTTP/SSE connections, tool discovery, and tool invocation internally.

---

## Config schema

MCP servers are defined in `config.json` under `mcp.servers`. The section is **optional** — if absent, no MCP servers are configured.

```json
{
  "mcp": {
    "servers": {
      "<id>": { ... }
    }
  }
}
```

Each key is a unique server ID (lowercase kebab-case, e.g. `filesystem`). Each value is a server config object with these fields:

### Common fields (all server types)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Human-readable display label |
| `type` | `"local"` \| `"stdio"` \| `"http"` \| `"sse"` | ✅ | Connection type |
| `enabled` | boolean | ✅ | Whether this server is active at startup |
| `tools` | string[] | — | Tool filter — `["*"]` for all, or specific tool names |
| `timeout` | number | — | Timeout in milliseconds (default: SDK default) |

### Local / stdio server

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | ✅ | The executable to run (e.g. `npx`, `node`, `python`) |
| `args` | string[] | ✅ | Arguments to pass to the command |
| `env` | object | — | Extra environment variables for the process |
| `cwd` | string | — | Working directory for the process |

### HTTP / SSE server

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | ✅ | Base URL of the MCP server |
| `headers` | object | — | HTTP headers (e.g. `Authorization`) |

---

## Environment variable interpolation

Use `${VAR_NAME}` placeholders in `headers` and `env` values. They are resolved from `process.env` at session creation time, so secrets stay in your `.env` file and never appear in `config.json`.

```json
"headers": {
  "Authorization": "Bearer ${GITHUB_TOKEN}"
}
```

If a variable is not set in the environment, the placeholder is left as-is (you will see `${GITHUB_TOKEN}` in the request — not an empty value).

---

## Config examples

### Filesystem MCP (stdio)

Gives the AI access to read/write files in a directory:

```json
{
  "mcp": {
    "servers": {
      "filesystem": {
        "name": "Filesystem",
        "type": "local",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        "env": {},
        "tools": ["*"],
        "timeout": 30000,
        "enabled": true
      }
    }
  }
}
```

### GitHub MCP (HTTP)

Gives the AI access to GitHub repositories, issues, and PRs:

```json
{
  "mcp": {
    "servers": {
      "github": {
        "name": "GitHub MCP",
        "type": "http",
        "url": "https://api.githubcopilot.com/mcp/",
        "headers": {
          "Authorization": "Bearer ${GITHUB_TOKEN}"
        },
        "tools": ["*"],
        "timeout": 30000,
        "enabled": false
      }
    }
  }
}
```

Add `GITHUB_TOKEN=your_token_here` to your `.env` file.

### Python MCP server (stdio)

```json
{
  "mcp": {
    "servers": {
      "my-python-server": {
        "name": "My Python Server",
        "type": "local",
        "command": "python",
        "args": ["/path/to/server.py"],
        "cwd": "/path/to",
        "tools": ["*"],
        "enabled": true
      }
    }
  }
}
```

---

## Popular MCP servers

| Server | Type | Package / URL |
|--------|------|---------------|
| Filesystem | stdio | `@modelcontextprotocol/server-filesystem` |
| GitHub | HTTP | `https://api.githubcopilot.com/mcp/` |
| Brave Search | stdio | `@modelcontextprotocol/server-brave-search` |
| Fetch | stdio | `@modelcontextprotocol/server-fetch` |
| Postgres | stdio | `@modelcontextprotocol/server-postgres` |
| Slack | stdio | `@modelcontextprotocol/server-slack` |

A community registry of MCP servers is maintained at [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers).

---

## CLI commands

```bash
# List all configured servers with status
co-assistant mcp list

# Add a new server (interactive wizard)
co-assistant mcp add

# Show full config for a specific server
co-assistant mcp info <id>

# Enable a server
co-assistant mcp enable <id>

# Disable a server (keeps config, skips at startup)
co-assistant mcp disable <id>

# Remove a server entirely
co-assistant mcp remove <id>
```

---

## Telegram command

Send `/mcp` in your Telegram bot to see which MCP servers are currently enabled and what connection type they use.

---

## Startup banner

When MCP servers are configured and enabled, co-assistant shows them in the startup banner:

```
  Bot:     @my_bot
  Model:   gpt-4.1
  Sessions: 3 (parallel processing)
  Plugins: gmail (1 active)
  MCP:     filesystem, github (2 servers)
```

---

## Troubleshooting

**Server not appearing in `/mcp`**  
→ Check that `enabled: true` is set in `config.json`.

**Tool calls failing**  
→ Run `co-assistant mcp info <id>` to verify the config. For stdio servers, ensure the command exists on your `PATH`. For HTTP servers, check the URL and headers.

**`${VAR}` not expanding**  
→ Ensure the variable is set in your `.env` file and that `.env` is being loaded (check `LOG_LEVEL=debug` output on startup).

**Stdio server exits immediately**  
→ Run the command manually in a terminal to debug. The SDK spawns it as a subprocess — any stderr output is logged at `debug` level.
