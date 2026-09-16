// ─────────────────────────────────────────────────────────────
// supabase.js — temporary public hosting for slide JPEGs.
//
// The Instagram API cannot accept image bytes: Meta's servers fetch
// each image themselves, so every slide must sit at a public URL for
// the few seconds a container takes to build. Objects are deleted as
// soon as the post publishes.
//
// Same two functions as host/r2.js, so publish/api.js does not care
// which one it is talking to.
// ─────────────────────────────────────────────────────────────
import { readFile } from 'fs/promises';
import { basename } from 'path';
import 'dotenv/config';

const need = k => { const v = process.env[k]; if (!v) throw new Error(`${k} missing from .env`); return v; };
// Tolerate the two URLs the dashboard offers: the project URL and
// the Data API endpoint (which ends /rest/v1/). Storage lives at the
// project root, so trim anything past the host.
const base = () => need('SUPABASE_URL').trim()
  .replace(/\/(rest|storage|auth|realtime)\/v\d+\/?$/, '')
  .replace(/\/+$/, '');
const bucket = () => need('SUPABASE_BUCKET');

// The service_role key bypasses row-level security. It belongs in
// .env on this machine and nowhere else - never in the repo, never
// in a browser, never in the artifact of any post.
//
// Supabase sits behind an API gateway that wants the key in BOTH an
// `apikey` header and a bearer token. Sending only the bearer gets
// "401 No API key found in request", which reads like a bad key
// rather than a missing header.
const auth = () => {
  const k = need('SUPABASE_SERVICE_KEY');
  return { apikey: k, Authorization: `Bearer ${k}` };
};

/**
 * Is this file whole?
 *
 * On 16 September a story went out as a grey box: the top fifth of the
 * board decoded and the rest was Instagram's placeholder. The board
 * was fine — re-rendering the same window locally produced exactly
 * the image that should have gone out. What reached Meta was a
 * TRUNCATED file, and nothing anywhere in this pipeline was checking.
 *
 * Every container format ends with a known marker. A file missing it
 * is incomplete, and an incomplete file must never leave the runner:
 * once Meta has fetched it the post is live and wrong, and there is
 * no second fetch.
 */
export function whole(buf, type) {
  if (!buf.length) return 'empty file';
  if (type === 'image/jpeg') {
    if (buf[0] !== 0xFF || buf[1] !== 0xD8) return 'not a JPEG (no SOI)';
    // FFD9 is end-of-image. A truncated JPEG decodes down to wherever
    // it stopped and paints the rest grey — exactly what was posted.
    if (buf[buf.length - 2] !== 0xFF || buf[buf.length - 1] !== 0xD9) return 'truncated JPEG (no EOI)';
  }
  if (type === 'image/png') {
    if (buf.subarray(1, 4).toString('latin1') !== 'PNG') return 'not a PNG';
    if (buf.subarray(-8, -4).toString('latin1') !== 'IEND') return 'truncated PNG (no IEND)';
  }
  if (type === 'video/mp4' && buf.length < 10_000) return 'implausibly small MP4';
  return null;
}

/** What the object store actually holds at that URL, in bytes. */
async function storedBytes(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (!r.ok) return -1;
    const n = Number(r.headers.get('content-length'));
    return Number.isFinite(n) ? n : -1;
  } catch { return -1; }
}

/** Upload the deck's slides; returns public URLs in slide order. */
export async function upload(files, prefix) {
  const urls = [];
  for (const f of files) {
    const path = `${prefix}/${basename(f)}`;
    const body = await readFile(f);
    // A reel is an MP4 through the same door. Meta refuses a video
    // container whose URL serves image/jpeg, and Supabase serves back
    // exactly the content-type it was given.
    const type = /\.mp4$/i.test(f) ? 'video/mp4'
               : /\.png$/i.test(f) ? 'image/png' : 'image/jpeg';

    const bad = whole(body, type);
    if (bad) throw new Error(`${basename(f)} is ${bad} — refusing to publish it`);

    const url = `${base()}/storage/v1/object/public/${bucket()}/${path}`;
    let stored = -1;
    // Three goes, because the failure this guards against is a
    // transport one: the bytes we hold are known good, so a mismatch
    // means the write did not land whole and writing it again is the
    // entire fix.
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(`${base()}/storage/v1/object/${bucket()}/${path}`, {
        method: 'POST',
        headers: { ...auth(), 'content-type': type, 'x-upsert': 'true' },
        body,
      });
      if (!res.ok) throw new Error(`storage upload ${path} -> ${res.status} ${await res.text()}`);
      stored = await storedBytes(url);
      if (stored === body.length) break;
      console.warn(`upload ${path}: store holds ${stored} of ${body.length} bytes`
        + (attempt < 3 ? ' — writing it again' : ''));
      await new Promise(r => setTimeout(r, 400 * attempt));
    }
    // A store that cannot say what it holds is not a reason to stop —
    // a HEAD that fails returns -1 and only a genuine MISMATCH throws.
    if (stored >= 0 && stored !== body.length)
      throw new Error(`${path} uploaded short: ${stored} of ${body.length} bytes`);

    urls.push(url);
  }
  return urls;
}

/** Best-effort cleanup. A leftover object is harmless; a throw here is not. */
export async function remove(files, prefix) {
  for (const f of files) {
    try {
      await fetch(`${base()}/storage/v1/object/${bucket()}/${prefix}/${basename(f)}`,
        { method: 'DELETE', headers: auth() });
    } catch (e) { console.warn('storage delete failed (ignored):', e.message); }
  }
}

/** Read-only probe: confirms the key works and the bucket is public. */
export async function check() {
  const r = await fetch(`${base()}/storage/v1/bucket/${bucket()}`, { headers: auth() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`bucket "${bucket()}" -> ${r.status} ${j.message ?? ''}`);
  if (!j.public) throw new Error(`bucket "${bucket()}" is PRIVATE - Meta would get 403 fetching the slides`);
  return j;
}
