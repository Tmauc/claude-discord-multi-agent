# claude-discord-multi-agent

Unofficial fork of the Discord channel plugin from [`anthropics/claude-plugins-official`](https://github.com/anthropics/claude-plugins-official), extended with multi-agent orchestration, per-channel session isolation, and interactive permission relay.

**Plugin version:** `0.0.4`
**Upstream sync:** up to `daa84c9` (2026-03-20) + additions listed below

---

## What this fork adds

| Feature | Upstream | This fork |
|---|---|---|
| Basic Discord ↔ Claude messaging | ✅ | ✅ |
| DM + guild channel support | ✅ | ✅ |
| Pairing / allowlist access control | ✅ | ✅ |
| Inline permission buttons (Allow / Deny) | ✅ (`daa84c9`) | ✅ |
| **Per-channel session isolation** (`DISCORD_CHANNEL_FILTER`) | ❌ | ✅ |
| **Multi-agent orchestrator** (auto-spawn + health watch) | ❌ | ✅ |
| **Permission relay routed to session channel** | ❌ | ✅ |
| **Rich permission messages** (shows command / file preview) | ❌ | ✅ |
| Auto-retry rate-limited sessions via tmux | ❌ | ✅ |
| Persistent workspaces (`--continue` on restart) | ❌ | ✅ |
| Auto-register/unregister guild channels in `access.json` | ❌ | ✅ |

---

## Prerequisites

- [Bun](https://bun.sh) — `curl -fsSL https://bun.sh/install | bash`
- [Claude Code](https://claude.ai/code) — `npm install -g @anthropic-ai/claude-code`
- A Discord bot token (see setup below)

---

## Quick setup — single agent

### 1. Create a Discord bot

Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.

Navigate to **Bot**:
- Give it a username
- Enable **Message Content Intent** under Privileged Gateway Intents
- Click **Reset Token** and copy the token

### 2. Invite the bot to a server

**OAuth2 → URL Generator** → scope `bot`. Enable these permissions:

- View Channels
- Send Messages
- Send Messages in Threads
- Read Message History
- Attach Files
- Add Reactions
- Use External Emojis *(for permission button emojis)*

Open the generated URL and add the bot to your server.

### 3. Clone this repo

```sh
git clone https://github.com/Tmauc/claude-discord-multi-agent
cd claude-discord-multi-agent
bun install
```

### 4. Save the bot token

```sh
/discord:configure MTIz...
```

This writes `DISCORD_BOT_TOKEN=...` to `~/.claude/channels/discord/.env`.

### 5. Launch Claude Code with the channel flag

```sh
claude --channels plugin:discord --plugin-dir /path/to/claude-discord-multi-agent
```

### 6. Pair your Discord account

DM your bot — it replies with a 6-character pairing code. In your Claude Code session:

```sh
/discord:access pair <code>
```

Your messages now reach the assistant.

### 7. Lock it down

Once paired, switch to `allowlist` mode so strangers get no pairing replies:

```sh
/discord:access policy allowlist
```

---

## Multi-agent orchestrator

The orchestrator watches Discord for channels matching a name prefix (or category), automatically spawns a dedicated Claude Code session per channel, and keeps them alive with health checks and exponential backoff restarts.

Each session runs in its own **tmux window** — attach at any time to see what the agent is doing.

### Additional bot permissions

Add **Manage Messages** in the Developer Portal (for dashboard pinning).

### Special channels

Create these three channels in your Discord server:

| Channel | Purpose |
|---|---|
| `claude-orchestrateur` | Boot message + orchestrator's own Claude agent |
| `claude-dashboard` | Live-edited pinned message with all agent statuses |
| `claude-logs` | Event stream (started / crashed / restarted) |

Enable Developer Mode (Discord Settings → Advanced), right-click each channel → **Copy Channel ID**.

### Configure

Add to `~/.claude/channels/discord/.env`:

```sh
DISCORD_ORCHESTRATOR_CHANNEL=<claude-orchestrateur ID>
DISCORD_DASHBOARD_CHANNEL=<claude-dashboard ID>
DISCORD_LOGS_CHANNEL=<claude-logs ID>
```

### Run

```sh
cd /path/to/claude-discord-multi-agent
bun run orchestrator
```

Run in a persistent shell (tmux, screen, or a system service).

### How it works

- Any channel whose name starts with `claude-` (configurable) gets its own agent session
- The three special channels are automatically excluded from spawning
- Health check runs every 30s — crashed sessions restart with backoff: 5s → 15s → 30s → 60s → 5min
- The `#claude-dashboard` message is edited in place on every health cycle
- Sessions use `--continue` to resume from their last workspace state after a restart
- Rate-limited sessions (HTTP 429) are automatically retried via `tmux send-keys Enter`

Watch a specific agent's session:

```sh
tmux attach -t discord-<channel_id>
```

### Full configuration

| Variable | Default | Description |
|---|---|---|
| `DISCORD_ORCHESTRATOR_CHANNEL` | — | Channel ID for boot messages and Claude agent |
| `DISCORD_DASHBOARD_CHANNEL` | — | Channel ID for the live dashboard |
| `DISCORD_LOGS_CHANNEL` | — | Channel ID for event logs |
| `DISCORD_CHANNEL_PREFIX` | `claude-` | Name prefix to watch for auto-spawn |
| `DISCORD_CATEGORY_ID` | — | Watch all channels in this category (overrides prefix) |
| `DISCORD_EXCLUDE_CHANNELS` | — | Comma-separated extra channel IDs to never spawn |
| `DISCORD_MAX_SESSIONS` | `10` | Max concurrent agent sessions |
| `DISCORD_AGENT_WORKDIR` | `$HOME` | Working directory for spawned Claude sessions |
| `CLAUDE_BIN` | `claude` | Path to the Claude Code binary |
| `CLAUDE_FLAGS` | `--dangerously-skip-permissions` | Flags passed to each spawned agent session |

---

## Per-channel session isolation (`DISCORD_CHANNEL_FILTER`)

When running multiple agent sessions, set `DISCORD_CHANNEL_FILTER` to restrict each instance to specific channels. Each session only sees and responds to messages from its assigned channel(s).

```sh
# Agent A handles #project-alpha
DISCORD_CHANNEL_FILTER=1234567890 claude --channels plugin:discord

# Agent B handles #project-beta
DISCORD_CHANNEL_FILTER=9876543210 claude --channels plugin:discord
```

Comma-separate multiple IDs to assign several channels to one agent:

```sh
DISCORD_CHANNEL_FILTER=111,222,333 claude --channels plugin:discord
```

Without this variable, the server handles all channels (original behavior).

---

## Permission relay

When Claude Code needs to ask for permission to run a tool (Bash command, file write, etc.), the request is sent directly to the Discord channel where the session is running — not to a DM.

The message shows the tool name and the exact command or file path:

```
🔐 Permission needed — `Bash` · #project-alpha
> `rm -rf dist/`
```

Three inline buttons let you respond without typing:

- **See more** — expand full tool description and input details
- **✅ Allow** — approve this specific request
- **❌ Deny** — reject it

Text fallback (useful from mobile): reply `yes <id>` or `no <id>` where `<id>` is the 5-letter code in the permission message.

---

## Access control

See **[ACCESS.md](./ACCESS.md)** for DM policies, guild channels, mention detection, delivery configuration, skill commands, and the `access.json` schema.

Quick reference:

| | |
|---|---|
| Default policy | `pairing` |
| Config file | `~/.claude/channels/discord/access.json` |
| Reload | Automatic — re-read on every inbound message |
| Static mode | `DISCORD_ACCESS_MODE=static` — pins config to disk state at boot |

---

## Tools exposed to the assistant

| Tool | Description |
|---|---|
| `reply` | Send to a channel. Takes `chat_id` + `text`, optionally `reply_to` (message ID) for threading and `files` (absolute paths) for attachments — max 10 files, 25MB each. Auto-chunks long messages. |
| `react` | Add an emoji reaction. Unicode works directly; custom emoji use `<:name:id>` form. |
| `edit_message` | Edit a message the bot previously sent — useful for progress updates. |
| `fetch_messages` | Pull recent history (oldest-first, capped at 100). Messages with attachments are marked `+Natt`. |
| `download_attachment` | Download all attachments from a message to `~/.claude/channels/discord/inbox/`. |

---

## Multiple bots / separate state directories

To run multiple bots on one machine (different tokens, separate allowlists), point `DISCORD_STATE_DIR` at a different directory per instance:

```sh
DISCORD_STATE_DIR=~/.claude/channels/discord-work claude --channels plugin:discord
DISCORD_STATE_DIR=~/.claude/channels/discord-personal claude --channels plugin:discord
```

---

## Upstream sync status

Last synced: **2026-03-28**

| Upstream commit | Description | Status |
|---|---|---|
| `daa84c9` | feat: permission-relay capability + bidirectional handlers | ✅ synced |
| `61c0597` | merge: channels-rollup | ✅ in base |

Additions in this fork (no upstream equivalent):

| Commit | Description |
|---|---|
| `5c19fbb` | fix: route permission requests to session channel + richer messages |
| `7f875ae` | feat: auto-retry rate limited sessions via tmux send-keys Enter |
| `2ad6bcf` | feat: persistent workspaces with `--continue` on restart + orchestrator Claude session |
| `7157cc5` | fix: auto-register/unregister guild channels in access.json on spawn/stop |
| `95b358f` | fix: add `--channels` flag to spawned Claude agent sessions |
| `51f21d4` | feat: compact permission messages with expandable details |
| `a9e3fd6` | feat: inline buttons for permission approval |
| `757a76b` | feat: add `DISCORD_CHANNEL_FILTER` for per-channel session isolation |

To check for new upstream commits:

```sh
cd /path/to/claude-plugins-official
git fetch origin
git log origin/main --oneline -- external_plugins/discord/
```

---

## License

Apache 2.0 — same as upstream.
