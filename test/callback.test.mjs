import { scoreClaim, etDate } from '../src/callback.js';
// Mon 8 Sep 2026 10:00 Israel = 03:00 ET -> ET date 2026-09-08
const posted = Math.floor(Date.parse('2026-09-08T07:00:00Z') / 1000);
const series = [
  { d: '2026-09-04', c: 100 }, { d: '2026-09-05', c: 101 },
  { d: '2026-09-08', c: 100.5 }, { d: '2026-09-09', c: 97.0 }, { d: '2026-09-10', c: 96 },
];
const base = { posted_at: posted, horizon: 3, klass: 'stock' };
const T = [
  ['forecast down, market fell 3.9%', { ...base, kind: 'forecast', dir: 'dn' }, 'hit'],
  ['forecast up, market fell',        { ...base, kind: 'forecast', dir: 'up' }, 'miss'],
  ['watch, needs 5% — only 3.9%',     { ...base, kind: 'watch', dir: 'dn' }, 'miss'],
  ['index forecast down (0.9% bar)',  { ...base, kind: 'forecast', dir: 'dn', klass: 'index' }, 'hit'],
  ['no close before the post',        { ...base, kind: 'forecast', dir: 'dn' }, 'nodata', series.slice(2)],
  ['still inside the horizon',        { ...base, kind: 'forecast', dir: 'up' }, 'open', series.slice(0, 4)],
];
let bad = 0;
for (const [name, c, want, s] of T) {
  const v = scoreClaim(c, s ?? series);
  const ok = v.status === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} -> ${v.status}${v.move_pct != null ? ` ${v.move_pct}% d+${v.days_after}` : ''}`);
}
console.log('etDate 22:00 IL on 8 Sep =', etDate(Math.floor(Date.parse('2026-09-08T19:00:00Z') / 1000)));
process.exit(bad ? 1 : 0);
