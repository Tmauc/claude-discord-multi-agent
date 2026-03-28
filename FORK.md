# Fork Status

Unofficial fork of [`anthropics/claude-plugins-official`](https://github.com/anthropics/claude-plugins-official) — Discord channel plugin only, extended with multi-agent orchestration.

## What's different from the official plugin

### Per-channel session isolation (`DISCORD_CHANNEL_FILTER`)

Set `DISCORD_CHANNEL_FILTER` to a comma-separated list of channel IDs to restrict a Claude Code session to specific channels. This enables multi-agent setups where each session handles its own channel(s):

```sh
DISCORD_CHANNEL_FILTER=123 claude --channels plugin:discord  # agent A
DISCORD_CHANNEL_FILTER=456 claude --channels plugin:discord  # agent B
```

Without this variable, the server behaves identically to the official plugin.

### Permission relay improvements

- Requests are routed to the session's Discord channel (not DMs)
- Main message shows tool name + command or file path (not just the tool name)

### Multi-agent orchestrator (`orchestrator.ts`)

Standalone daemon that auto-spawns Claude Code sessions per channel, monitors health, and restarts with backoff. See [README.md](./README.md#multi-agent-orchestrator).

### Scripts toolkit (`scripts/`)

13 Bun scripts for session management, access control, and server setup — callable manually or by the orchestrator agent via Bash. See [README.md](./README.md#scripts-toolkit).

---

## Upstream sync status

Last synced with `upstream/main` on **2026-03-28**.

| Upstream commit | Description | Status |
|---|---|---|
| `daa84c9` | permission-relay capability + bidirectional handlers | ✅ synced |
| `61c0597` | merge: channels-rollup | ✅ in base |

> Note: `4b1e2a2` and `b3a0714` referenced in the original merge request did not exist as separate commits upstream — their features were implemented directly in this fork (`51f21d4`, `a9e3fd6`).

### Fork-only commits

| Commit | Description |
|---|---|
| `0c84867` | feat: scripts/ toolkit — 13 Bun scripts for session mgmt, access, server setup |
| `5c19fbb` | fix: route permission requests to session channel + richer messages |
| `7f875ae` | feat: auto-retry rate limited sessions via tmux send-keys Enter |
| `2ad6bcf` | feat: persistent workspaces with `--continue` on restart + orchestrator agent |
| `7157cc5` | fix: auto-register/unregister guild channels in access.json on spawn/stop |
| `95b358f` | fix: add `--channels` flag to spawned Claude agent sessions |
| `51f21d4` | feat: compact permission messages with expandable details |
| `a9e3fd6` | feat: inline buttons for permission approval |
| `757a76b` | feat: add `DISCORD_CHANNEL_FILTER` for per-channel session isolation |

---

**To check for new upstream commits:**

```sh
cd /path/to/claude-plugins-official
git fetch origin
git log origin/main --oneline -- external_plugins/discord/
```

Any commit above `daa84c9` that isn't in the fork-only list above needs to be evaluated for cherry-picking.
