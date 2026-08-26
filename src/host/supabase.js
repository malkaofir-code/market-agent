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

/** Upload the deck's slides; returns public URLs in slide order. */
export async function upload(files, prefix) {
  const urls = [];
  for (const f of files) {
    const path = `${prefix}/${basename(f)}`;
    const body = await readFile(f);
    const res = await fetch(`${base()}/storage/v1/object/${bucket()}/${path}`, {
      method: 'POST',
      headers: { ...auth(), 'content-type': 'image/jpeg', 'x-upsert': 'true' },
      body,
    });
    if (!res.ok) throw new Error(`storage upload ${path} -> ${res.status} ${await res.text()}`);
    urls.push(`${base()}/storage/v1/object/public/${bucket()}/${path}`);
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
