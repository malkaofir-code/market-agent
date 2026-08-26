// ─────────────────────────────────────────────────────────────
// ingest.js — channel -> plain rows. No database knowledge here;
// run.js decides where they go. A short fetch per run beats a
// long-lived listener: nothing to supervise, and tg_id UNIQUE makes
// re-fetching the same messages free.
// ─────────────────────────────────────────────────────────────
import { connect } from './tg.js';
import 'dotenv/config';

const CHANNEL = process.env.TG_SOURCE_CHANNEL;

const toRow = m => {
  if (!m?.id) return null;
  const text = m.message ?? m.text ?? '';
  if (!text.trim() && !m.media) return null;
  return { tg_id: Number(m.id), ts: Number(m.date), text, has_media: !!m.media };
};

/** The most recent `limit` messages from the source channel. */
export async function fetchRecent(limit = 80) {
  if (!CHANNEL) throw new Error('TG_SOURCE_CHANNEL missing from .env');
  const client = await connect();
  await client.connect();
  try {
    const entity = await client.getEntity(CHANNEL);
    const msgs = await client.getMessages(entity, { limit });
    return msgs.map(toRow).filter(Boolean);
  } finally {
    await client.disconnect();
  }
}

// `node src/ingest.js [limit]` — one-off pull, for backfilling.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { putMessages, close } = await import('./db.js');
  const rows = await fetchRecent(Number(process.argv[2] || 200));
  await putMessages(rows);
  console.log(`stored ${rows.length} message(s)`);
  await close();
}
