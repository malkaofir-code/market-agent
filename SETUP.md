# Moving off the laptop — do these in order

The laptop version worked, but macOS sleep meant launchd coalesced
every missed tick into one run on wake. State now lives in Supabase
Postgres and the schedule lives in GitHub Actions, so nothing depends
on this machine being awake.

Windows are **hourly** now, not 15-minute — that fits the free Actions
tier and makes richer decks (~10-12 messages instead of ~4).

---

## 1 · Stop the launchd jobs

```bash
cd ~/market-agent
./scripts/uninstall.sh
```

## 2 · Create the tables

Supabase dashboard → **SQL Editor** → New query → paste all of
`sql/schema.sql` → **Run**. It creates an `agent` schema, so it cannot
collide with anything else in the project.

## 3 · Get the database URL

Supabase → **Project Settings → Database → Connection string → URI**.

Use the **pooler** host (port `6543`), not the direct one — short-lived
runs open and close a connection every time, which is what the pooler
is for. Paste it into `.env` as `SUPABASE_DB_URL`, and put your
database password into the `[YOUR-PASSWORD]` placeholder.

## 4 · Install and migrate

```bash
npm install
node src/migrate.js
```

That copies the 304 messages and the window history out of `state.db`
and into Postgres. Idempotent — safe to re-run.

Verify:

```bash
node src/run.js --dry
```

Should read from Postgres and either compose a deck or explain why not.

## 5 · Push to a PRIVATE GitHub repo

Private matters: `design.html` and `builder.js` are the actual
intellectual property here.

```bash
git init
git add -A
git commit -m "market-agent: telegram -> instagram carousel pipeline"
gh repo create market-agent --private --source=. --push
```

`.gitignore` already excludes `.env`, `state.db`, `out/`, `logs/`.
**Confirm before pushing** that `.env` is not in `git status`.

## 6 · Add the secrets

Repo → **Settings → Secrets and variables → Actions** → New secret,
eight of them. Values are in your `.env`:

| Secret | From |
|---|---|
| `TG_API_ID` | .env |
| `TG_API_HASH` | .env |
| `TG_SESSION` | .env |
| `TG_SOURCE_CHANNEL` | .env |
| `IG_USER_ID` | .env |
| `IG_ACCESS_TOKEN` | .env — seed only; Postgres holds the live one after the first run |
| `SUPABASE_URL` | .env |
| `SUPABASE_SERVICE_KEY` | .env |
| `SUPABASE_DB_URL` | .env (step 3) |

Or from the terminal:

```bash
while IFS='=' read -r k v; do
  case "$k" in TG_API_ID|TG_API_HASH|TG_SESSION|TG_SOURCE_CHANNEL|IG_USER_ID|IG_ACCESS_TOKEN|SUPABASE_URL|SUPABASE_SERVICE_KEY|SUPABASE_DB_URL)
    [ -n "$v" ] && gh secret set "$k" --body "$v" && echo "set $k";; esac
done < .env
```

## 7 · Dry run in Actions

Repo → **Actions → tick → Run workflow**, leave **dry** ticked.

This is the real test: the runner has none of your local files, so it
proves the secrets, the database and the Supabase bucket all work from
outside your machine. It builds the carousel and stops before
publishing.

## 8 · Go live

Once the dry run is green, the hourly schedule takes over by itself —
`cron: '5 4-20 * * *'`, which is 07:05–23:05 Israel time.

To post immediately: **Run workflow** with **dry** unticked.

---

## Running it

- **Logs** — Actions tab, one entry per run
- **Alerts** — Telegram Saved Messages: permalink on success, error on failure
- **Pause** — disable the `tick` workflow in the Actions tab
- **Force a window** — Run workflow with `window: 2026-08-26T08:00`
- **After a failure** — a broken deck's JPEGs upload as a run artifact

## Known limits

- **GitHub cron is not punctual.** 5-20 minutes late is normal, and a
  tick can be skipped under load. Survivable: `run.js` takes the
  OLDEST unconsumed window, not the last one, and retires anything
  older than `MAX_WINDOW_AGE_MIN` rather than posting stale news.
- **~1,020 billed minutes/month** of the free 2,000 for a private repo.
- **Instagram publishing is still unproven.** Everything up to
  `media_publish` is verified; the final call has failed twice
  (`code 4` rate limit, then `code -1`) and never succeeded. Transient
  Meta errors now retry 30s/2m/5m/15m. If it keeps failing, that points
  at the account cooling off rather than the code — the answer would be
  posting less, not more.
- **DST.** Cron is UTC and Israel shifts to UTC+2 in winter, so the
  schedule slides an hour. Harmless: the active-hours guard uses the
  real timezone.
