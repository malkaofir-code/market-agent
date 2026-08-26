// ─────────────────────────────────────────────────────────────
// ingest.js — channel -> plain rows. No database knowledge here;
// run.js decides where they go. A short fetch per run beats a
// long-lived listener: nothing to supervise, and tg_id UNIQUE makes
// re-fetching the same messages free.
// ─────────────────────────────────────────────────────────────
import { connect } from './tg.js';
import { harvest } from './media.js';
import 'dotenv/config';

const CHANNEL = process.env.TG_SOURCE_CHANNEL;

const toRow = m => {
  if (!m?.id) return null;
  const text = m.message ?? m.text ?? '';
  if (!text.trim() && !m.media) return null;
  return { tg_id: Number(m.id), ts: Number(m.date), text, has_media: !!m.media };
};

/**
 * The most recent `limit` messages, with photos harvested to storage.
 *
 * `known` is the set of tg_ids that already carry a media_url, so a
 * photo is downloaded once and never again. Harvesting is capped per
 * run: a tick has ~12 minutes total and one slow download must not
 * cost the window its post. Anything skipped is retried next tick,
 * because the row keeps has_media = true with media_url still null.
 */
export async function fetchRecent(limit = 80, known = new Set()) {
  if (!CHANNEL) throw new Error('TG_SOURCE_CHANNEL missing from .env');
  const cap = Number(process.env.MEDIA_PER_RUN || 8);
  const client = await connect();
  await client.connect();
  try {
    const entity = await client.getEntity(CHANNEL);
    const msgs = await client.getMessages(entity, { limit });
    const rows = msgs.map(toRow).filter(Boolean);
    const byId = new Map(msgs.map(m => [Number(m.id), m]));

    let n = 0;
    for (const r of rows) {
      if (n >= cap || !r.has_media || known.has(r.tg_id)) continue;
      const url = await harvest(client, byId.get(r.tg_id));
      if (url) { r.media_url = url; r.media_at = Math.floor(Date.now() / 1000); n++; }
    }
    if (n) console.log(`  harvested ${n} photo(s)`);
    return rows;
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
