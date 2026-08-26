// ─────────────────────────────────────────────────────────────
// media.js — Telegram photo -> Supabase -> a public URL.
//
// Media is fetched ONCE, at ingest, and only the resulting URL is
// stored. Two reasons it does not ride the deck pipeline: the file
// outlives the window that first saw it (a story can resurface), and
// a GitHub runner keeps nothing between runs, so re-downloading per
// deck would pay the Telegram round-trip every hour.
//
// Instagram needs the image at a public URL anyway, so the same
// object serves both the slide render and Meta's fetch.
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';

const need = k => { const v = process.env[k]; if (!v) throw new Error(`${k} missing from .env`); return v; };
const base = () => need('SUPABASE_URL').trim()
  .replace(/\/(rest|storage|auth|realtime)\/v\d+\/?$/, '').replace(/\/+$/, '');
const bucket = () => process.env.SUPABASE_MEDIA_BUCKET || 'media';
const auth = () => { const k = need('SUPABASE_SERVICE_KEY'); return { apikey: k, Authorization: `Bearer ${k}` }; };

const MAX = Number(process.env.MEDIA_MAX_BYTES || 6_000_000);

/**
 * Download one message's photo and park it in storage.
 * Returns a public URL, or null when there is nothing usable —
 * callers must treat "no photo" as normal, not exceptional: over half
 * the channel's messages have none, and every archetype has a
 * photo-less fallback.
 */
export async function harvest(client, msg) {
  if (!msg?.media) return null;
  // Photos only. Video/animation would need a poster frame and a
  // different slide treatment; documents are usually PDFs.
  const isPhoto = msg.photo || msg.media?.photo;
  if (!isPhoto) return null;

  let buf;
  try {
    buf = await client.downloadMedia(msg, { workers: 1 });
  } catch (e) {
    console.warn(`  media ${msg.id}: download failed (${e.message})`);
    return null;
  }
  if (!buf?.length || buf.length > MAX) {
    if (buf?.length) console.warn(`  media ${msg.id}: ${Math.round(buf.length / 1e6)}MB over cap, skipped`);
    return null;
  }

  const path = `tg/${msg.id}.jpg`;
  const res = await fetch(`${base()}/storage/v1/object/${bucket()}/${path}`, {
    method: 'POST',
    headers: { ...auth(), 'content-type': 'image/jpeg', 'x-upsert': 'true' },
    body: buf,
  });
  if (!res.ok) {
    console.warn(`  media ${msg.id}: upload ${res.status} ${await res.text()}`);
    return null;
  }
  return `${base()}/storage/v1/object/public/${bucket()}/${path}`;
}
