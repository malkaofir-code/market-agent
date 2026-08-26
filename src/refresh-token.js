// ─────────────────────────────────────────────────────────────
// refresh-token.js — Instagram long-lived tokens last 60 days and can
// be refreshed while still valid. Miss the window and the only way
// back is generating one by hand in the Meta dashboard.
//
// Writes to Postgres, not .env: the runner that executes this keeps
// no disk. Run weekly; refreshing early is free.
// ─────────────────────────────────────────────────────────────
import { getToken, setToken, close } from './db.js';
import 'dotenv/config';

try {
  const stored = await getToken();
  if (stored) process.env.IG_ACCESS_TOKEN = stored;

  const { refreshToken } = await import('./publish/api.js');
  const { access_token, expires_in } = await refreshToken();
  if (!access_token) throw new Error('no access_token in response');

  await setToken(access_token, expires_in);
  console.log(`token refreshed — valid ~${Math.round((expires_in ?? 0) / 86400)} more days`);
} catch (e) {
  console.error('TOKEN REFRESH FAILED:', e.message);
  // Loud on purpose: silently failing here kills the pipeline ~60
  // days later with an auth error and no explanation.
  try {
    const { connect, alert } = await import('./tg.js');
    const c = await connect(); await c.connect();
    await alert(c, `⚠️ market-agent: Instagram token refresh FAILED\n${e.message}\n\nRegenerate it in the Meta dashboard before it expires.`);
    await c.disconnect();
  } catch {}
  process.exitCode = 1;
} finally {
  await close();
}
