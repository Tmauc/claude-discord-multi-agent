#!/usr/bin/env bun
/**
 * Discord Orchestrator — auto-spawns Claude Code sessions per Discord channel.
 *
 * Usage: bun orchestrator.ts
 *
 * Config (env vars, or ~/.claude/channels/discord/.env):
 *   DISCORD_BOT_TOKEN              required — same token as server.ts
 *   DISCORD_ORCHESTRATOR_CHANNEL   channel ID where Claude agent manages sessions
 *   DISCORD_DASHBOARD_CHANNEL      channel ID for the live-edited dashboard message
 *   DISCORD_LOGS_CHANNEL           channel ID for session event logs
 *   DISCORD_CHANNEL_PREFIX         name prefix to watch (default: "claude-")
 *   DISCORD_CATEGORY_ID            watch all channels in this category ID (overrides prefix)
 *   DISCORD_EXCLUDE_CHANNELS       comma-separated channel IDs to never spawn (auto-includes the 3 special channels)
 *   DISCORD_MAX_SESSIONS           max concurrent sessions (default: 10)
 *   DISCORD_AGENT_WORKDIR          working directory for spawned Claude sessions (default: $HOME)
 *   DISCORD_STATE_DIR              state dir (default: ~/.claude/channels/discord)
 *   CLAUDE_BIN                     claude binary path (default: "claude")
 *   CLAUDE_FLAGS                   extra flags (default: "--dangerously-skip-permissions")
 */

import {
  Client,
  GatewayIntentBits,
  ChannelType,
  type TextChannel,
  type NonThreadGuildBasedChannel,
} from 'discord.js'
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

// ─── Config ─────────────────────────────────────────────────────────────────

const STATE_DIR =
  process.env.DISCORD_STATE_DIR ??
  join(homedir(), '.claude', 'channels', 'discord')
const ENV_FILE = join(STATE_DIR, '.env')

try {
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^(\w+)=(.*)$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
} catch {}

const TOKEN = process.env.DISCORD_BOT_TOKEN
if (!TOKEN) {
  process.stderr.write(
    'orchestrator: DISCORD_BOT_TOKEN required\n' +
    `  set in ${ENV_FILE}\n`,
  )
  process.exit(1)
}

const ORCHESTRATOR_CHANNEL = process.env.DISCORD_ORCHESTRATOR_CHANNEL ?? null
const DASHBOARD_CHANNEL    = process.env.DISCORD_DASHBOARD_CHANNEL    ?? null
const LOGS_CHANNEL         = process.env.DISCORD_LOGS_CHANNEL         ?? null

const CHANNEL_PREFIX = process.env.DISCORD_CHANNEL_PREFIX ?? 'claude-'
const CATEGORY_ID    = process.env.DISCORD_CATEGORY_ID    ?? null
const MAX_SESSIONS   = parseInt(process.env.DISCORD_MAX_SESSIONS ?? '10', 10)
const CLAUDE_BIN      = process.env.CLAUDE_BIN ?? 'claude'
const CLAUDE_FLAGS    = (process.env.CLAUDE_FLAGS ?? '--dangerously-skip-permissions')
  .split(' ')
  .filter(Boolean)

// Channels that must never get a spawned session via the auto-scan.
// The orchestrator channel is spawned explicitly in ready().
const RESERVED: Set<string> = new Set([
  ORCHESTRATOR_CHANNEL,
  DASHBOARD_CHANNEL,
  LOGS_CHANNEL,
  ...(process.env.DISCORD_EXCLUDE_CHANNELS ?? '').split(',').map(s => s.trim()),
].filter((x): x is string => Boolean(x)))

const STATE_FILE     = join(STATE_DIR, 'orchestrator-state.json')
const DASHBOARD_FILE = join(STATE_DIR, 'orchestrator-dashboard.json')
const ACCESS_FILE    = join(STATE_DIR, 'access.json')
const WORKSPACES_DIR = join(STATE_DIR, 'workspaces')

// ─── Access helpers ──────────────────────────────────────────────────────────

type GroupPolicy = { requireMention: boolean; allowFrom: string[] }
type AccessFile  = { dmPolicy?: string; allowFrom?: string[]; groups?: Record<string, GroupPolicy>; pending?: Record<string, unknown> }

function readAccessFile(): AccessFile {
  try { return JSON.parse(readFileSync(ACCESS_FILE, 'utf8')) as AccessFile } catch { return {} }
}

function writeAccessFile(a: AccessFile): void {
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(ACCESS_FILE, JSON.stringify(a, null, 2) + '\n')
}

function registerChannelAccess(channelId: string): void {
  const a = readAccessFile()
  a.groups ??= {}
  if (!a.groups[channelId]) {
    a.groups[channelId] = { requireMention: false, allowFrom: [] }
    writeAccessFile(a)
    process.stderr.write(`orchestrator: registered channel ${channelId} in access.json\n`)
  }
}

function unregisterChannelAccess(channelId: string): void {
  const a = readAccessFile()
  if (a.groups && a.groups[channelId]) {
    delete a.groups[channelId]
    writeAccessFile(a)
    process.stderr.write(`orchestrator: unregistered channel ${channelId} from access.json\n`)
  }
}

// ─── Workspace helpers ───────────────────────────────────────────────────────

function workspaceDir(channelId: string): string {
  return join(WORKSPACES_DIR, channelId)
}

function purgeWorkspace(channelId: string): void {
  const wdir = workspaceDir(channelId)
  try { rmSync(wdir, { recursive: true, force: true }) } catch {}
  process.stderr.write(`orchestrator: purged workspace for ${channelId}\n`)
}

// ─── Orchestrator CLAUDE.md ──────────────────────────────────────────────────

function generateOrchestratorClaudeMd(): string {
  const all = [...sessions.values()].filter(s => s.channelId !== ORCHESTRATOR_CHANNEL)
  const sessionList = all.length === 0
    ? '  (aucune session active)'
    : all.map(s =>
        `  - **#${s.channelName}** (\`${s.channelId}\`) — ${s.status}` +
        (s.restartCount > 0 ? ` — ${s.restartCount} restart(s)` : ''),
      ).join('\n')

  return `# Rôle : Orchestrateur Claude

Tu es l'agent de contrôle d'un système multi-agents Claude Code connecté à Discord.
Chaque salon Discord actif a sa propre session Claude Code isolée avec son propre contexte.

## Tes responsabilités

- Répondre aux questions sur le statut des sessions
- Diagnostiquer les sessions bloquées ou crashées
- Déclencher un restart manuel si nécessaire
- Expliquer l'architecture du système

## Architecture

- **Orchestrateur Bun** — spawne et surveille les sessions Claude
- **State file** : \`${STATE_FILE}\`
- **Workspaces** : \`${WORKSPACES_DIR}/<channelId>/\` — contexte Claude par session (persisté)
- **Access** : \`${ACCESS_FILE}\` — contrôle d'accès Discord

## Commandes utiles

### Statut live des sessions
\`\`\`bash
cat '${STATE_FILE}'
\`\`\`

### Voir les logs d'une session
\`\`\`bash
tmux capture-pane -t discord-<channelId> -p
\`\`\`

### Attacher une session
\`\`\`bash
tmux attach -t discord-<channelId>
\`\`\`

### Restart manuel d'une session bloquée
\`\`\`bash
tmux kill-session -t discord-<channelId>
\`\`\`
Le health monitor Bun détecte la disparition et respawn automatiquement avec \`--continue\`.

### Lister les tmux sessions actives
\`\`\`bash
tmux list-sessions
\`\`\`

## Sessions au démarrage de ce contexte

${sessionList}

## Scripts disponibles

Tous dans le répertoire du projet — utilise-les via Bash :

| Script | Usage | Description |
|--------|-------|-------------|
| \`list-sessions.ts\` | \`bun scripts/list-sessions.ts\` | Statut de toutes les sessions |
| \`list-access.ts\` | \`bun scripts/list-access.ts\` | Qui a accès à quoi |
| \`create-channel.ts\` | \`bun scripts/create-channel.ts <nom>\` | Créer un nouveau canal agent |
| \`stop-session.ts\` | \`bun scripts/stop-session.ts <channel-id>\` | Arrêter une session |
| \`restart-session.ts\` | \`bun scripts/restart-session.ts <channel-id>\` | Forcer un restart |
| \`cleanup-session.ts\` | \`bun scripts/cleanup-session.ts <channel-id>\` | Supprimer session + workspace |
| \`add-user.ts\` | \`bun scripts/add-user.ts <user-id> [channel-id]\` | Ajouter un utilisateur |
| \`remove-user.ts\` | \`bun scripts/remove-user.ts <user-id> [channel-id]\` | Retirer un utilisateur |
| \`backup-workspaces.ts\` | \`bun scripts/backup-workspaces.ts\` | Archiver les workspaces |
| \`update-dashboard.ts\` | \`bun scripts/update-dashboard.ts\` | Forcer refresh du dashboard |
| \`check-permissions.ts\` | \`bun scripts/check-permissions.ts\` | Vérifier permissions du bot |
| \`invite-url.ts\` | \`bun scripts/invite-url.ts\` | Générer URL d'invitation |
| \`setup-server.ts\` | \`bun scripts/setup-server.ts [guild-id]\` | Setup initial d'un serveur |

## Règles importantes

- Utilise les scripts ci-dessus plutôt que de modifier \`access.json\` directement.
- Un restart via \`bun scripts/restart-session.ts\` ou \`tmux kill-session\` est sûr : le workspace est préservé, la session reprend avec \`--continue\`.
- Le seul moment où le contexte d'une session est perdu : suppression du salon Discord (ou \`cleanup-session.ts\`).
`
}

// ─── Rate limit detection ────────────────────────────────────────────────────

const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /too many requests/i,
  /overloaded/i,
  /rate_limit_error/i,
  /overloaded_error/i,
]

// Patterns to extract wait duration from Claude's error message.
const RETRY_AFTER_PATTERNS: Array<[RegExp, number]> = [
  [/(\d+)\s*hour/i,   3_600_000],
  [/(\d+)\s*minute/i,    60_000],
  [/(\d+)\s*second/i,     1_000],
]

// Base fallback delay: 10 min, doubles each unresolved attempt.
const RATE_LIMIT_BASE_MS = 10 * 60_000

async function tmuxCapturePane(name: string, lines = 10): Promise<string> {
  const proc = Bun.spawn(['tmux', 'capture-pane', '-t', name, '-p', '-S', `-${lines}`], {
    stdout: 'pipe',
    stderr: 'ignore',
  })
  await proc.exited
  return await new Response(proc.stdout).text()
}

function parseRateLimitDelay(output: string, attempt: number): number {
  for (const [pat, msPerUnit] of RETRY_AFTER_PATTERNS) {
    const m = output.match(pat)
    if (m) return parseInt(m[1]) * msPerUnit
  }
  // No duration found — exponential backoff starting at 10 min.
  return RATE_LIMIT_BASE_MS * Math.pow(2, attempt)
}

async function tmuxSendEnter(name: string): Promise<void> {
  const proc = Bun.spawn(['tmux', 'send-keys', '-t', name, '', 'Enter'], {
    stdout: 'ignore',
    stderr: 'ignore',
  })
  await proc.exited
}

// ─── Session registry ────────────────────────────────────────────────────────

type SessionStatus = 'running' | 'crashed' | 'restarting' | 'stopped' | 'rate_limited'

type Session = {
  channelId: string
  channelName: string
  status: SessionStatus
  startedAt: number
  restartCount: number
  lastCrashAt: number | null
  tmuxSession: string
  rateLimitCount: number
  rateLimitedUntil: number | null
}

const sessions = new Map<string, Session>()

// Backoff: 5s → 15s → 30s → 60s → 5min
const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 300_000]

function backoffMs(restartCount: number): number {
  return BACKOFF_MS[Math.min(restartCount, BACKOFF_MS.length - 1)]
}

function tmuxName(channelId: string): string {
  return `discord-${channelId}`
}

function saveState(): void {
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify([...sessions.values()], null, 2) + '\n')
}

// ─── Tmux helpers ────────────────────────────────────────────────────────────

async function tmuxHasSession(name: string): Promise<boolean> {
  const proc = Bun.spawn(['tmux', 'has-session', '-t', name], {
    stdout: 'ignore',
    stderr: 'ignore',
  })
  return (await proc.exited) === 0
}

async function tmuxKill(name: string): Promise<void> {
  const proc = Bun.spawn(['tmux', 'kill-session', '-t', name], {
    stdout: 'ignore',
    stderr: 'ignore',
  })
  await proc.exited
}

async function tmuxSpawn(name: string, channelId: string, workdir: string, resume: boolean): Promise<boolean> {
  const resumeFlags = resume ? ['--continue'] : []
  const proc = Bun.spawn(
    [
      'tmux', 'new-session', '-d',
      '-s', name,
      '-c', workdir,
      '-e', `DISCORD_CHANNEL_FILTER=${channelId}`,
      '--',
      CLAUDE_BIN, ...CLAUDE_FLAGS, ...resumeFlags, '--channels', 'plugin:discord@claude-plugins-official',
    ],
    { stdout: 'ignore', stderr: 'pipe' },
  )
  return (await proc.exited) === 0
}

// ─── Session lifecycle ───────────────────────────────────────────────────────

async function startSession(channelId: string, channelName: string): Promise<void> {
  const name = tmuxName(channelId)
  if (await tmuxHasSession(name)) await tmuxKill(name)

  // Workspace existence determines whether to resume or start fresh.
  const wdir = workspaceDir(channelId)
  const resume = existsSync(wdir)
  mkdirSync(wdir, { recursive: true })

  // Regenerate orchestrator context on every (re)start.
  if (channelId === ORCHESTRATOR_CHANNEL) {
    writeFileSync(join(wdir, 'CLAUDE.md'), generateOrchestratorClaudeMd())
  }

  const existing = sessions.get(channelId)
  const session: Session = {
    channelId,
    channelName,
    status: 'running',
    startedAt: Date.now(),
    restartCount: existing?.restartCount ?? 0,
    lastCrashAt: existing?.lastCrashAt ?? null,
    tmuxSession: name,
    rateLimitCount: existing?.rateLimitCount ?? 0,
    rateLimitedUntil: null,
  }
  sessions.set(channelId, session)
  saveState()

  registerChannelAccess(channelId)

  const ok = await tmuxSpawn(name, channelId, wdir, resume)
  if (!ok) {
    session.status = 'crashed'
    session.lastCrashAt = Date.now()
    saveState()
    await logEvent(`❌ Impossible de démarrer **#${channelName}** (tmux failed)`)
    return
  }

  const verb = resume ? '🔄 reprise' : '🟢 démarrée'
  await logEvent(
    `${verb} Session **#${channelName}**\n` +
    `   \`tmux attach -t ${name}\``,
  )
  updateDashboard().catch(() => {})
}

async function stopSession(channelId: string, reason?: string, purge = false): Promise<void> {
  const s = sessions.get(channelId)
  if (!s) return
  s.status = 'stopped'
  saveState()
  await tmuxKill(s.tmuxSession)
  unregisterChannelAccess(channelId)
  if (purge) purgeWorkspace(channelId)
  await logEvent(`🔴 Session **#${s.channelName}** arrêtée${reason ? ` — ${reason}` : ''}`)
  updateDashboard().catch(() => {})
}

async function scheduleRestart(channelId: string): Promise<void> {
  const s = sessions.get(channelId)
  if (!s || s.status === 'stopped') return

  const delay = backoffMs(s.restartCount)
  s.status = 'restarting'
  s.lastCrashAt = Date.now()
  saveState()

  await logEvent(
    `⚠️ Session **#${s.channelName}** crash détecté\n` +
    `   Restart dans ${delay / 1000}s (tentative #${s.restartCount + 1})`,
  )
  updateDashboard().catch(() => {})

  setTimeout(async () => {
    const current = sessions.get(channelId)
    if (!current || current.status === 'stopped') return
    current.restartCount++
    await startSession(channelId, current.channelName)
  }, delay)
}

// ─── Health monitor ──────────────────────────────────────────────────────────

async function handleRateLimit(channelId: string): Promise<void> {
  const s = sessions.get(channelId)
  if (!s) return

  const pane = await tmuxCapturePane(s.tmuxSession)
  const delay = parseRateLimitDelay(pane, s.rateLimitCount)
  const mins = Math.round(delay / 60_000)

  s.status = 'rate_limited'
  s.rateLimitCount++
  s.rateLimitedUntil = Date.now() + delay
  saveState()

  await logEvent(
    `⏳ Session **#${s.channelName}** rate limitée\n` +
    `   Enter automatique dans ${mins < 60 ? `${mins}min` : `${Math.round(mins / 60)}h`} (tentative #${s.rateLimitCount})`,
  )
  updateDashboard().catch(() => {})

  setTimeout(async () => {
    const current = sessions.get(channelId)
    if (!current || current.status === 'stopped') return

    // Check if tmux is still alive; if not, fall back to a normal restart.
    const alive = await tmuxHasSession(current.tmuxSession)
    if (!alive) {
      current.rateLimitedUntil = null
      await scheduleRestart(channelId)
      return
    }

    current.status = 'running'
    current.rateLimitedUntil = null
    saveState()

    await tmuxSendEnter(current.tmuxSession)
    await logEvent(`🔁 Session **#${current.channelName}** — Enter envoyé (retry rate limit)`)
    updateDashboard().catch(() => {})
  }, delay)
}

async function healthCheck(): Promise<void> {
  for (const [channelId, session] of sessions) {
    if (session.status === 'rate_limited') {
      // Still in wait window — check tmux is alive; restart if it crashed during wait.
      const alive = await tmuxHasSession(session.tmuxSession)
      if (!alive) {
        session.rateLimitedUntil = null
        await scheduleRestart(channelId)
      }
      continue
    }

    if (session.status !== 'running') continue

    const alive = await tmuxHasSession(session.tmuxSession)
    if (!alive) {
      await scheduleRestart(channelId)
      continue
    }

    // Scan only the last 10 lines for rate limit prompts.
    // Limiting to recent output avoids false positives from old Discord
    // history messages that may contain "rate limit" text from past events.
    const pane = await tmuxCapturePane(session.tmuxSession)
    if (RATE_LIMIT_PATTERNS.some(p => p.test(pane))) {
      await handleRateLimit(channelId)
    }
  }
  updateDashboard().catch(() => {})
}

// ─── Log channel (event stream) ──────────────────────────────────────────────

async function logEvent(text: string): Promise<void> {
  process.stderr.write(`orchestrator: ${text.replace(/\*\*/g, '').replace(/`/g, '')}\n`)
  const channelId = LOGS_CHANNEL ?? ORCHESTRATOR_CHANNEL
  if (!channelId) return
  try {
    const ch = (await client.channels.fetch(channelId)) as TextChannel
    await ch.send(text)
  } catch (err) {
    process.stderr.write(`orchestrator: logEvent send failed: ${err}\n`)
  }
}

// ─── Dashboard (live-edited pinned message) ──────────────────────────────────

let dashboardMessageId: string | null = null

try {
  const d = JSON.parse(readFileSync(DASHBOARD_FILE, 'utf8'))
  dashboardMessageId = d.messageId ?? null
} catch {}

function saveDashboardMeta(messageId: string): void {
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(DASHBOARD_FILE, JSON.stringify({ messageId }) + '\n')
}

function renderDashboard(): string {
  const now = Math.floor(Date.now() / 1000)
  const all = [...sessions.values()]
  const running = all.filter(s => s.status === 'running').length

  const lines: string[] = [
    `📊 **Dashboard** — <t:${now}:R>`,
    ``,
    `🤖 **Agents actifs** : ${running} / ${all.length} (max ${MAX_SESSIONS})`,
    ``,
  ]

  if (all.length === 0) {
    lines.push('  *(aucune session)*')
  } else {
    for (const s of all) {
      const icon =
        s.status === 'running'      ? '✅' :
        s.status === 'restarting'   ? '🔄' :
        s.status === 'rate_limited' ? '⏳' :
        s.status === 'crashed'      ? '💥' : '⬛'
      const label = s.channelId === ORCHESTRATOR_CHANNEL ? `🎛️ **#${s.channelName}**` : `**#${s.channelName}**`
      const since =
        s.status === 'running'
          ? ` — depuis <t:${Math.floor(s.startedAt / 1000)}:R>`
          : s.status === 'rate_limited' && s.rateLimitedUntil
          ? ` — retry <t:${Math.floor(s.rateLimitedUntil / 1000)}:R>`
          : s.lastCrashAt
          ? ` — crash <t:${Math.floor(s.lastCrashAt / 1000)}:R>`
          : ''
      const restarts = s.restartCount > 0 ? ` *(${s.restartCount} restart)*` : ''
      lines.push(`  ${icon} ${label}${since}${restarts}`)
    }
  }

  lines.push(``)
  lines.push(
    `⚙️ ${CATEGORY_ID ? `Catégorie \`${CATEGORY_ID}\`` : `Préfixe \`${CHANNEL_PREFIX}\``}` +
    ` | \`tmux attach -t discord-<channel_id>\``,
  )

  return lines.join('\n')
}

async function updateDashboard(): Promise<void> {
  const channelId = DASHBOARD_CHANNEL ?? ORCHESTRATOR_CHANNEL
  if (!channelId) return
  try {
    const ch = (await client.channels.fetch(channelId)) as TextChannel
    const text = renderDashboard()

    if (dashboardMessageId) {
      try {
        const msg = await ch.messages.fetch(dashboardMessageId)
        await msg.edit(text)
        return
      } catch {
        dashboardMessageId = null
      }
    }

    const sent = await ch.send(text)
    dashboardMessageId = sent.id
    saveDashboardMeta(sent.id)
    try { await sent.pin() } catch {}
  } catch (err) {
    process.stderr.write(`orchestrator: dashboard update failed: ${err}\n`)
  }
}

// ─── Channel matching ────────────────────────────────────────────────────────

function shouldSpawn(channelId: string, channelName: string, categoryId: string | null): boolean {
  if (RESERVED.has(channelId)) return false
  if (CATEGORY_ID) return categoryId === CATEGORY_ID
  return channelName.startsWith(CHANNEL_PREFIX)
}

// ─── Discord client ──────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})

client.on('channelCreate', async channel => {
  if (channel.isDMBased() || !channel.isTextBased()) return
  if (channel.type === ChannelType.GuildCategory || channel.isThread()) return

  const ch = channel as NonThreadGuildBasedChannel
  const name  = 'name'     in ch ? (ch.name     as string)        : ''
  const catId = 'parentId' in ch ? (ch.parentId as string | null) : null
  if (!shouldSpawn(channel.id, name, catId)) return

  if (sessions.size >= MAX_SESSIONS) {
    await logEvent(`❌ Max sessions (${MAX_SESSIONS}) atteint — **#${name}** ignoré`)
    return
  }

  await startSession(channel.id, name)
})

client.on('channelDelete', async channel => {
  if (!sessions.has(channel.id)) return
  // purge = true: channel deleted = lose context intentionally
  await stopSession(channel.id, 'salon supprimé', true)
})

client.on('error', err => {
  process.stderr.write(`orchestrator: client error: ${err}\n`)
})

client.once('ready', async c => {
  process.stderr.write(`orchestrator: ready as ${c.user.tag}\n`)
  mkdirSync(STATE_DIR, { recursive: true })
  mkdirSync(WORKSPACES_DIR, { recursive: true })

  if (ORCHESTRATOR_CHANNEL) {
    try {
      const ch = (await client.channels.fetch(ORCHESTRATOR_CHANNEL)) as TextChannel
      await ch.send(
        `🤖 **Orchestrateur démarré** — ${c.user.tag}\n` +
        `Écoute : ${CATEGORY_ID ? `catégorie \`${CATEGORY_ID}\`` : `préfixe \`${CHANNEL_PREFIX}\``}` +
        ` | Max : ${MAX_SESSIONS} sessions`,
      )
    } catch {}
  }

  // Scan existing matching channels.
  let spawned = 0
  for (const guild of c.guilds.cache.values()) {
    const channels = await guild.channels.fetch()
    for (const [id, ch] of channels) {
      if (!ch || ch.isDMBased() || !ch.isTextBased()) continue
      if (ch.type === ChannelType.GuildCategory || ch.isThread()) continue
      const name  = 'name'     in ch ? (ch.name     as string)        : ''
      const catId = 'parentId' in ch ? (ch.parentId as string | null) : null
      if (!shouldSpawn(id, name, catId)) continue
      if (sessions.size >= MAX_SESSIONS) break

      const existing = sessions.get(id)
      if (existing?.status === 'running' && await tmuxHasSession(existing.tmuxSession)) continue

      await startSession(id, name)
      spawned++
    }
  }

  if (spawned > 0) {
    await logEvent(`🔍 ${spawned} session${spawned > 1 ? 's' : ''} démarrée${spawned > 1 ? 's' : ''} pour les salons existants`)
  }

  // Spawn the orchestrator's own Claude session.
  if (ORCHESTRATOR_CHANNEL) {
    await startSession(ORCHESTRATOR_CHANNEL, 'orchestrateur')
  }

  await updateDashboard()
  setInterval(healthCheck, 30_000)
})

// ─── Graceful shutdown ───────────────────────────────────────────────────────

async function shutdown(): Promise<void> {
  process.stderr.write('orchestrator: shutting down\n')
  for (const s of sessions.values()) {
    // purge = false: keep workspaces so sessions resume on next boot
    if (s.status !== 'stopped') await stopSession(s.channelId, undefined, false)
  }
  client.destroy()
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown() })
process.on('SIGINT',  () => { void shutdown() })
process.on('unhandledRejection', err => {
  process.stderr.write(`orchestrator: unhandled rejection: ${err}\n`)
})

// ─── Boot ────────────────────────────────────────────────────────────────────

client.login(TOKEN).catch(err => {
  process.stderr.write(`orchestrator: login failed: ${err}\n`)
  process.exit(1)
})
