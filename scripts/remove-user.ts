#!/usr/bin/env bun
/**
 * Remove a Discord user from the allowlist.
 *
 * Usage:
 *   bun scripts/remove-user.ts <user-id>             # global DM allowlist
 *   bun scripts/remove-user.ts <user-id> <channel-id> # specific channel
 */

import { readAccessFile, writeAccessFile } from './_lib.ts'

const [userId, channelId] = process.argv.slice(2)

if (!userId) {
  console.error('Usage: bun scripts/remove-user.ts <user-id> [channel-id]')
  process.exit(1)
}

const a = readAccessFile()

if (channelId) {
  const group = a.groups?.[channelId]
  if (!group || !group.allowFrom.includes(userId)) {
    console.log(`User ${userId} not found in allowlist for channel ${channelId}`)
    process.exit(0)
  }
  group.allowFrom = group.allowFrom.filter(id => id !== userId)
  writeAccessFile(a)
  console.log(`✅ Removed ${userId} from channel ${channelId} allowlist`)
} else {
  if (!a.allowFrom?.includes(userId)) {
    console.log(`User ${userId} not found in global DM allowlist`)
    process.exit(0)
  }
  a.allowFrom = a.allowFrom.filter(id => id !== userId)
  writeAccessFile(a)
  console.log(`✅ Removed ${userId} from global DM allowlist`)
}
