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

/**
 * Prove every URL serves an image before Meta is asked to fetch it.
 *
 * Meta's rejection for a URL it cannot read is "Only photo or video
 * can be accepted as media type" — which names neither the slide nor
 * the reason, and cost a whole run to interpret. Storage is also
 * eventually consistent: an object uploaded a moment ago can 404 for
 * a beat, so a single retry absorbs the propagation lag that a fast
 * eight-slide deck can outrun.
 */
async function preflight(urls) {
  for (const [i, url] of urls.entries()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetch(url, { method: 'GET', headers: { range: 'bytes=0-1023' } })
        .catch(e => ({ ok: false, status: 0, statusText: e.message, headers: new Headers() }));
      const type = r.headers?.get?.('content-type') ?? '';
      if (r.ok && /^image\//.test(type)) break;
      if (attempt === 0) { await sleep(1500); continue; }
      throw new Error(
        `slide ${i + 1} is not readable as an image — ${r.status} ${type || r.statusText || 'no content-type'}\n` +
        `  ${url}\n  Meta would reject this with 2207052.`);
    }
  }
}

/**
 * Wait for Meta to fetch and accept an image.
 *
 * This used to poll every 1.5s up to 20 times. A four-slide deck is
 * five containers, so a single run could spend 100 calls just asking
 * "are you done yet" - and a Development-mode app gets roughly 200
 * calls per 24 HOURS. We exhausted the app's entire daily budget on
 * status polling, then media_publish was refused with code 4
 * ("Application request limit reached"). The publishing quota was
 * never the constraint; our own chatter was.
 *
 * Images finish almost immediately, so: wait first, then poll with
 * backoff, and cap hard. Worst case 5 calls instead of 20; the
 * common case is 1.
 */
async function ready(id, { tries = 5 } = {}) {
  const waits = [1200, 2500, 5000, 9000, 15000];
  for (let i = 0; i < tries; i++) {
    await sleep(waits[Math.min(i, waits.length - 1)]);
    const { status_code, status } = await call(`/${id}`, { fields: 'status_code' }, 'GET');
    if (status_code === 'FINISHED') return true;
    if (status_code === 'ERROR' || status_code === 'EXPIRED')
      throw new Error(`container ${id} -> ${status_code}: ${status ?? ''}`);
  }
  throw new Error(`container ${id} not FINISHED after ${tries} checks`);
}

/**
 * @param urls  public JPEG URLs, in slide order
 * @returns     { id, permalink }
 */
export async function publish(urls, caption, { dryRun = false } = {}) {
  const { id: ig } = creds();
  if (urls.length < 1 || urls.length > 10)
    throw new Error(`a post needs 1-10 images, got ${urls.length}`);

  // 1 · one container per slide
  await preflight(urls);

  // A quiet hour is still a post — MIN_SLIDES is 1 by decision. A
  // single image is NOT a carousel of one: Meta refuses CAROUSEL with
  // one child, so the lone slide is published as a plain image, with
  // the caption on the image container itself.
  if (urls.length === 1) {
    const { id: single } = await call(`/${ig}/media`, { image_url: urls[0], caption });
    await ready(single);
    if (dryRun) return { id: null, carousel: single, dryRun: true, children: [single] };
    const { id: one } = await call(`/${ig}/media_publish`, { creation_id: single });
    const { permalink: link } = await call(`/${one}`, { fields: 'permalink' }, 'GET').catch(() => ({}));
    return { id: one, permalink: link ?? null };
  }

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

  // Interrogate the container Meta actually built, on EVERY run - not
  // just dry ones. A carousel with no children attached still reports
  // FINISHED and only fails at media_publish, which is exactly the
  // symptom here; hiding this behind dryRun meant three live failures
  // taught us nothing.
  // One extra call per run, and calls are the scarce resource on an
  // unpublished app. Off unless PROBE_CONTAINER=1.
  if (process.env.PROBE_CONTAINER === '1')
  // status_code is the ONLY field Meta documents on a container.
  // Asking for media_type or children returns "nonexisting field
  // (code 100)" - a container is not a media object, so there is no
  // way to introspect what it holds. The children are verified
  // individually above instead.
  try {
    const d = await call(`/${carousel}`, { fields: 'status_code' }, 'GET');
    console.log(`  carousel ${carousel}: status=${d.status_code ?? '?'}, ${children.length} child(ren) FINISHED`);
  } catch (e) { console.log('  container probe failed:', e.message); }

  if (dryRun) return { id: null, carousel, dryRun: true, children };

  // 3 · publish
  let id;
  try {
    ({ id } = await call(`/${ig}/media_publish`, { creation_id: carousel }));
  } catch (e) {
    // 2207085 is undocumented. Re-read the container after the refusal:
    // whatever Meta objects to should be visible in its final state.
    try {
      const post = await call(`/${carousel}`, { fields: 'status_code,status' }, 'GET');
      console.log('  container after refusal:', JSON.stringify(post));
    } catch (p) { console.log('  post-mortem probe failed:', p.message); }
    // 2207085 is undocumented and identical across days, machines and
    // decks. Meta's own guidance: an account whose Page requires Page
    // Publishing Authorization cannot publish, and there is no
    // programmatic way to detect it. Say so rather than retrying.
    if (/2207085/.test(e.message)) {
      console.log('  NOTE: every stage before media_publish succeeded. If this repeats,');
      console.log('  check Page Publishing Authorization on the linked Facebook Page —');
      console.log('  it blocks publishing and is invisible to the API.');
    }
    throw e;
  }
  const { permalink } = await call(`/${id}`, { fields: 'permalink' }, 'GET').catch(() => ({}));
  return { id, permalink: permalink ?? null };
}

/**
 * One story. 1080x1920, published on its own.
 *
 * Stories are not a carousel and take no caption — Instagram ignores
 * one — so this is the plain three-step: container, wait for FINISHED,
 * publish. Called once per story rather than once per set, because a
 * set of three that fails on the second should still have told the
 * first: an hour with one story on it beats an hour with none.
 */
export async function publishStory(url, { dryRun = false } = {}) {
  const { id: ig } = creds();
  await preflight([url]);
  const { id: container } = await call(`/${ig}/media`, { image_url: url, media_type: 'STORIES' });
  await ready(container);
  if (dryRun) return { id: null, container, dryRun: true };
  const { id } = await call(`/${ig}/media_publish`, { creation_id: container });
  return { id, permalink: null };   // stories have no public permalink
}

/** Long-lived tokens last 60 days and are refreshable while still valid. */
export async function refreshToken() {
  const { token } = creds();
  const res = await fetch(`${BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
  const j = await res.json();
  if (!res.ok || j.error) throw new Error(`refresh failed: ${j.error?.message ?? res.status}`);
  return j;   // { access_token, token_type, expires_in }
}
