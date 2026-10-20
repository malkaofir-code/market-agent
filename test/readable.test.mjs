// Readable on a phone. A 1080px board is shown about 390 points wide,
// so 28px on the board is ~10pt in the hand: the smallest size any text
// may be set at. And every text colour a palette defines has to clear
// 4.5:1 against its own ground (WCAG AA for body text).
import { readFileSync } from 'fs';
import { PALETTES, isLight } from '../src/templates.js';
let bad = 0;
const check = (name, ok, got) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${got}`}`); };

const css = readFileSync(new URL('../src/slide.css', import.meta.url), 'utf8');
const small = [...css.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1])).filter(v => v < 28);
check('no text set below 28px', !small.length, small.join(','));

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const col = (v, bg) => {
  const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(v);
  if (!m) return hex(v);
  const a = Number(m[4]); return [1, 2, 3].map((k, i) => Number(m[k]) * a + bg[i] * (1 - a));
};
const L = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
for (const [name, p] of Object.entries(PALETTES)) {
  const bg = hex(p.bg);
  // On a light ground accent TEXT is drawn darkened (--acc-ink), so the
  // raw accent there is a fill colour, not a text colour.
  const keys = ['fg', 'dim', 'dim2', 'pos', 'neg', ...(isLight(name) ? [] : ['acc'])];
  const low = keys.filter(k => p[k] && ratio(col(p[k], bg), bg) < 4.5)
    .map(k => `${k} ${ratio(col(p[k], bg), bg).toFixed(2)}`);
  check(`${name}: every text colour clears 4.5:1`, !low.length, low.join(', '));
}
process.exit(bad ? 1 : 0);
