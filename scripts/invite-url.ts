#!/usr/bin/env bun
/**
 * Generate the OAuth2 invite URL for the Discord bot with all required permissions.
 *
 * Usage: bun scripts/invite-url.ts
 */

import { withDiscordClient } from './_lib.ts'
import { GatewayIntentBits, PermissionFlagsBits } from 'discord.js'

// Permissions needed for full functionality.
const PERMISSIONS =
  PermissionFlagsBits.ViewChannel          |
  PermissionFlagsBits.SendMessages         |
  PermissionFlagsBits.SendMessagesInThreads|
  PermissionFlagsBits.ReadMessageHistory   |
  PermissionFlagsBits.AttachFiles          |
  PermissionFlagsBits.AddReactions         |
  PermissionFlagsBits.UseExternalEmojis    |
  PermissionFlagsBits.ManageMessages       | // for dashboard pinning
  PermissionFlagsBits.ManageChannels         // for create-channel.ts

await withDiscordClient(async client => {
  const appId = client.user!.id
  const perms  = PERMISSIONS.toString()

  const url = `https://discord.com/api/oauth2/authorize?client_id=${appId}&scope=bot&permissions=${perms}`

  console.log(`Bot: ${client.user!.tag}`)
  console.log(`Application ID: ${appId}`)
  console.log()
  console.log('Invite URL (all permissions):')
  console.log(url)
  console.log()
  console.log('Invite URL (basic — no channel management):')
  const basicPerms = (
    PermissionFlagsBits.ViewChannel           |
    PermissionFlagsBits.SendMessages          |
    PermissionFlagsBits.SendMessagesInThreads |
    PermissionFlagsBits.ReadMessageHistory    |
    PermissionFlagsBits.AttachFiles           |
    PermissionFlagsBits.AddReactions          |
    PermissionFlagsBits.UseExternalEmojis     |
    PermissionFlagsBits.ManageMessages
  ).toString()
  console.log(`https://discord.com/api/oauth2/authorize?client_id=${appId}&scope=bot&permissions=${basicPerms}`)
})
