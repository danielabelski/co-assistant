# Getting Started

## Prerequisites

- Node.js 20+
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))
- A GitHub token with Copilot access

## Installation

```bash
# Global install (recommended)
npm install -g @hmawla/co-assistant

# Or run from source
git clone <repo-url> && cd co-assistant
npm install
```

## Quick Start

```bash
# Create a working directory and run the setup wizard
mkdir ~/co-assistant && cd ~/co-assistant
co-assistant setup

# Install first-party plugins
co-assistant plugin install --all

# Enable and configure a plugin
co-assistant plugin enable gmail
co-assistant plugin configure gmail

# Start the bot
co-assistant start
```

## Personalisation

Two optional Markdown files let you customise the AI's behaviour — changes take effect on the next message with no restart needed.

### `personality.md`

Defines the assistant's tone, thinking style, and response format. A default ships with the package. Edit it to suit your preferences.

### `user.md`

Your personal profile (name, title, timezone, role, preferences) so the AI can address you correctly. Copy the template to get started:

```bash
cp user.md.example user.md
# Edit user.md with your details
```

## Configuration

See `.env.example` for environment variables and `config.json.example` for plugin configuration.
