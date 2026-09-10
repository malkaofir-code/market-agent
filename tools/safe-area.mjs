// tools/safe-area.mjs — run: node tools/safe-area.mjs
// Rule 8, measured rather than assumed: where does the TEXT actually sit?
process.env.TZ='Asia/Jerusalem'; process.env.REEL_BEATS='5'; process.env.REEL_HOLD_SEC='3.0'; process.env.REEL_VOICE='0';
const { chromium } = await import('playwright');
const { composeReel } = await import('../src/compose.js');
const { buildSlide } = await import('../src/builder.js');
const fs = await import('fs');
const CSS = fs.readFileSync(new URL('../src/slide.css', import.meta.url),'utf8');
// No photos needed: this measures TEXT boxes, and a photo changes
// none of them.
const DATA = {};
const now=Math.floor(Date.now()/1000);
const mk=(i,t,m=null)=>({tg_id:9900+i,ts:now-3600*(10-i),text:t,has_media:!!m,media_url:m});
const rows=[mk(1,'חוזי נאסד״ק NQ -1.33% | S&P ES -0.84%'),
 mk(2,'טראמפ הודיע על מכס חדש של 25% על יבוא רכב מאירופה'),
 mk(3,'מדד המחירים לצרכן בארה״ב עלה ב-0.4% בחודש שעבר, מעל התחזיות'),
 mk(4,'אנבידיה מזנקת 3.75% לאחר פרסום הדוחות'),
 mk(5,'נפט ברנט יורד 2.1% על רקע חששות מהיצע'),
 mk(6,'הפד צפוי להותיר את הריבית ללא שינוי'), mk(7,'ביטקוין סביב 61,400 דולר')];
const deck = composeReel(rows,{carry:{},endTs:now,template:32});

// Instagram's overlay on a 1080x1920 reel, as RECTANGLES.
// A column test called every card unsafe because right-aligned Hebrew
// reaches x=1034 — but the action rail only occupies the middle third
// of that column, so the test was measuring the wrong thing.
const UI = [
  { n:'top bar',    x:[0,1080],   y:[0,150] },
  { n:'action rail',x:[930,1080], y:[980,1780] },
  { n:'caption',    x:[0,940],    y:[1440,1920] },
];
const hit = (b, r) => b.left < r.x[1] && b.right > r.x[0]
                   && b.top  < r.y[1] && b.bottom > r.y[0];

const b = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined });
const p = await b.newPage({ viewport:{width:1080,height:1920}, deviceScaleFactor:1 });
const page = (body, css) => `<!doctype html><meta charset="utf-8"><style>${css}</style>${body}`;
let bad = 0;
for (const [i, sl] of deck.slides.entries()) {
  await p.setContent(page(buildSlide(sl, { quotes: deck.quotes ?? [], stamp: deck.stamp ?? '', window: deck.window, date: deck.date }, i, deck.slides.length, { layer:'fg' }), CSS), { waitUntil:'load' });
  const boxes = await p.evaluate(() => [...document.querySelectorAll('.sn-h,.sn-big,.sn-eyeb,.sn-s')]
    .map(e => { const r = e.getBoundingClientRect();
      return { cls: e.className, top:Math.round(r.top), bottom:Math.round(r.bottom),
               left:Math.round(r.left), right:Math.round(r.right), txt: e.textContent.trim().slice(0,26) }; }));
  for (const x of boxes) {
    const hits = UI.filter(r => hit(x, r)).map(r => r.n);
    const tag = hits.length ? 'UNSAFE' : 'ok    ';
    if (hits.length) bad++;
    console.log(`${tag} card ${i+1} .${x.cls.padEnd(8)} y ${String(x.top).padStart(4)}-${String(x.bottom).padStart(4)}  x ${String(x.left).padStart(4)}-${String(x.right).padStart(4)}  ${hits.join(' ')}  ${x.txt}`);
  }
}
await b.close();
console.log(bad ? `\n${bad} element(s) under the Instagram UI` : '\nall text inside the safe area');
