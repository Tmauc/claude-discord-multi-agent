#!/usr/bin/env bun
/**
 * Create a new Claude agent channel in a Discord server.
 * The orchestrator will detect the new channel and auto-spawn a session.
 *
 * Usage:
 *   bun scripts/create-channel.ts <name> [guild-id]
 *
 * Examples:
 *   bun scripts/create-channel.ts projet-alpha
 *   bun scripts/create-channel.ts projet-alpha 123456789012345678
 *
 * The channel will be named claude-<name> (prefix added automatically if missing).
 * Requires the bot to have Manage Channels permission.
 */

import { withDiscordClient } from './_lib.ts'
import { GatewayIntentBits, ChannelType } from 'discord.js'

const [name, guildId] = process.argv.slice(2)

if (!name) {
  console.error('Usage: bun scripts/create-channel.ts <name> [guild-id]')
  console.error('Example: bun scripts/create-channel.ts projet-alpha')
  process.exit(1)
}

const CHANNEL_PREFIX = process.env.DISCORD_CHANNEL_PREFIX ?? 'claude-'
const channelName    = name.startsWith(CHANNEL_PREFIX) ? name : `${CHANNEL_PREFIX}${name}`

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
      for (const g of guilds) {
        console.error(`  ${g.id}  ${g.name}`)
      }
      process.exit(1)
    }
    targetGuildId = guilds[0].id
  }

  const guild = client.guilds.cache.get(targetGuildId)
  if (!guild) {
    console.error(`Guild ${targetGuildId} not found — is the bot in this server?`)
    process.exit(1)
  }

  // Check Manage Channels permission
  const botMember = await guild.members.fetch(client.user!.id)
  if (!botMember.permissions.has('ManageChannels')) {
    console.error('❌ Bot is missing Manage Channels permission in this server.')
    console.error('   Add it in the Discord Developer Portal → OAuth2 → Bot Permissions.')
    process.exit(1)
  }

  const categoryId = process.env.DISCORD_CATEGORY_ID ?? null
  const existing   = guild.channels.cache.find(c => c.name === channelName)

  if (existing) {
    console.log(`Channel #${channelName} already exists (${existing.id})`)
    console.log('The orchestrator should pick it up on next health check (within 30s).')
    process.exit(0)
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    ...(categoryId ? { parent: categoryId } : {}),
    reason: 'Created by create-channel.ts for Claude agent session',
  })

  console.log(`✅ Created #${channelName} (${channel.id}) in ${guild.name}`)
  console.log('The orchestrator will detect this channel and spawn a session within seconds.')
  console.log(`Attach to session: tmux attach -t discord-${channel.id}`)
}, [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers])
