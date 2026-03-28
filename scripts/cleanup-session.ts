#!/usr/bin/env bun
/**
 * Clean up a dead session: kill its tmux window, delete its workspace,
 * and remove it from state and access.json.
 *
 * Use this for channels that no longer exist or sessions you want to fully reset.
 * WARNING: deletes the workspace — conversation context will be lost.
 *
 * Usage: bun scripts/cleanup-session.ts <channel-id>
 */

import {
  readStateFile, writeStateFile,
  readAccessFile, writeAccessFile,
  tmuxName, tmuxKill, tmuxHasSession,
  WORKSPACES_DIR,
} from './_lib.ts'
import { rmSync, existsSync } from 'fs'
import { join } from 'path'

const [channelId] = process.argv.slice(2)

if (!channelId) {
  console.error('Usage: bun scripts/cleanup-session.ts <channel-id>')
  process.exit(1)
}

const sessions = readStateFile()
const session  = sessions.find(s => s.channelId === channelId)

// Kill tmux
const name  = tmuxName(channelId)
const alive = await tmuxHasSession(name)
if (alive) {
  await tmuxKill(name)
  console.log(`✅ Killed tmux session ${name}`)
} else {
  console.log(`tmux session ${name} was not running`)
}

// Delete workspace
const wdir = join(WORKSPACES_DIR, channelId)
if (existsSync(wdir)) {
  rmSync(wdir, { recursive: true, force: true })
  console.log(`✅ Deleted workspace ${wdir}`)
} else {
  console.log(`No workspace found at ${wdir}`)
}

// Remove from state
if (session) {
  const updated = sessions.filter(s => s.channelId !== channelId)
  writeStateFile(updated)
  console.log(`✅ Removed #${session.channelName} (${channelId}) from state file`)
} else {
  console.log(`Channel ${channelId} not found in state file`)
}

// Remove from access.json
const a = readAccessFile()
if (a.groups?.[channelId]) {
  delete a.groups[channelId]
  writeAccessFile(a)
  console.log(`✅ Removed ${channelId} from access.json`)
}

console.log()
console.log('Cleanup complete. The channel has been fully removed from the system.')
