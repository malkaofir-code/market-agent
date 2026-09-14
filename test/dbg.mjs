import { clean } from '../src/rtl.js';
const t = `טסלה - אזהרת רווח, המניה עלולה לצנוח מחר`;
console.log(JSON.stringify(clean(t)));
const flat = s => String(s ?? '').replace(/["'׳״’“”]/g, '');
const PRE = '(?:[והלבמשכ]{0,2})';
const he = n => new RegExp(`(?:^|[^א-ת\\w])${PRE}${n}`);
for (const w of ['עלולה','לצנוח','טסלה','רווח','ירידה'])
  console.log(w, he(w).test(flat(clean(t))));
