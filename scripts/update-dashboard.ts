#!/usr/bin/env bun
/**
 * Force a dashboard refresh without waiting for the next health check (30s).
 * Sends a new dashboard message to the dashboard channel.
 *
 * Usage: bun scripts/update-dashboard.ts
 */

import {
  withDiscordClient,
  readStateFile,
  STATE_DIR,
  statusIcon,
  relativeTime,
} from './_lib.ts'
import { GatewayIntentBits, type TextChannel } from 'discord.js'
import { readFileSync } from 'fs'
import { join } from 'path'

const DASHBOARD_CHANNEL = process.env.DISCORD_DASHBOARD_CHANNEL ?? null
const ORCHESTRATOR_CHANNEL = process.env.DISCORD_ORCHESTRATOR_CHANNEL ?? null

const channelId = DASHBOARD_CHANNEL ?? ORCHESTRATOR_CHANNEL

if (!channelId) {
  console.error('DISCORD_DASHBOARD_CHANNEL or DISCORD_ORCHESTRATOR_CHANNEL must be set in .env')
  process.exit(1)
}

const sessions = readStateFile()
const now      = Math.floor(Date.now() / 1000)
const running  = sessions.filter(s => s.status === 'running').length

const lines: string[] = [
  `📊 **Dashboard** — <t:${now}:R>`,
  ``,
  `🤖 **Agents actifs** : ${running} / ${sessions.length}`,
  ``,
]

if (sessions.length === 0) {
  lines.push('  *(aucune session — orchestrateur en cours de démarrage ?)*')
} else {
  for (const s of sessions) {
    const icon  = statusIcon(s.status)
    let info = ''
    if (s.status === 'running' && s.startedAt) {
      info = ` — démarré il y a ${relativeTime(s.startedAt)}`
    } else if (s.status === 'rate_limited' && s.rateLimitedUntil) {
      const retryIn = Math.max(0, Math.floor((s.rateLimitedUntil - Date.now()) / 1000))
      info = ` — retry dans ${retryIn}s`
    } else if (s.lastCrashAt) {
      info = ` — crash il y a ${relativeTime(s.lastCrashAt)}`
    }
    const restarts = s.restartCount > 0 ? ` *(${s.restartCount} restarts)*` : ''
    lines.push(`  ${icon} **#${s.channelName}**${info}${restarts}`)
  }
}

lines.push(``)
lines.push(`⚙️ Mis à jour manuellement via update-dashboard.ts`)

const text = lines.join('\n')

await withDiscordClient(async client => {
  const ch = (await client.channels.fetch(channelId)) as TextChannel
  await ch.send(text)
  console.log(`✅ Dashboard sent to channel ${channelId}`)
}, [GatewayIntentBits.Guilds])
