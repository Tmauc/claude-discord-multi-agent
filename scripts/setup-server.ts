#!/usr/bin/env bun
/**
 * First-time setup for a Discord server: creates the three orchestrator channels
 * and saves their IDs to ~/.claude/channels/discord/.env.
 *
 * Usage:
 *   bun scripts/setup-server.ts           # auto-detects guild if bot is in one server
 *   bun scripts/setup-server.ts <guild-id>
 *
 * Creates:
 *   #claude-orchestrateur  — boot messages + Claude orchestrator agent
 *   #claude-dashboard       — live-edited pinned agent status
 *   #claude-logs            — event stream (start/crash/restart)
 *
 * Sets in .env:
 *   DISCORD_ORCHESTRATOR_CHANNEL
 *   DISCORD_DASHBOARD_CHANNEL
 *   DISCORD_LOGS_CHANNEL
 *
 * Requires: Manage Channels permission.
 * Idempotent: skips channels that already exist.
 */

import { withDiscordClient, setEnvValue } from './_lib.ts'
import { GatewayIntentBits, ChannelType } from 'discord.js'

const [guildId] = process.argv.slice(2)

const CHANNELS: Array<{ name: string; envKey: string; purpose: string }> = [
  { name: 'claude-orchestrateur', envKey: 'DISCORD_ORCHESTRATOR_CHANNEL', purpose: 'Boot messages + Claude orchestrator agent' },
  { name: 'claude-dashboard',     envKey: 'DISCORD_DASHBOARD_CHANNEL',    purpose: 'Live-edited pinned agent status'            },
  { name: 'claude-logs',          envKey: 'DISCORD_LOGS_CHANNEL',         purpose: 'Event stream (start / crash / restart)'     },
]

await withDiscordClient(async client => {
  let targetGuildId = guildId

  if (!targetGuildId) {
    const guilds = [...client.guilds.cache.values()]
    if (guilds.length === 0) {
      console.error('Bot is not in any servers.')
      process.exit(1)
    }
    if (guilds.length > 1) {
      console.error('Bot is in multiple servers — specify a guild ID:')
      for (const g of guilds) console.error(`  ${g.id}  ${g.name}`)
      process.exit(1)
    }
    targetGuildId = guilds[0].id
  }

  const guild = client.guilds.cache.get(targetGuildId)
  if (!guild) {
    console.error(`Guild ${targetGuildId} not found — is the bot in this server?`)
    process.exit(1)
  }

  const botMember = await guild.members.fetch(client.user!.id)
  if (!botMember.permissions.has('ManageChannels')) {
    console.error('❌ Bot is missing Manage Channels permission.')
    console.error('   Add it in the Discord Developer Portal → OAuth2 → Bot Permissions.')
    process.exit(1)
  }

  console.log(`Setting up server: ${guild.name} (${guild.id})`)
  console.log()

  for (const def of CHANNELS) {
    const existing = guild.channels.cache.find(c => c.name === def.name)

    if (existing) {
      setEnvValue(def.envKey, existing.id)
      console.log(`  ✅ #${def.name} already exists (${existing.id}) — saved to .env`)
    } else {
      const ch = await guild.channels.create({
        name: def.name,
        type: ChannelType.GuildText,
        reason: 'Created by setup-server.ts for Claude multi-agent orchestrator',
      })
      setEnvValue(def.envKey, ch.id)
      console.log(`  ✅ Created #${def.name} (${ch.id}) — saved to .env`)
    }
  }

  console.log()
  console.log('Setup complete. Next steps:')
  console.log('  1. Run the orchestrator:  bun run orchestrator')
  console.log('  2. Check the dashboard:   #claude-dashboard')
}, [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers])
