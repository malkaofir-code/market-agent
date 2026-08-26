// ─────────────────────────────────────────────────────────────
// probe-single.js — the decisive test.
//
// Three carousels have failed at media_publish with 2207085 while
// every prior stage succeeded. That leaves exactly two possibilities
// and this separates them:
//
//   single image PUBLISHES  -> the problem is carousel-specific
//                              (children, is_carousel_item, count)
//   single image FAILS 2207085 -> the account cannot publish at all,
//                              and no code change will fix it
//
// It uses a photo ALREADY harvested from the channel, so rendering,
// slide layout and the slides bucket are all out of the picture.
//
//   node src/probe-single.js            # dry: build the container only
//   node src/probe-single.js --publish  # posts ONE image for real
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';
import { pool, close, getToken } from './db.js';
import { appendFileSync, writeFileSync } from 'fs';

const BASE = process.env.IG_API_BASE || 'https://graph.instagram.com/v23.0';
const ig = process.env.IG_USER_ID;

// The pipeline reads its token from agent.state (refresh-token.js
// writes it there), falling back to .env only as a seed. Using the
// .env copy here would have tested a DIFFERENT token than the one
// that failed three times.
const token = (await getToken()) ?? process.env.IG_ACCESS_TOKEN;

// Everything also goes to probe.log — terminal scrollback is not
// something that can be read back later.
const LOG = './probe.log';
writeFileSync(LOG, '');
const say = (...a) => { const l = a.join(' '); console.log(l); appendFileSync(LOG, l + '\n'); };
const err = (...a) => { const l = a.join(' '); console.error(l); appendFileSync(LOG, l + '\n'); };
const LIVE = process.argv.includes('--publish');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function call(path, params, method = 'POST') {
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = method === 'GET'
    ? await fetch(`${BASE}${path}?${body}`)
    : await fetch(`${BASE}${path}`, { method, body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) {
    const e = j.error ?? {};
    throw new Error(`${path}: ${e.message ?? res.status} (code ${e.code ?? '?'}${e.error_subcode ? '/' + e.error_subcode : ''})`);
  }
  return j;
}

const url = process.argv.find(a => a.startsWith('http'))
  ?? (await pool.query('select media_url from agent.messages where media_url is not null order by ts desc limit 1'))
       .rows[0]?.media_url;
if (!url) { err('no harvested photo to test with — run a tick first'); process.exit(1); }
say('token:', token === process.env.IG_ACCESS_TOKEN ? 'from .env (no refreshed copy in db)' : 'from agent.state — DIFFERENT from .env');
say('image :', url);

// Prove the URL is publicly fetchable before blaming Meta for not fetching it.
const head = await fetch(url, { method: 'GET', headers: { range: 'bytes=0-0' } });
say('public:', head.status, head.headers.get('content-type'));

try {
  const { id } = await call(`/${ig}/media`, { image_url: url, caption: 'test' });
  say('container:', id);
  for (let i = 0; i < 20; i++) {
    const { status_code } = await call(`/${id}`, { fields: 'status_code' }, 'GET');
    if (status_code === 'FINISHED') { say('status: FINISHED'); break; }
    if (status_code === 'ERROR') throw new Error(`container -> ERROR`);
    await sleep(1500);
  }
  if (!LIVE) { say('\nDRY — container built and NOT published. Re-run with --publish to settle it.'); }
  else {
    const pub = await call(`/${ig}/media_publish`, { creation_id: id });
    say('\nPUBLISHED:', pub.id);
    say('>>> Single images work. The problem is carousel-specific.');
  }
} catch (e) {
  err('\nFAILED:', e.message);
  if (/2207085|code -1/.test(e.message))
    err('>>> A single image fails the same way. This is account-level,\n' +
                  '>>> not carousel-specific, and not something code can fix.');
} finally { await close(); }
