#!/usr/bin/env bun
/**
 * Archive all agent workspaces to a timestamped .tar.gz backup.
 *
 * Usage:
 *   bun scripts/backup-workspaces.ts           # saves to STATE_DIR/backups/
 *   bun scripts/backup-workspaces.ts <outdir>  # saves to custom directory
 */

import { WORKSPACES_DIR, STATE_DIR } from './_lib.ts'
import { mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const [outdir] = process.argv.slice(2)
const backupsDir = outdir ?? join(STATE_DIR, 'backups')

if (!existsSync(WORKSPACES_DIR)) {
  console.error(`No workspaces directory found at ${WORKSPACES_DIR}`)
  process.exit(1)
}

mkdirSync(backupsDir, { recursive: true })

const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const filename = `workspaces-${ts}.tar.gz`
const outpath  = join(backupsDir, filename)

const proc = Bun.spawn(
  ['tar', '-czf', outpath, '-C', STATE_DIR, 'workspaces'],
  { stdout: 'inherit', stderr: 'inherit' },
)
const code = await proc.exited

if (code !== 0) {
  console.error(`tar failed with exit code ${code}`)
  process.exit(1)
}

const stat = Bun.file(outpath)
const size = (await stat.size / 1024 / 1024).toFixed(2)
console.log(`✅ Backup saved: ${outpath} (${size} MB)`)
