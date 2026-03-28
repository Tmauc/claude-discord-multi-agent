#!/usr/bin/env bun
/**
 * Check that the bot has all required permissions on a Discord server.
 *
 * Usage:
 *   bun scripts/check-permissions.ts              # checks all guilds
 *   bun scripts/check-permissions.ts <guild-id>   # checks specific guild
 */

import { withDiscordClient } from './_lib.ts'
import { GatewayIntentBits, PermissionFlagsBits, type Guild } from 'discord.js'

const [targetGuildId] = process.argv.slice(2)

const REQUIRED: Array<[string, bigint]> = [
  ['View Channel',              PermissionFlagsBits.ViewChannel],
  ['Send Messages',             PermissionFlagsBits.SendMessages],
  ['Send Messages in Threads',  PermissionFlagsBits.SendMessagesInThreads],
  ['Read Message History',      PermissionFlagsBits.ReadMessageHistory],
  ['Attach Files',              PermissionFlagsBits.AttachFiles],
  ['Add Reactions',             PermissionFlagsBits.AddReactions],
  ['Use External Emojis',       PermissionFlagsBits.UseExternalEmojis],
  ['Manage Messages',           PermissionFlagsBits.ManageMessages],
]

const OPTIONAL: Array<[string, bigint]> = [
  ['Manage Channels',           PermissionFlagsBits.ManageChannels],
]

async function checkGuild(guild: Guild, botId: string): Promise<void> {
  console.log(`\n📋 Server: ${guild.name} (${guild.id})`)

  let member
  try {
    member = await guild.members.fetch(botId)
  } catch {
    console.log('  ❌ Could not fetch bot member — not in this guild?')
    return
  }

  const perms = member.permissions
  let allGood = true

  console.log('  Required permissions:')
  for (const [name, flag] of REQUIRED) {
    const has = perms.has(flag)
    if (!has) allGood = false
    console.log(`    ${has ? '✅' : '❌'} ${name}`)
  }

  console.log('  Optional permissions:')
  for (const [name, flag] of OPTIONAL) {
    const has = perms.has(flag)
    console.log(`    ${has ? '✅' : '⚠️ '} ${name}${has ? '' : ' (needed for create-channel.ts)'}`)
  }

  if (allGood) {
    console.log('  ✅ All required permissions present')
  } else {
    console.log('  ❌ Some required permissions are missing — update bot permissions in the Developer Portal')
  }
}

await withDiscordClient(async client => {
  const botId = client.user!.id
  console.log(`Bot: ${client.user!.tag}`)

  if (targetGuildId) {
    const guild = client.guilds.cache.get(targetGuildId)
    if (!guild) {
      console.error(`Guild ${targetGuildId} not found — is the bot in this server?`)
      process.exit(1)
    }
    await checkGuild(guild, botId)
  } else {
    if (client.guilds.cache.size === 0) {
      console.log('Bot is not in any servers.')
    }
    for (const guild of client.guilds.cache.values()) {
      await checkGuild(guild, botId)
    }
  }
}, [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers])
