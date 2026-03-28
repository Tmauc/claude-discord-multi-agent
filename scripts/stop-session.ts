#!/usr/bin/env bun
/**
 * Stop a Claude agent session (kills tmux, marks stopped in state).
 * The orchestrator will NOT restart a stopped session — use restart-session.ts to restart.
 *
 * Usage: bun scripts/stop-session.ts <channel-id>
 */

import { readStateFile, writeStateFile, tmuxName, tmuxKill, tmuxHasSession } from './_lib.ts'

const [channelId] = process.argv.slice(2)

if (!channelId) {
  console.error('Usage: bun scripts/stop-session.ts <channel-id>')
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

session.status = 'stopped'
writeStateFile(sessions)
console.log(`✅ Session #${session.channelName} (${channelId}) marked as stopped`)
console.log()
console.log('Note: the orchestrator health check will NOT restart a stopped session.')
console.log('Use `bun scripts/restart-session.ts` to restart it.')
