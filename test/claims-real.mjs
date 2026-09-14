import { readFileSync } from 'fs';
import { claimsFrom } from '../src/claims.js';
const rows = JSON.parse(readFileSync(new URL('./fixtures-real.json', import.meta.url)));
for (const r of rows) {
  const c = claimsFrom(r);
  console.log(`#${r.tg_id} ${r.text.split('\n')[0].slice(0, 42)}`);
  for (const x of c) console.log(`     -> ${x.symbol} ${x.dir}  « ${x.quote.slice(0, 70)}`);
}
