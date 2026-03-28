#!/usr/bin/env bun
/**
 * Force-restart a Claude agent session by killing its tmux window.
 * The orchestrator health monitor detects the disappearance and respawns it
 * automatically (with --continue to preserve workspace context).
 *
 * Usage: bun scripts/restart-session.ts <channel-id>
 */

import { readStateFile, writeStateFile, tmuxName, tmuxKill, tmuxHasSession } from './_lib.ts'

const [channelId] = process.argv.slice(2)

if (!channelId) {
  console.error('Usage: bun scripts/restart-session.ts <channel-id>')
  process.exit(1)
}

const sessions = readStateFile()
const session  = sessions.find(s => s.channelId === channelId)

if (!session) {
  console.error(`No session found for channel ${channelId}`)
  console.error('Run `bun scripts/list-sessions.ts` to see active sessions')
  process.exit(1)
}

const name  = tmuxName(channelId)
const alive = await tmuxHasSession(name)

if (alive) {
  await tmuxKill(name)
  console.log(`✅ Killed tmux session ${name}`)
} else {
  console.log(`tmux session ${name} was not running`)
}

// Mark as crashed so the health monitor picks it up for restart.
session.status    = 'crashed'
session.lastCrashAt = Date.now()
writeStateFile(sessions)

console.log(`✅ Session #${session.channelName} (${channelId}) marked for restart`)
console.log('The orchestrator health monitor will respawn it within 30s (with --continue).')
