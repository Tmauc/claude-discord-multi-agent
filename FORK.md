# Fork Status

Unofficial fork of [`anthropics/claude-plugins-official`](https://github.com/anthropics/claude-plugins-official) — Discord channel plugin only.

## What's different from the official plugin

**Per-channel session isolation** (`DISCORD_CHANNEL_FILTER`)

Set `DISCORD_CHANNEL_FILTER` to a comma-separated list of channel IDs to restrict a Claude Code session to specific channels. This enables multi-agent setups where each session handles its own channel(s):

```sh
DISCORD_CHANNEL_FILTER=123 claude --channels plugin:discord  # agent A
DISCORD_CHANNEL_FILTER=456 claude --channels plugin:discord  # agent B
```

Without this variable, the server behaves identically to the official plugin.

## Upstream sync status

Last synced with `upstream/main` on **2026-03-28**.

| Upstream commit | Description | Status |
|---|---|---|
| `4b1e2a2` | compact permission messages with expandable details (#952) | synced |
| `b3a0714` | inline buttons for permission approval (#945) | synced |
| `daa84c9` | permission-relay capability + bidirectional handlers | synced |
| `87e0f09` | merge: discord-resilience into channels-rollup | included in base fork |
| `aa4f7c4` | merge: discord-edit-notif-guidance into channels-rollup | included in base fork |
| `aa71c24` | discord: port resilience fixes from telegram | included in base fork |
| `5c58308` | guide assistant to send new reply on completion | included in base fork |
| `14927ff` | make state dir configurable via env var | included in base fork |
| `562a27f` | merge: chmod-env-files | included in base fork |
| `8140fba` | lock .env files to owner (chmod 600) | included in base fork |
| `b01fad3` | README clarifications | included in base fork |
| `8938650` | add Bun prerequisite to READMEs | included in base fork |

**To check for new upstream commits:**

```sh
git fetch upstream
git log upstream/main --oneline -- external_plugins/discord/
```

Any commit above `4b1e2a2` is new and needs to be cherry-picked.
