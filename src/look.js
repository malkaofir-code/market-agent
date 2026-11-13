// ─────────────────────────────────────────────────────────────
// look.js — the brand (Nov 2026 rebrand): "השוק בעברית פשוטה".
//
// One look for everything the account publishes: a cobalt field for
// openings, white pages for the reading, a yellow page for the ask,
// Ron hosting — his navy and teal wardrobe is where the blue came
// from — and the channel's pictures used large.
//
// Pure: slide data in, the body's HTML out. builder.js owns the frame.
// ─────────────────────────────────────────────────────────────
import { bidi, esc } from './rtl.js';
import { pathOf } from './chart.js';

/** Which page each board stands on. */
export const K_GROUND = {
  kCover: 'blue', kLesson: 'blue', kBoard: 'white', kStory: 'white', kChart: 'white',
  kStep: 'white', kTake: 'yellow', kClose: 'yellow', kAsk: 'blue',
};
export const KX = new Set(Object.keys(K_GROUND));

/** Which of Ron's gestures hosts which board. */
export const K_POSE = { kCover: 'explain', kLesson: 'welcome', kClose: 'point', kTake: 'yes', kAsk: 'welcome', kStep: 'explain' };

const ltr = (t, cls = '') => `<bdi dir="ltr"${cls ? ` class="${cls}"` : ''}>${esc(t)}</bdi>`;

function line(points, dir, { w = 960, h = 360, label = null } = {}) {
  if (!points?.length) return '';
  const p = pathOf(points, w, h, 14);
  return `<svg class="k-svg ${esc(dir || '')}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
<path class="k-area" d="${p.area}"/><path class="k-line" d="${p.d}"/>
<circle class="k-dot" cx="${p.end.x.toFixed(1)}" cy="${p.end.y.toFixed(1)}" r="13"/></svg>${
    label ? `<p class="k-last" style="top:${(p.end.y / h * 100).toFixed(1)}%">${esc(label)}</p>` : ''}`;
}

// A tile's colour is its move: five steps each way, flat in the middle.
const heat = v => {
  const a = Math.abs(v), s = a >= 3 ? 4 : a >= 2 ? 3 : a >= 1 ? 2 : a >= 0.3 ? 1 : 0;
  return s === 0 ? 'h0' : `${v > 0 ? 'u' : 'd'}${s}`;
};
const pct = v => `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v).toFixed(1)}%`;

function money(m) {
  if (!m) return '';
  return `${ltr(m.stake)} ${bidi(m.fund)}: ${m.amount
    ? `${ltr(m.amount, `k-amt ${m.amount.startsWith('-') ? 'dn' : 'up'}`)} ${bidi('היום')}` : bidi('כמעט בלי שינוי היום')}`;
}

const ron = (s, cls = '') => s.ronSrc ? `<img class="k-ron ${cls}" src="${s.ronSrc}" alt="">` : '';

export const K = {
  // 1 · the opening: today's map, the day's read, Ron on the money.
  kCover: s => `<div class="k k-cover">
    <p class="k-chip">${bidi(s.eyebrow || '')}</p>
    <h1 class="k-h1">${bidi(s.headline)}</h1>
    ${s.tiles?.length ? `<div class="k-map" data-protect="the map">${s.tiles.map(t =>
      `<div class="k-tile ${heat(t.chg)}${t.wide ? ' wide' : ''}"><b>${esc(t.name)}</b><i>${esc(pct(t.chg))}</i></div>`).join('')}</div>`
    : s.big ? `<div class="k-bigbox"><b class="k-big ${esc(s.big.dir || '')}">${esc(s.big.value)}</b><span>${bidi(s.big.name)}</span>
        ${s.spark ? `<div class="k-spark">${line(s.spark.points, s.spark.dir, { h: 200 })}</div>` : ''}</div>` : ''}
    <div class="k-host">${ron(s)}${s.money ? `<p class="k-say">${money(s.money)}<small>${bidi(s.note || '')}</small></p>`
      : s.line ? `<p class="k-say">${bidi(s.line)}</p>` : ''}</div>
  </div>`,

  // 2 · the numbers, and what is coming.
  kBoard: s => `<div class="k k-board">
    <p class="k-chip">${bidi(s.eyebrow || '')}</p><h2 class="k-h2">${bidi(s.title)}</h2>
    <ul class="k-rows">${(s.rows ?? []).map(r => `<li><span>${bidi(r.name)}</span><b class="${esc(r.dir || '')}">${esc(r.value)}</b></li>`).join('')}</ul>
    ${s.next?.length ? `<div class="k-next"><p class="k-lbl">${bidi('מה מחכה לנו')}</p>${s.next.map(t => `<p><span>${bidi(t)}</span></p>`).join('')}</div>` : ''}
  </div>`,

  // 3 · one story: the picture large, the headline, one line.
  kStory: s => `<div class="k k-story${s.photo ? ' has-img' : ''}">
    ${s.photo ? `<figure class="k-img" data-protect="the photo"><img src="${esc(s.photo.src)}" alt="" onerror="this.parentNode.remove()"></figure>` : ''}
    <div class="k-txt">
      <p class="k-chip">${bidi(s.eyebrow || '')}</p>
      ${s.figure ? `<p class="k-fig ${esc(s.dir || '')}" data-protect="the figure">${esc(s.figure)}</p>` : ''}
      <h1 class="k-h2">${bidi(s.headline)}</h1>
      ${s.mean ? `<p class="k-mean"><b>${bidi(s.label || '')}</b>${bidi(s.mean)}</p>` : ''}
    </div></div>`,

  // 4 · the chart of the day.
  kChart: s => `<div class="k k-chart">
    <p class="k-chip">${bidi(s.eyebrow || '')}</p><h2 class="k-h2">${bidi(s.headline)}</h2>
    <p class="k-sub">${bidi(s.sub || '')}</p>
    <div class="k-cbox" data-protect="the chart">${line(s.points, s.dir, { h: 520, label: s.last })}</div>
    <p class="k-chg ${esc(s.dir || '')}"><b>${esc(s.change)}</b> ${bidi('בתקופה')}</p></div>`,

  // 5 · send it on.
  kClose: s => `<div class="k k-close">
    <h2 class="k-h1">${bidi(s.headline)}</h2><p class="k-cta">${bidi(s.sub || '')}</p>
    <p class="k-q">${bidi(s.ask || '')}</p>
    <div class="k-host">${ron(s)}<p class="k-say">${bidi(s.foot || '')}</p></div></div>`,

  // ── האקדמיה של רון ──
  kLesson: s => `<div class="k k-lesson">
    <p class="k-chip">${bidi(s.eyebrow || '')}</p>
    <p class="k-no">${esc(String(s.n).padStart(2, '0'))}</p>
    <h1 class="k-h1">${bidi(s.title)}</h1>
    <div class="k-host">${ron(s)}<p class="k-say">${bidi(s.hook || '')}</p></div></div>`,
  kStep: s => `<div class="k k-step">
    <p class="k-chip">${bidi(s.eyebrow || '')}</p>
    <p class="k-no">${esc(String(s.n))}</p>
    <p class="k-big-t">${bidi(s.text)}</p></div>`,
  kTake: s => `<div class="k k-take">
    <p class="k-chip">${bidi(s.eyebrow || 'בשורה אחת')}</p>
    <p class="k-big-t">${bidi(s.text)}</p>
    <div class="k-host">${ron(s)}<p class="k-say">${bidi(s.foot || '')}</p></div></div>`,
  kAsk: s => `<div class="k k-lesson k-ask">
    <p class="k-chip">${bidi(s.eyebrow || '')}</p>
    <h1 class="k-h1">${bidi(s.title)}</h1>
    <div class="k-host">${ron(s)}<p class="k-say">${bidi(s.hook || '')}</p></div></div>`,
};

/**
 * The reel's frame in the new look. Same data as the old scene; the
 * field is the brand's blue, the channel's picture sits in it as a
 * card, and the one number that matters is set as a sticker.
 */
export const kScene = s => `<div class="a-sn a-ks${s.photo ? ' has-ph' : ''}${s.lead ? ' is-lead' : ''}${String(s.headline ?? '').split(/\s+/).length > 6 ? ' is-long' : ''}${s.ron === null ? ' no-ron' : ''}">
  <div class="ks-bg ${esc(s.dir || '')}"></div>
  <div class="sn-txt ks-txt">
    ${s.chip ? `<p class="ks-chip">${bidi(s.chip)}</p>` : ''}
    ${s.lead && s.big
      ? `<p class="sn-h">${s.marked ?? bidi(s.headline)}</p><p class="ks-big ${esc(s.dir || '')}">${esc(s.big)}</p>`
      : `<p class="sn-h">${s.marked ?? bidi(s.headline)}</p>`}
    ${s.sub ? `<p class="ks-sub ${s.subDir ? esc(s.subDir) : ''}">${bidi(s.sub)}</p>` : ''}
    ${s.photo ? `<figure class="ks-ph"><img src="${esc(s.photo.src)}" alt="" onerror="this.parentNode.remove()"></figure>` : ''}
  </div></div>`;
