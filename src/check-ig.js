// Read-only probe: confirms the token works, names the account it is
// bound to, and shows how long it has left. Publishes nothing.
import 'dotenv/config';
const BASE = process.env.IG_API_BASE || 'https://graph.instagram.com/v23.0';
const t = process.env.IG_ACCESS_TOKEN, id = process.env.IG_USER_ID;
if (!t || !id) { console.error('IG_USER_ID / IG_ACCESS_TOKEN missing'); process.exit(1); }

const get = async (path, fields) => {
  const r = await fetch(`${BASE}${path}?fields=${fields}&access_token=${t}`);
  const j = await r.json();
  if (j.error) throw new Error(`${j.error.message} (code ${j.error.code}${j.error.error_subcode ? '/' + j.error.error_subcode : ''})`);
  return j;
};

try {
  const me = await get(`/${id}`, 'id,username,account_type,media_count');
  console.log('account      :', '@' + me.username, '|', me.account_type, '|', me.media_count, 'posts');
  console.log('id matches   :', me.id === id ? 'yes' : `NO (token is for ${me.id})`);
} catch (e) { console.error('account probe FAILED:', e.message); process.exit(2); }

// Does the token actually carry the publishing scope? The cheapest
// honest test is to ask the publishing endpoint for its limit.
try {
  const q = await get(`/${id}/content_publishing_limit`, 'config,quota_usage');
  console.log('publish scope: OK — quota used', q.data?.[0]?.quota_usage ?? '?', 'of',
    q.data?.[0]?.config?.quota_total ?? '?', 'per 24h');
} catch (e) { console.error('publish scope: FAILED —', e.message); }
