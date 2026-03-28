/**
 * Shared helpers for claude-discord-multi-agent scripts.
 * All scripts import from here to avoid duplicating config/client setup.
 */

import { Client, GatewayIntentBits } from 'discord.js'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

// ─── Config ──────────────────────────────────────────────────────────────────

export const STATE_DIR =
  process.env.DISCORD_STATE_DIR ??
  join(homedir(), '.claude', 'channels', 'discord')

export const ENV_FILE        = join(STATE_DIR, '.env')
export const ACCESS_FILE     = join(STATE_DIR, 'access.json')
export const STATE_FILE      = join(STATE_DIR, 'orchestrator-state.json')
export const WORKSPACES_DIR  = join(STATE_DIR, 'workspaces')

// Load .env into process.env (real env wins).
export function loadEnv(): void {
  try {
    for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const m = line.match(/^(\w+)=(.*)$/)
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
    }
  } catch {}
}

loadEnv()

export const TOKEN = process.env.DISCORD_BOT_TOKEN

export function requireToken(): string {
  if (!TOKEN) {
    console.error(`Error: DISCORD_BOT_TOKEN required\n  Set in ${ENV_FILE}`)
    process.exit(1)
  }
  return TOKEN
}

// ─── .env writer ─────────────────────────────────────────────────────────────

/** Update or add a key=value line in the .env file. */
export function setEnvValue(key: string, value: string): void {
  mkdirSync(STATE_DIR, { recursive: true })
  let content = ''
  try { content = readFileSync(ENV_FILE, 'utf8') } catch {}
  const lines = content.split('\n').filter(Boolean)
  const idx = lines.findIndex(l => l.startsWith(`${key}=`))
  if (idx >= 0) {
    lines[idx] = `${key}=${value}`
  } else {
    lines.push(`${key}=${value}`)
  }
  writeFileSync(ENV_FILE, lines.join('\n') + '\n', { mode: 0o600 })
}

// ─── Access file ─────────────────────────────────────────────────────────────

export type GroupPolicy = { requireMention: boolean; allowFrom: string[] }
export type AccessFile  = {
  dmPolicy?: string
  allowFrom?: string[]
  groups?: Record<string, GroupPolicy>
  pending?: Record<string, unknown>
}

export function readAccessFile(): AccessFile {
  try { return JSON.parse(readFileSync(ACCESS_FILE, 'utf8')) as AccessFile } catch { return {} }
}

export function writeAccessFile(a: AccessFile): void {
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(ACCESS_FILE, JSON.stringify(a, null, 2) + '\n')
}

// ─── State file ───────────────────────────────────────────────────────────────

export type SessionStatus = 'running' | 'crashed' | 'restarting' | 'stopped' | 'rate_limited'

export type Session = {
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

export function readStateFile(): Session[] {
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Session[] } catch { return [] }
}

export function writeStateFile(sessions: Session[]): void {
  mkdirSync(STATE_DIR, { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify(sessions, null, 2) + '\n')
}

// ─── Discord client factory ──────────────────────────────────────────────────

/** Create a minimal Discord client, login, wait for ready, then call fn(client). */
export async function withDiscordClient(
  fn: (client: Client) => Promise<void>,
  intents: number[] = [GatewayIntentBits.Guilds],
): Promise<void> {
  const token = requireToken()
  const client = new Client({ intents })
  await new Promise<void>((resolve, reject) => {
    client.once('ready', () => resolve())
    client.once('error', reject)
    client.login(token).catch(reject)
  })
  try {
    await fn(client)
  } finally {
    client.destroy()
  }
}

// ─── Tmux helpers ─────────────────────────────────────────────────────────────

export function tmuxName(channelId: string): string {
  return `discord-${channelId}`
}

export async function tmuxHasSession(name: string): Promise<boolean> {
  const proc = Bun.spawn(['tmux', 'has-session', '-t', name], {
    stdout: 'ignore', stderr: 'ignore',
  })
  return (await proc.exited) === 0
}

export async function tmuxKill(name: string): Promise<boolean> {
  const proc = Bun.spawn(['tmux', 'kill-session', '-t', name], {
    stdout: 'ignore', stderr: 'ignore',
  })
  return (await proc.exited) === 0
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function statusIcon(s: SessionStatus): string {
  return (
    s === 'running'      ? '✅' :
    s === 'restarting'   ? '🔄' :
    s === 'rate_limited' ? '⏳' :
    s === 'crashed'      ? '💥' : '⬛'
  )
}

export function relativeTime(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60)  return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}
