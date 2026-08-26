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
