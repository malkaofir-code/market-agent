// ─────────────────────────────────────────────────────────────
// publish/api.js — Instagram API with Instagram Login.
//
// Three steps, and the middle one is asynchronous: Meta fetches each
// image and builds a container in the background, so a container id
// coming back does NOT mean the image was accepted. Publishing before
// every child reports FINISHED is the classic way to get a carousel
// that is silently missing slides.
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';

// The host is swappable (supabase.js / r2.js) and run.js pulls both
// the hosting and the publishing halves from this one module, so the
// two always travel together.
export { upload, remove, check } from '../host/supabase.js';

const BASE = process.env.IG_API_BASE || 'https://graph.instagram.com/v23.0';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function creds() {
  const id = process.env.IG_USER_ID, token = process.env.IG_ACCESS_TOKEN;
  if (!id || !token) throw new Error('IG_USER_ID / IG_ACCESS_TOKEN missing from .env');
  return { id, token };
}

// Meta's APP-level request limit (code 4) is separate from the
// content-publishing quota and is easy to hit from an unpublished
// app - a handful of rehearsals, each building 4-5 containers, is
// enough. It clears on its own, so back off and retry rather than
// failing the window. Every other error is fatal immediately.
const TRANSIENT = new Set([4, 2, 1]);        // rate limit, temporary, unknown-transient
const sleepFor = ms => new Promise(r => setTimeout(r, ms));

async function call(path, params, method = 'POST', attempt = 0) {
  const { token } = creds();
  const url = new URL(`${BASE}${path}`);
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = method === 'GET'
    ? await fetch(`${url}?${body}`)
    : await fetch(url, { method, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    if (TRANSIENT.has(e.code) && attempt < 4) {
      const wait = [30, 120, 300, 900][attempt] * 1000;   // 30s, 2m, 5m, 15m
      console.warn(`  ${path} -> ${e.message} — retry ${attempt + 1}/4 in ${wait / 1000}s`);
      await sleepFor(wait);
      return call(path, params, method, attempt + 1);
    }
    throw new Error(`IG ${path}: ${e.message ?? res.status} (code ${e.code ?? '?'}${e.error_subcode ? '/' + e.error_subcode : ''})`);
  }
  return json;
}

/** Poll a container until Meta has actually fetched and accepted the image. */
async function ready(id, { tries = 20, gap = 1500 } = {}) {
  for (let i = 0; i < tries; i++) {
    const { status_code, status } = await call(`/${id}`, { fields: 'status_code,status' }, 'GET');
    if (status_code === 'FINISHED') return true;
    if (status_code === 'ERROR' || status_code === 'EXPIRED')
      throw new Error(`container ${id} -> ${status_code}: ${status ?? ''}`);
    await sleep(gap);
  }
  throw new Error(`container ${id} still ${'IN_PROGRESS'} after ${tries * gap / 1000}s`);
}

/**
 * @param urls  public JPEG URLs, in slide order
 * @returns     { id, permalink }
 */
export async function publish(urls, caption, { dryRun = false } = {}) {
  const { id: ig } = creds();
  if (urls.length < 2 || urls.length > 10)
    throw new Error(`carousel needs 2-10 images, got ${urls.length}`);

  // 1 · one container per slide
  const children = [];
  for (const image_url of urls) {
    const { id } = await call(`/${ig}/media`, { image_url, is_carousel_item: 'true' });
    children.push(id);
  }
  await Promise.all(children.map(id => ready(id)));

  // 2 · the carousel container. Slide 1 dictates the crop for the whole
  // deck, which is why every slide is rendered at exactly 1080x1350.
  const { id: carousel } = await call(`/${ig}/media`, {
    media_type: 'CAROUSEL', children: children.join(','), caption,
  });
  await ready(carousel);

  if (dryRun) {
    // Interrogate the container Meta actually built. A carousel with
    // no children attached still reports FINISHED and only fails at
    // media_publish - which is exactly the symptom we are chasing.
    let detail = {};
    try {
      detail = await call(`/${carousel}`,
        { fields: 'id,status_code,media_type,children{id,media_type,media_url}' }, 'GET');
    } catch (e) { detail = { probe_error: e.message }; }
    const kids = detail?.children?.data ?? [];
    console.log(`  carousel ${carousel}: media_type=${detail.media_type ?? '?'} ` +
      `status=${detail.status_code ?? '?'} children_attached=${kids.length} (sent ${children.length})`);
    if (detail.probe_error) console.log('  probe:', detail.probe_error);
    return { id: null, carousel, dryRun: true, children, attached: kids.length };
  }

  // 3 · publish
  const { id } = await call(`/${ig}/media_publish`, { creation_id: carousel });
  const { permalink } = await call(`/${id}`, { fields: 'permalink' }, 'GET').catch(() => ({}));
  return { id, permalink: permalink ?? null };
}

/** Long-lived tokens last 60 days and are refreshable while still valid. */
export async function refreshToken() {
  const { token } = creds();
  const res = await fetch(`${BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(`refresh failed: ${j.error?.message ?? res.status}`);
  return j;   // { access_token, token_type, expires_in }
}
