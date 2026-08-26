// ─────────────────────────────────────────────────────────────
// migrate.js — one-off: local state.db -> Supabase Postgres.
// Run once from the machine that has state.db. Idempotent.
//   node src/migrate.js
// ─────────────────────────────────────────────────────────────
import { existsSync } from 'fs';
import { putMessages, close, pool } from './db.js';

if (!existsSync('./state.db')) {
  console.error('no ./state.db here — nothing to migrate'); process.exit(1);
}
const { default: Database } = await import('better-sqlite3');
const lite = new Database('./state.db', { readonly: true });

const msgs = lite.prepare('SELECT tg_id, ts, text, has_media, consumed_by FROM messages').all();
console.log(`found ${msgs.length} message(s) locally`);

for (let i = 0; i < msgs.length; i += 250) {
  const batch = msgs.slice(i, i + 250);
  await putMessages(batch.map(m => ({
    tg_id: Number(m.tg_id), ts: Number(m.ts), text: m.text, has_media: !!m.has_media,
  })));
  const consumed = batch.filter(m => m.consumed_by);
  for (const m of consumed) {
    await pool.query('update agent.messages set consumed_by=$1 where tg_id=$2',
      [m.consumed_by, Number(m.tg_id)]);
  }
  console.log(`  ${Math.min(i + 250, msgs.length)}/${msgs.length}`);
}

// Windows too, so the rails keep their memory of what already posted.
const wins = lite.prepare('SELECT key,start_ts,end_ts,status,slides,error,posted_at FROM windows').all();
for (const w of wins) {
  await pool.query(
    `insert into agent.windows (key,start_ts,end_ts,status,slides,error,posted_at)
     values ($1,$2,$3,$4,$5,$6,$7) on conflict (key) do nothing`,
    [w.key, w.start_ts, w.end_ts, w.status, w.slides, w.error, w.posted_at]);
}
console.log(`migrated ${wins.length} window row(s)`);

const { rows } = await pool.query('select count(*)::int n from agent.messages');
console.log(`Postgres now holds ${rows[0].n} message(s)`);
await close();
