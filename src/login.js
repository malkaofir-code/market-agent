// One-time: prints a session string for .env. Your phone number, the
// SMS/app code and any 2FA password are typed by you into your own
// terminal and are never stored - only the resulting session string is.
import { createInterface } from 'readline/promises';
import { connect } from './tg.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = q => rl.question(q);

const client = await connect({ session: '' });
await client.start({
  phoneNumber: () => ask('Phone (+972...): '),
  phoneCode:   () => ask('Code Telegram just sent you: '),
  password:    () => ask('2FA password (blank if none): '),
  onError:     e  => console.error(e.message),
});

const me = await client.getMe();
console.log(`\nSigned in as ${me.username ? '@' + me.username : me.firstName}\n`);
console.log('Paste this into .env as TG_SESSION:\n');
console.log(client.session.save());
console.log('\n(Treat it like a password - it is a live login to your account.)');
await client.disconnect();
rl.close();
