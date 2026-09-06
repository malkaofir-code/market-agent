// ─────────────────────────────────────────────────────────────
// ingest.js — channel -> plain rows. No database knowledge here;
// run.js decides where they go. A short fetch per run beats a
// long-lived listener: nothing to supervise, and tg_id UNIQUE makes
// re-fetching the same messages free.
// ─────────────────────────────────────────────────────────────
import { connect } from './tg.js';
import { Api } from 'telegram';
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
export async function fetchRecent(limit = 80, known = new Set(), pinned = null) {
  if (!CHANNEL) throw new Error('TG_SOURCE_CHANNEL missing from .env');
  const cap = Number(process.env.MEDIA_PER_RUN || 8);
  const client = await connect();
  await client.connect();
  try {
    // Resolve by username, and keep the numeric peer as a lifeline.
    //
    // On 6 September the channel renamed itself — nq_es_hunters became
    // hamal_shukhahon — and the old username stopped resolving. The
    // agent went silent mid-afternoon with every run still green,
    // because a username is not an identity: it is a label the owner
    // can change at any time without telling anyone.
    //
    // A channel's id and access hash do not change. So the username is
    // tried first (an intentional edit to TG_SOURCE_CHANNEL must still
    // take effect) and the pinned peer catches it when the label moves
    // out from under us.
    let entity = null, why = null;
    try { entity = await client.getEntity(CHANNEL); }
    catch (e) { why = e.message; }
    if (!entity && pinned?.id) {
      entity = new Api.InputPeerChannel({
        channelId: BigInt(pinned.id), accessHash: BigInt(pinned.accessHash) });
      console.log(`  ${CHANNEL} did not resolve (${why}) — using the pinned channel id`);
    }
    if (!entity) throw new Error(`cannot resolve ${CHANNEL}: ${why}`);

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

    // Re-pin from whatever actually answered, so the lifeline is
    // always current.
    let peer = pinned;
    const full = entity?.id != null && entity?.accessHash != null ? entity : null;
    if (full) peer = { id: String(full.id), accessHash: String(full.accessHash),
                       username: CHANNEL, at: Math.floor(Date.now() / 1000) };
    return { rows, peer };
  } finally {
    // disconnect() alone leaves gramJS's update loop running. It keeps
    // retrying against a socket that is gone and, about forty seconds
    // later, throws TIMEOUT as an UNHANDLED rejection — which under
    // Node's default takes the whole process down. On 30 Aug that
    // landed between story 2 and story 3: two boards live, the third
    // never built, and nothing recorded. destroy() stops the loop.
    try { await client.disconnect(); } catch {}
    try { await client.destroy(); } catch {}
  }
}

// `node src/ingest.js [limit]` — one-off pull, for backfilling.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { putMessages, close, getState, setState } = await import('./db.js');
  const pinned = (await getState('tg-peer')) ?? null;
  const { rows, peer } = await fetchRecent(Number(process.argv[2] || 200), new Set(), pinned);
  await putMessages(rows);
  if (peer) await setState('tg-peer', peer);
  console.log(`stored ${rows.length} message(s)`);
  await close();
}
