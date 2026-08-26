// ─────────────────────────────────────────────────────────────
// builder.js — the six archetypes from design.html §05.
// Pure: deck plan in, HTML out. No I/O, no layout measurement.
// (Overflow is measured in render.js, which owns a real browser.)
// ─────────────────────────────────────────────────────────────
import { bidi, esc } from './rtl.js';

export const CANVAS = { w: 1080, h: 1350, body: 1118 };
export const HANDLE = '@marketalert.il';

const MARK = `<svg class="hd-mark" viewBox="0 0 100 100"><g fill="currentColor">
<rect x="14" y="55" width="16" height="22" rx="2.5"/><rect x="19.5" y="47" width="5" height="38" rx="2.5"/>
<rect x="42" y="44" width="16" height="22" rx="2.5"/><rect x="47.5" y="36" width="5" height="38" rx="2.5"/>
<rect x="70" y="33" width="16" height="22" rx="2.5"/><rect x="75.5" y="25" width="5" height="38" rx="2.5"/>
</g></svg>`;

const pad2 = n => String(n).padStart(2, '0');
const sign = v => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const fmtPct = v => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;

// ── band A: masthead ─────────────────────────────────────────
function masthead({ window: win, date }) {
  return `<header class="sl-hd"><span class="hd-l">${MARK}<span class="hd-name">MARKET ALERT</span></span>
<span class="hd-meta">עדכון ${bidi(win)} · ${bidi(date)}</span></header>`;
}

// ── band C: the tape ─────────────────────────────────────────
// "the one number a trader wants on screen no matter which slide
// surfaced" — so it is identical on every slide in the deck.
function tape(quotes, stamp) {
  const cells = quotes.map(q =>
    `<i><b>${esc(q.sym)}</b> ${esc(q.last)} <span class="${sign(q.chg)}">${fmtPct(q.chg)}</span></i>`
  ).join('');
  return `<div class="tick">${cells}<i>${esc(stamp)}</i></div>`;
}

// ── band D: footnote ─────────────────────────────────────────
function foot(i, n, src) {
  return `<footer class="sl-ft"><span class="ft-ix">${pad2(i)}/${pad2(n)}</span>
<span class="ft-src">${src ? bidi(src) : ''}</span>
<span class="ft-hd">${HANDLE}</span></footer>`;
}

// ── band B: the six archetypes ───────────────────────────────
const ARCHETYPES = {
  // 01 · cover — hangs off the top rule like a front page
  cover: s => `<div class="a-cv"><p class="eyeb">עדכון ${bidi(s.window)}</p><h1>${bidi(s.headline)}</h1>
    <p class="stand">${bidi(s.stand)}</p><div class="kick"></div></div>`,

  // 02 · hero figure — sized to its measure, not to a constant.
  // At the four-character size a constant ran 1,100% off the frame.
  hero: s => {
    const size = Math.min(256, Math.floor(940 / (String(s.figure).length * 0.62)));
    const dir = s.dir ? ` ${s.dir}` : '';
    return `<div class="a-hr"><p class="eyeb">${bidi(s.eyebrow || 'המספר של החלון')}</p>
    <p class="fig${dir}" style="font-size:${size}px">${esc(s.figure)}</p>
    ${s.unit ? `<p class="unit">${bidi(s.unit)}</p>` : ''}
    <p class="quo">${bidi(s.quote)}</p></div>`;
  },

  // 03 · interpretation — the one heavy frame in the system,
  // spent here because this is the only original content.
  note: s => `<div class="a-nt"><p class="lab">MEANING · משמעות</p>
    ${s.about ? `<p class="abt">${bidi(s.about)}</p>` : ''}
    <p class="txt">${bidi(s.text)}</p>
    <p class="dis">${bidi(s.disclaimer || 'פרשנות, לא המלצה.')}</p></div>`,

  // 04 · chart — hand-written SVG, pinned LTR (§06: bidi leaks
  // into <text> and drops the label on top of its own bar).
  chart: s => `<div class="a-ch"><p class="eyeb">TAPE · חוזים עתידיים</p>
    <h2>${bidi(s.title || 'התמונה בחוזים')}</h2><div class="chw">${barChart(s.series)}</div>
    <p class="note">נכון ל־${bidi(s.stamp)} · שעון ישראל</p></div>`,

  // 05 · list — balanced pages, not fixed threes
  list: s => {
    const rows = s.rows.map(r =>
      `<div class="row"><span class="row-n">${pad2(r.n)}</span>
    <span><p class="row-h">${bidi(r.headline)}</p>${
      r.source ? `<span class="row-s">${bidi(r.source)}</span>` : ''}</span></div>`
    ).join('');
    return `<div class="a-ls"><h2>${bidi(s.title || 'עוד מהחלון הזה')}</h2><div class="rows">${rows}</div></div>`;
  },

  // 06 · telegram — once a day, on the 23:00 deck, and it costs
  // a content slide. A CTA on every deck is how an account stops
  // being read.
  telegram: s => {
    const sched = (s.schedule || []).map(r =>
      `<div class="sr"><span class="st">${esc(r.time)}</span><span class="se">${bidi(r.label)}</span></div>`
    ).join('');
    return `<div class="a-tg"><p class="eyeb">TELEGRAM · בזמן אמת</p>
    <p class="big">${bidi(s.big)}</p>
    <div class="sched">${sched}</div>
    <div class="link">${esc(s.link)}</div></div>`;
  },
};

// ── chart geometry, reproduced from the specimen ─────────────
// zero rail at 482.56, plot left edge at 120, row pitch 118.
// Values live in a fixed right-hand column (x=914, anchor end)
// so a label can never collide with a mark.
const NICE = [0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];
export function barChart(series) {
  const ZERO = 482.56, LEFT = 120, PITCH = 118, BAR = 54, W = 928;
  const maxAbs = Math.max(...series.map(d => Math.abs(d.chg)), 0.01);
  const domain = NICE.find(n => n >= maxAbs) ?? Math.ceil(maxAbs);
  const scale = (ZERO - LEFT) / domain;
  const h = series.length * PITCH;
  const bars = series.map((d, i) => {
    const w = Math.abs(d.chg) * scale, y = 32 + i * PITCH, ty = 72 + i * PITCH;
    const x = d.chg < 0 ? ZERO - w : ZERO;
    return `
  <text class="ch-tk" x="14" y="${ty}">${esc(d.sym)}</text>
    <rect class="ch-bar ${sign(d.chg)}" x="${x}" y="${y}" width="${w}" height="${BAR}"/>
    <text class="ch-val ${sign(d.chg)}" x="914" y="${ty - 1}" text-anchor="end">${fmtPct(d.chg)}</text>`;
  }).join('');
  return `<svg class="ch" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}">
  <line class="ch-zero" x1="${ZERO}" y1="6" x2="${ZERO}" y2="${h - 6}"/>${bars}
  </svg>`;
}

// ── assembly ─────────────────────────────────────────────────
export function buildSlide(slide, ctx, i, n) {
  const body = ARCHETYPES[slide.type];
  if (!body) throw new Error(`unknown archetype: ${slide.type}`);
  return `<div class="slide" data-type="${slide.type}"><div class="bgm"></div>
${masthead(ctx)}<main class="sl-bd">${body({ ...slide, window: ctx.window })}</main>${tape(ctx.quotes, ctx.stamp)}
${foot(i + 1, n, slide.source)}</div>`;
}

export function buildDeck(deck) {
  const { slides, ...ctx } = deck;
  return slides.map((s, i) => buildSlide(s, ctx, i, slides.length));
}

export const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Frank+Ruhl+Libre:wght@700;800&family=Assistant:wght@400;600;700;800&display=swap';

export function page(slideHtml, css) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${css}</style></head><body>${slideHtml}</body></html>`;
}
