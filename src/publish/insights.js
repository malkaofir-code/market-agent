// ─────────────────────────────────────────────────────────────
// publish/insights.js — reading the account back.
//
// "Find what's already working. Don't guess." Everything the agent
// decides — which of thirty templates opens a post, whether the
// question cover beats the plain one, whether a story at 10:16 is
// seen more than one at 19:16 — has been a guess, because nothing
// ever read the result. This reads it.
//
// Metrics are requested in ladders. Meta refuses the WHOLE call when
// one metric in the list is unsupported for that media type, and
// which metrics those are moves between API versions and account
// types, so asking for everything and giving up on an error would
// mean collecting nothing at all. Each rung drops the least
// essential metrics and tries again.
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';

const BASE = process.env.IG_API_BASE || 'https://graph.instagram.com/v23.0';

function creds() {
  const id = process.env.IG_USER_ID, token = process.env.IG_ACCESS_TOKEN;
  if (!id || !token) throw new Error('IG_USER_ID / IG_ACCESS_TOKEN missing');
  return { id, token };
}

async function get(path, params = {}) {
  const { token } = creds();
  const q = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${BASE}${path}?${q}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    const err = new Error(`IG ${path}: ${e.message ?? res.status} (code ${e.code ?? '?'})`);
    err.code = e.code;
    throw err;
  }
  return json;
}

// Most informative first; each rung is a fallback for the one above.
const LADDER = {
  post: [
    'reach,views,likes,comments,saved,shares,total_interactions,profile_visits,follows',
    'reach,views,likes,comments,saved,shares,total_interactions',
    'reach,likes,comments,saved,shares',
    'reach',
  ],
  story: [
    'reach,views,replies,total_interactions',
    'reach,views,replies',
    'reach,views',
    'reach',
  ],
  // A reel is measured on whether it HELD anyone, not on whether it
  // was served. Watch time first, then the spread metrics, then the
  // same floor as everything else.
  reel: [
    'reach,views,likes,comments,saved,shares,total_interactions,ig_reels_avg_watch_time,ig_reels_video_view_total_time',
    'reach,views,likes,comments,saved,shares,total_interactions',
    'reach,views,likes,comments,saved,shares',
    'reach,views',
    'reach',
  ],
};

/**
 * Every metric the account will give up for one media, flattened.
 * Returns null when even the last rung is refused — a story past its
 * 24 hours, or media the token can no longer see.
 */
export async function mediaInsights(mediaId, kind = 'post') {
  for (const metric of LADDER[kind] ?? LADDER.post) {
    try {
      const { data } = await get(`/${mediaId}/insights`, { metric });
      const out = {};
      for (const m of data ?? []) {
        const v = m.values?.[0]?.value;
        out[m.name] = typeof v === 'number' ? v : (v ?? null);
      }
      return out;
    } catch (e) {
      // 100 is "unsupported metric for this media" — try a shorter
      // list. Anything else (a dead token, a deleted post) is real.
      if (e.code !== 100) throw e;
    }
  }
  return null;
}

/** The account's own numbers, for the days a post cannot explain. */
export async function accountInsights(days = 7) {
  const { id } = creds();
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  for (const metric of ['reach,profile_views,website_clicks', 'reach,profile_views', 'reach']) {
    try {
      const { data } = await get(`/${id}/insights`,
        { metric, period: 'day', since, until: Math.floor(Date.now() / 1000) });
      return Object.fromEntries((data ?? []).map(m =>
        [m.name, (m.values ?? []).reduce((a, v) => a + (v.value ?? 0), 0)]));
    } catch (e) { if (e.code !== 100) throw e; }
  }
  return null;
}
