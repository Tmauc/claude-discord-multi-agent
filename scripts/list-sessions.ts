#!/usr/bin/env bun
/**
 * List all active Claude agent sessions with their statuses.
 *
 * Usage: bun scripts/list-sessions.ts
 */

import { readStateFile, statusIcon, relativeTime, tmuxHasSession } from './_lib.ts'

const sessions = readStateFile()

if (sessions.length === 0) {
  console.log('No sessions found. Is the orchestrator running?')
  process.exit(0)
}

console.log(`${'STATUS'.padEnd(12)} ${'CHANNEL'.padEnd(24)} ${'ID'.padEnd(20)} ${'RESTARTS'.padEnd(10)} INFO`)
console.log('─'.repeat(80))

for (const s of sessions) {
  const icon   = statusIcon(s.status)
  const name   = `#${s.channelName}`.padEnd(24)
  const id     = s.channelId.padEnd(20)
  const rc     = String(s.restartCount).padEnd(10)

  let info = ''
  if (s.status === 'running' && s.startedAt) {
    info = `started ${relativeTime(s.startedAt)}`
  } else if (s.status === 'rate_limited' && s.rateLimitedUntil) {
    const retryIn = Math.max(0, Math.floor((s.rateLimitedUntil - Date.now()) / 1000))
    info = `retry in ${retryIn}s`
  } else if (s.lastCrashAt) {
    info = `last crash ${relativeTime(s.lastCrashAt)}`
  }

  console.log(`${icon} ${s.status.padEnd(10)} ${name} ${id} ${rc} ${info}`)
}

console.log('─'.repeat(80))
console.log(`Total: ${sessions.length} session(s)`)
console.log()
console.log('Attach to a session:  tmux attach -t discord-<channel_id>')
console.log('Logs:                 tmux capture-pane -t discord-<channel_id> -p')
