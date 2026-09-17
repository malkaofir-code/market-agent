// Shared Telegram client. MTProto / user account: the source channel
// is read-only for us, which a bot cannot do without admin rights.
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import 'dotenv/config';

export async function connect({ session = process.env.TG_SESSION } = {}) {
  const id = Number(process.env.TG_API_ID);
  const hash = process.env.TG_API_HASH;
  if (!id || !hash) throw new Error('TG_API_ID / TG_API_HASH missing from .env');
  const client = new TelegramClient(new StringSession(session || ''), id, hash,
    { connectionRetries: 5, autoReconnect: true });
  // GramJS logs every connection handshake at INFO, which buries the
  // run's own output. Errors still surface.
  try { client.setLogLevel('error'); } catch {}
  return client;
}

export async function alert(client, text) {
  const to = process.env.TG_ALERT_TARGET || 'me';
  try { await client.sendMessage(to, { message: text }); }
  catch (e) { console.error('alert failed:', e.message); }
}

/**
 * The finished film, delivered to a human.
 *
 * Every platform worth cross-posting to gates automated PUBLIC posting
 * behind an app audit — TikTok's and YouTube's both. Until one is
 * granted, the fastest free route to a second audience is not a
 * subscription and not a scraper: it is the file arriving on the
 * phone with its caption, ready to upload by hand in half a minute.
 *
 * Sent to TG_ALERT_TARGET, and 'me' is a trap worth naming: it is the
 * Saved Messages of the account whose SESSION this is — the one that
 * reads the source channel — which is not necessarily the account on
 * the phone that has to do the uploading. Two reels were handed off
 * successfully and neither was ever found. Name the human.
 *
 * Saved Messages stays as the fallback rather than the default: if the
 * username cannot be resolved the film still lands somewhere it can be
 * fetched from, and the log says which.
 */
export async function deliver(client, file, caption = '') {
  const to = process.env.TG_ALERT_TARGET || 'me';
  const send = where => client.sendFile(where, {
    file,
    caption: caption.slice(0, 1000),
    // Telegram compresses a document; a reel handed back squashed is
    // worse than no reel, so it goes as a video with its own bitrate.
    forceDocument: false,
    supportsStreaming: true,
  });
  try {
    await send(to);
    return to;
  } catch (e) {
    if (to === 'me') throw e;
    console.warn(`hand-off to ${to} failed (${e.message}) — falling back to Saved Messages`);
    await send('me');
    return 'me';
  }
}
