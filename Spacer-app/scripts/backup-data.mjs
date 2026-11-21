// Saves a read-only copy of every row in the live database's public tables to
// supabase/backups/<timestamp>/<table>.json, one file per table.
//
// `supabase db dump` needs Docker, so this reads each table through
// `supabase db query --remote --read-only` (Management API). Pair it with
// `npm run db:schema` for the structure. The backup folder is git-ignored:
// it holds real user data and must stay on this computer.
//
// Usage: npm run db:backup
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..")
// The project `supabase link` saved; read-only so these scripts can never change the database
const PROJECT_REF = JSON.parse(readFileSync(join(APP_DIR, "supabase", ".temp", "linked-project.json"), "utf8")).ref
const BACKUP_ROOT = join(APP_DIR, "supabase", "backups")
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 2000
const SAFE_TABLE_NAME = /^[a-z_][a-z0-9_]*$/

const LIST_TABLES_SQL = `
  select c.relname as name
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
  order by c.relname`

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function runQueryOnce(file) {
  // One command string: npx needs a shell on Windows, and the temp path is quoted
  const result = spawnSync(`npx supabase db query --remote=${PROJECT_REF} --read-only -f "${file}"`, {
    cwd: APP_DIR,
    encoding: "utf8",
    shell: true,
    maxBuffer: 256 * 1024 * 1024,
  })
  const jsonStart = result.stdout.indexOf("{")
  if (result.status !== 0 || jsonStart < 0) {
    throw new Error(`supabase db query failed (exit ${result.status}):\n${result.stdout}\n${result.stderr}`)
  }
  return JSON.parse(result.stdout.slice(jsonStart)).rows
}

function runQuery(sql, workDir) {
  const file = join(workDir, "query.sql")
  writeFileSync(file, sql)
  for (let attempt = 1; ; attempt++) {
    try {
      return runQueryOnce(file)
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) throw error
      sleepSync(RETRY_DELAY_MS * attempt)
    }
  }
}

function tableRowsSql(table) {
  if (!SAFE_TABLE_NAME.test(table)) throw new Error(`Unexpected table name: ${table}`)
  return `select coalesce(json_agg(t), '[]'::json) as data from public."${table}" t`
}

function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const outDir = join(BACKUP_ROOT, stamp)
  const workDir = mkdtempSync(join(tmpdir(), "spacer-backup-"))
  try {
    const tables = runQuery(LIST_TABLES_SQL, workDir).map((row) => row.name)
    mkdirSync(outDir, { recursive: true })
    let totalRows = 0
    for (const table of tables) {
      process.stdout.write(`  ${table}... `)
      const [{ data }] = runQuery(tableRowsSql(table), workDir)
      const rows = typeof data === "string" ? JSON.parse(data) : data
      writeFileSync(join(outDir, `${table}.json`), JSON.stringify(rows, null, 2) + "\n")
      totalRows += rows.length
      console.log(rows.length)
    }
    console.log(`Backed up ${tables.length} tables, ${totalRows} rows, to ${outDir}`)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

main()
