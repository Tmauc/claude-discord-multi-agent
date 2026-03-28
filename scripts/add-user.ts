#!/usr/bin/env bun
/**
 * Add a Discord user to the allowlist.
 *
 * Usage:
 *   bun scripts/add-user.ts <user-id>             # global DM allowlist
 *   bun scripts/add-user.ts <user-id> <channel-id> # specific channel
 */

import { readAccessFile, writeAccessFile } from './_lib.ts'

const [userId, channelId] = process.argv.slice(2)

if (!userId) {
  console.error('Usage: bun scripts/add-user.ts <user-id> [channel-id]')
  process.exit(1)
}

const a = readAccessFile()

if (channelId) {
  a.groups ??= {}
  a.groups[channelId] ??= { requireMention: false, allowFrom: [] }
  if (a.groups[channelId].allowFrom.includes(userId)) {
    console.log(`User ${userId} already in allowlist for channel ${channelId}`)
    process.exit(0)
  }
  a.groups[channelId].allowFrom.push(userId)
  writeAccessFile(a)
  console.log(`✅ Added ${userId} to channel ${channelId} allowlist`)
} else {
  a.allowFrom ??= []
  if (a.allowFrom.includes(userId)) {
    console.log(`User ${userId} already in global DM allowlist`)
    process.exit(0)
  }
  a.allowFrom.push(userId)
  writeAccessFile(a)
  console.log(`✅ Added ${userId} to global DM allowlist`)
}
