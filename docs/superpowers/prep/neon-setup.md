# Neon setup & tooling reference

> Set up 2026-06-26. How to talk to our Neon Postgres — credentials, CLI, and MCP. For agents/teammates building Tada Web.

## Project coordinates
| Thing | Value |
|---|---|
| Org | **Tada** — `org-sweet-sunset-53740765` |
| Project | `rough-wave-14707909` (region `aws-us-east-2`) |
| Database | `neondb` (owner role `neondb_owner`) — app data |
| Agent-memory DB | `agent_memory` (owner role `agent_memory_owner`) — isolated logical DB, pgvector enabled, empty. Conn string in `.env` as `AGENT_MEMORY_DATABASE_URL`. |
| Default branch | `production` (`br-green-shape-aj1jtzbm`) |
| Postgres | 18.4 (serverless) |
| pgvector | available, **0.8.1** — enable per-DB with `CREATE EXTENSION vector;` |
| Authed CLI user | `seedzpy@gmail.com` |

**Connection string lives in gitignored `.env` as `DATABASE_URL`** — never inline it in code or commit it. `.env.example` holds the placeholder shape. (Security: rotate the role password before launch — it was pasted into a chat transcript. Neon Console → branch → Roles → reset.)

Quick connectivity check:
```bash
source .env && psql "$DATABASE_URL" -tAc "select version();"
```

## `neonctl` CLI (installed: 2.27.1)
Authenticated via browser OAuth (token at `~/.config/neonctl/credentials.json`). **Most list/manage commands need `--org-id org-sweet-sunset-53740765`** (the account has >1 org context, so commands prompt interactively without it).

Commands that matter for us:
```bash
neonctl projects list --org-id org-sweet-sunset-53740765
neonctl branches list  --project-id rough-wave-14707909
neonctl connection-string --project-id rough-wave-14707909            # get a fresh cs (alias: cs)
neonctl branches create --project-id rough-wave-14707909 --name <x>   # branch DB (preview/CI)
neonctl databases list --project-id rough-wave-14707909
neonctl roles list      --project-id rough-wave-14707909
neonctl psql --project-id rough-wave-14707909 -- -c "select 1"        # psql via CLI
```
Full surface: `auth · me · orgs · projects · branches · databases · roles · operations · connection-string · psql · checkout · link · init · data-api · functions · dev · config · deploy · env · buckets · bootstrap · neon-auth · ip-allow · vpc`.

- `neonctl link` / `checkout` pin the directory/branch to a `.neon` context so you can drop the `--project-id` flags.
- `neonctl init` = "initialize a project with Neon using your AI coding assistant" (multi-phase: app wiring + **migrations**). **NOT run** — the repo is greenfield; the architect does app wiring via **Prisma** after scaffold. Don't run it on an empty repo.
- **Neon Auth** (`neonctl neon-auth`) is **not used** — we chose Auth.js (see spec §6). Leave it off.

## Neon MCP server (for agents)
Added to project config `.mcp.json` (committable; no secret in it):
```
neon → https://mcp.neon.tech/mcp  (HTTP, OAuth)
```
**One-time activation:** run `/mcp` in Claude Code → authenticate **neon** in the browser → **restart Claude Code**. Until then its tools are dormant. (API-key alternative: add header `Authorization: Bearer $NEON_API_KEY` from a console key.)

Tools it exposes once connected:
- **Projects/orgs:** `list_projects`, `list_shared_projects`, `describe_project`, `create_project`, `delete_project`, `list_organizations`
- **SQL/data:** `run_sql`, `run_sql_transaction`, `get_database_tables`, `describe_table_schema`, `get_connection_string`
- **Branching:** `create_branch`, `delete_branch`, `list_branch_computes`
- **Migrations (safe pattern):** `prepare_database_migration` (applies on a temp branch first) → verify → `complete_database_migration` (applies to main)
- **Perf tuning:** `list_slow_queries`, `explain_sql_statement`, `prepare_query_tuning`, `complete_query_tuning`
- **Auth:** `provision_neon_auth` — ignore (we use Auth.js)

**Schema/migration policy for v0:** Prisma owns the schema and migrations (provider-neutral; see spec §6). Use the MCP/`run_sql` tools for inspection, ad-hoc queries, and **branch-per-preview**, not as the migration system of record.
