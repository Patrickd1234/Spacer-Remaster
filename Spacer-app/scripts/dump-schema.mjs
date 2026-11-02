// Writes a read-only snapshot of the live database schema to supabase/schema/schema.sql.
//
// `supabase db dump` needs Docker, so this rebuilds the DDL from Postgres' own
// catalog through `supabase db query --linked` (Management API, read-only).
// The snapshot is for reading and diffing in git; it is NOT a migration.
//
// Usage: npm run db:schema

import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..")
const OUT_FILE = join(APP_DIR, "supabase", "schema", "schema.sql")

// Each query returns rows with a single `ddl` text column, already in order
const SECTIONS = [
  ["Extensions", `
    select format('-- extension %s (schema %s, version %s)', e.extname, n.nspname, e.extversion) as ddl
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    order by e.extname`],

  ["Enum types", `
    select format('create type public.%I as enum (%s);', t.typname,
      string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)) as ddl
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    group by t.typname order by t.typname`],

  ["Tables", `
    select format(E'create table public.%I (\\n%s\\n);', c.relname, string_agg(
      format('  %I %s%s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
        case when a.attidentity in ('a', 'd') then ' generated ' || case a.attidentity when 'a' then 'always' else 'by default' end || ' as identity' else '' end,
        case when a.attgenerated = 's' then ' generated always as (' || pg_get_expr(d.adbin, d.adrelid) || ') stored'
             when d.adbin is not null then ' default ' || pg_get_expr(d.adbin, d.adrelid) else '' end,
        case when a.attnotnull then ' not null' else '' end),
      E',\\n' order by a.attnum)) as ddl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    group by c.relname order by c.relname`],

  ["Constraints", `
    select format('alter table only public.%I add constraint %I %s;', rel.relname, con.conname, pg_get_constraintdef(con.oid)) as ddl
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
    order by case con.contype when 'p' then 0 when 'u' then 1 when 'c' then 2 else 3 end, rel.relname, con.conname`],

  ["Indexes", `
    select pg_get_indexdef(i.indexrelid) || ';' as ddl
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_class ic on ic.oid = i.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and not exists (select 1 from pg_constraint where conindid = i.indexrelid)
    order by c.relname, ic.relname`],

  ["Views", `
    select format(E'create or replace view public.%I as\\n%s', c.relname, pg_get_viewdef(c.oid)) as ddl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
    order by c.relname`],

  ["Functions", `
    select pg_get_functiondef(p.oid) || ';' as ddl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    order by p.proname, p.oid`],

  ["Function privileges (null acl = default: PUBLIC may execute)", `
    select format('-- %s(%s): %s', p.proname, pg_get_function_identity_arguments(p.oid), coalesce(p.proacl::text, 'null')) as ddl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    order by p.proname, p.oid`],

  ["Triggers (any schema, calling public functions)", `
    select pg_get_triggerdef(t.oid) || ';' as ddl
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace pn on pn.oid = p.pronamespace
    where not t.tgisinternal and pn.nspname = 'public'
    order by n.nspname, c.relname, t.tgname`],

  ["Row level security", `
    select format('alter table public.%I enable row level security;', c.relname)
      || case when c.relforcerowsecurity then format(E'\\nalter table public.%I force row level security;', c.relname) else '' end as ddl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
    order by c.relname`],

  ["Policies (public and storage)", `
    select format('create policy %I on %I.%I as %s for %s to %s%s%s;',
      policyname, schemaname, tablename, lower(permissive), lower(cmd), array_to_string(roles, ', '),
      coalesce(E'\\n  using (' || qual || ')', ''),
      coalesce(E'\\n  with check (' || with_check || ')', '')) as ddl
    from pg_policies
    where schemaname in ('public', 'storage')
    order by schemaname, tablename, policyname`],

  ["Table privileges for API roles", `
    select format('grant %s on public.%I to %I;', string_agg(lower(privilege_type), ', ' order by privilege_type), table_name, grantee) as ddl
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
    group by table_name, grantee order by table_name, grantee`],

  ["Realtime publication", `
    select format('alter publication supabase_realtime add table %I.%I;', schemaname, tablename) as ddl
    from pg_publication_tables where pubname = 'supabase_realtime'
    order by schemaname, tablename`],

  ["Storage buckets", `
    select format('-- bucket %s: public=%s, file_size_limit=%s, allowed_mime_types=%s',
      id, public, coalesce(file_size_limit::text, 'none'), coalesce(allowed_mime_types::text, 'any')) as ddl
    from storage.buckets order by id`],
]

// The Management API occasionally fails a request; retry before giving up
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 3000

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function runQueryOnce(file) {
  // One command string: npx needs a shell on Windows, and the temp path is quoted
  const result = spawnSync(`npx supabase db query --linked -f "${file}"`, {
    cwd: APP_DIR,
    encoding: "utf8",
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  })
  const jsonStart = result.stdout.indexOf("{")
  if (result.status !== 0 || jsonStart < 0) {
    throw new Error(`supabase db query failed (exit ${result.status}):\n${result.stdout}\n${result.stderr}`)
  }
  return JSON.parse(result.stdout.slice(jsonStart)).rows.map((row) => row.ddl)
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

function main() {
  const workDir = mkdtempSync(join(tmpdir(), "spacer-schema-"))
  try {
    const parts = [
      "-- Snapshot of the live Spacer database schema (public + storage policies).",
      "-- Generated by scripts/dump-schema.mjs. Read-only reference: do not run it;",
      "-- change the database with a new file in supabase/migrations instead.",
    ]
    for (const [title, sql] of SECTIONS) {
      process.stdout.write(`  ${title}... `)
      const rows = runQuery(sql, workDir)
      console.log(rows.length)
      parts.push("", `-- ${"=".repeat(70)}`, `-- ${title}`, `-- ${"=".repeat(70)}`, "", rows.join("\n\n"))
    }
    mkdirSync(dirname(OUT_FILE), { recursive: true })
    writeFileSync(OUT_FILE, parts.join("\n") + "\n")
    console.log(`Wrote ${OUT_FILE}`)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

main()
