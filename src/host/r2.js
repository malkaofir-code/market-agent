// ─────────────────────────────────────────────────────────────
// r2.js — temporary public hosting for slide JPEGs.
//
// The Instagram API cannot accept image bytes: Meta's servers fetch
// each image themselves, so every slide must sit at a public URL for
// the few seconds a container takes to build. These objects are
// deleted immediately after the post publishes.
// ─────────────────────────────────────────────────────────────
import { AwsClient } from 'aws4fetch';
import { readFile } from 'fs/promises';
import { basename } from 'path';
import 'dotenv/config';

const need = k => { const v = process.env[k]; if (!v) throw new Error(`${k} missing from .env`); return v; };

let _client;
const client = () => (_client ??= new AwsClient({
  accessKeyId: need('R2_ACCESS_KEY_ID'),
  secretAccessKey: need('R2_SECRET_ACCESS_KEY'),
  service: 's3', region: 'auto',
}));

const endpoint = () => `https://${need('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com/${need('R2_BUCKET')}`;

/** Upload the deck's slides; returns public URLs in slide order. */
export async function upload(files, prefix) {
  const urls = [];
  for (const f of files) {
    const keyName = `${prefix}/${basename(f)}`;
    const body = await readFile(f);
    const res = await client().fetch(`${endpoint()}/${keyName}`, {
      method: 'PUT', body,
      headers: { 'content-type': 'image/jpeg', 'content-length': String(body.length) },
    });
    if (!res.ok) throw new Error(`R2 PUT ${keyName} -> ${res.status} ${await res.text()}`);
    urls.push(`${need('R2_PUBLIC_BASE').replace(/\/$/, '')}/${keyName}`);
  }
  return urls;
}

/** Best-effort cleanup. A leftover object is harmless; a thrown error here is not. */
export async function remove(files, prefix) {
  for (const f of files) {
    try {
      await client().fetch(`${endpoint()}/${prefix}/${basename(f)}`, { method: 'DELETE' });
    } catch (e) { console.warn('R2 delete failed (ignored):', e.message); }
  }
}
