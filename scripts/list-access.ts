#!/usr/bin/env bun
/**
 * Show who has access to the Discord bot and which channels.
 *
 * Usage: bun scripts/list-access.ts
 */

import { readAccessFile, ACCESS_FILE } from './_lib.ts'

const a = readAccessFile()

console.log(`Access config: ${ACCESS_FILE}`)
console.log()

console.log(`DM policy: ${a.dmPolicy ?? 'pairing'}`)
console.log()

const allowFrom = a.allowFrom ?? []
if (allowFrom.length === 0) {
  console.log('Global DM allowlist: (empty)')
} else {
  console.log(`Global DM allowlist (${allowFrom.length}):`)
  for (const id of allowFrom) {
    console.log(`  ${id}`)
  }
}
console.log()

const groups = a.groups ?? {}
const groupIds = Object.keys(groups)
if (groupIds.length === 0) {
  console.log('Guild channels: (none registered)')
} else {
  console.log(`Guild channels (${groupIds.length}):`)
  for (const [channelId, policy] of Object.entries(groups)) {
    const mention = policy.requireMention ? 'requires @mention' : 'no mention needed'
    const users   = policy.allowFrom?.length
      ? policy.allowFrom.join(', ')
      : 'all guild members'
    console.log(`  #${channelId}  [${mention}]  users: ${users}`)
  }
}

const pending = a.pending ?? {}
const pendingCount = Object.keys(pending).length
if (pendingCount > 0) {
  console.log()
  console.log(`Pending pairings: ${pendingCount}`)
  for (const [code, data] of Object.entries(pending)) {
    console.log(`  ${code}: ${JSON.stringify(data)}`)
  }
}
