// ─────────────────────────────────────────────────────────────
// builder.js — the six archetypes from design.html §05.
// Pure: deck plan in, HTML out. No I/O, no layout measurement.
// (Overflow is measured in render.js, which owns a real browser.)
// ─────────────────────────────────────────────────────────────
import { bidi, esc } from './rtl.js';
import { vars, byId } from './templates.js';

export const CANVAS = { w: 1080, h: 1350, body: 1118 };
// A story is the same board, taller, with the top and bottom quarters
// given away. Instagram draws its own furniture there — progress bars
// and the avatar at the top, the reply box and the share row at the
// bottom — and anything of ours underneath it is simply not read.
export const STORY = { w: 1080, h: 1920, safeTop: 250, safeBottom: 250 };
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

/**
 * The Telegram strip — the channel address printed across the board.
 *
 * Instagram's publishing API cannot attach a link sticker, so this is
 * not tappable and does not pretend to be: no arrow, no "swipe", no
 * button shape. It is an address, set like an address, on the boards
 * the rotation picks.
 */
function tgStrip(link) {
  return `<div class="tg-strip"><span class="tg-l">TELEGRAM</span>
<span class="tg-a">${esc(link)}</span></div>`;
}

/** The day in the reader's money and in Ron's voice (day.js). */
function dayStrip(d) {
  if (!d || (!d.money && !d.ron)) return '';
  const p = d.parts;
  const money = p ? `<bdi dir="ltr">${esc(p.stake)}</bdi> ${bidi(p.fund)}: ${p.amount
    ? `<bdi dir="ltr" class="ds-a ${p.amount.startsWith('-') ? 'dn' : 'up'}">${esc(p.amount)}</bdi> ${bidi('היום')}`
    : bidi('כמעט בלי שינוי היום')}` : (d.money ? bidi(d.money) : '');
  return `<div class="day-strip">${money ? `<p class="ds-m">${money}</p>` : ''}${
    d.ron ? `<p class="ds-r">${bidi(d.ron)}</p>` : ''}${d.money && d.note ? `<p class="ds-n">${bidi(d.note)}</p>` : ''}</div>`;
}

// ── band D: footnote ─────────────────────────────────────────
function foot(i, n, src, swipe = null) {
  // The first boards tell a newcomer there is more, and what: the
  // footer's middle slot is the one place on every board that is
  // always free, so the cue never fights the content for room.
  return `<footer class="sl-ft"><span class="ft-ix">${pad2(i)}/${pad2(n)}</span>
${swipe ? `<span class="ft-swipe">${bidi(swipe)}<i aria-hidden="true">←</i></span>` : `<span class="ft-src">${src ? bidi(src) : ''}</span>`}
<span class="ft-hd">${HANDLE}</span></footer>`;
}


// ── the proof world ──────────────────────────────────────────
//
// A callback board that wears the same masthead, the same tape and
// the same navy ground as the hourly bulletin IS the hourly bulletin
// as far as a thumb is concerned. The whole value of this format is
// that it stops someone — so it gets its own world: a printed receipt
// rather than a news board, its own header band, no tape, and a
// price line no other archetype has.
const PROOF = new Set(['proofCert', 'proofVerdict', 'coverProof', 'record', 'proofOrig', 'recordRows']);

function proofHead({ date }, slide) {
  return `<header class="pf-hd"><span class="pf-check"></span>
<span class="pf-name">MARKET ALERT</span><span class="pf-date">${bidi(date)}</span></header>`;
}

function proofFoot(slide) {
  return `<footer class="pf-ft"><span class="pf-meth">${
    bidi(slide.method || 'נמדד ממחיר הסגירה שלפני הפוסט')}</span>
<span class="pf-hd2">${HANDLE}</span></footer>`;
}

/**
 * The price path, drawn.
 *
 * Two numbers in a table are a claim; the line between them is the
 * evidence, and it is the one thing on this account that cannot be
 * mistaken for any other board. Time runs left to right even on an
 * RTL page — that is how every chart anybody has ever seen runs, and
 * a reversed one reads as a different, wrong story.
 *
 * The first point is the close BEFORE we published, which is why the
 * marker sits on it: everything to the right of that line happened
 * after the account had already spoken.
 */
export function priceLine(path = [], dir = '', { from = '', to = '' } = {}) {
  const pts = (path ?? []).map(p => Number(p.c ?? p)).filter(Number.isFinite);
  if (pts.length < 2) return '';
  const W = 900, H = 250, PX = 18, PY = 26;
  const lo = Math.min(...pts), hi = Math.max(...pts), span = (hi - lo) || 1;
  const x = i => PX + i * (W - 2 * PX) / (pts.length - 1);
  const y = v => PY + (hi - v) * (H - 2 * PY) / span;
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`;
  const lastX = x(pts.length - 1).toFixed(1), lastY = y(pts[pts.length - 1]).toFixed(1);
  return `<div class="pf-chart" data-protect="the price path">
<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="pl ${dir}">
  <path class="pl-area" d="${area}"/>
  <path class="pl-line" d="${line}"/>
  <line class="pl-mark" x1="${x(0).toFixed(1)}" y1="0" x2="${x(0).toFixed(1)}" y2="${H}"/>
  <circle class="pl-dot" cx="${lastX}" cy="${lastY}" r="9"/>
</svg>
<span class="pl-then">${bidi('הפוסט')}</span>
${from ? `<span class="pl-px pl-from">${esc(from)}</span>` : ''}
${to ? `<span class="pl-px pl-to">${esc(to)}</span>` : ''}</div>`;
}

// ── band B: the six archetypes ───────────────────────────────
const photo = (p, stat) => p
  ? `<div class="ph" data-protect="the source photo" style="height:${p.h ?? 452}px"><img src="${esc(p.src)}" alt="">${
      stat ? `<span class="stat">${esc(stat)}</span>` : ''}</div>`
  : '';

const ARCHETYPES = {

  // 15 · the certificate — the proof board.
  //
  // White sheet, and green means exactly one thing on it: VERIFIED.
  // Not "up" — the price line is drawn in ink whichever way it went,
  // so a confirmed fall is as green a board as a confirmed rally. On
  // every other board on this account green is the direction of a
  // number; here it is the status of a claim, and keeping those two
  // meanings apart is what makes the sheet readable at a glance.
  //
  // The claim is inside a solid green block at the top, the way a
  // stamped header sits on a certificate, and everything below it is
  // the evidence: the reasoning, the path, the two closes.
  proofCert: s => `<div class="a-pf">
    <div class="pf-block">
      <p class="pf-verdict"><span class="pf-tick"></span>${bidi(s.stamp || 'אמרנו — והתממש')}</p>
      <p class="pf-said">${bidi(s.said)}</p>
      <span class="pf-when">${bidi(s.when)}</span>
    </div>
    ${s.why ? `<div class="pf-why"><span class="pf-lbl">${bidi('למה')}</span>
      <p>${bidi(s.why)}</p></div>` : ''}
    ${priceLine(s.path, s.dir, { from: s.fromPx, to: s.toPx })}
    <div class="pf-foot">
      <p class="fig" data-protect="the figure">${esc(s.figure)}</p>
      <span class="pf-sub">${bidi(s.sub)}</span>
    </div></div>`,

  // 16 · the verdict — the sheet inverted.
  //
  // The same argument on a solid green field: the move enormous in
  // white, the reasoning in one line, the two closes as the working.
  // It exists so two proof boards on the same day cannot look alike.
  proofVerdict: s => `<div class="a-pd">
    <p class="pd-verdict"><span class="pd-tick"></span>${bidi(s.stamp || 'אמרנו — והתממש')}</p>
    <p class="pd-move fig" data-protect="the figure">${esc(s.figure)}</p>
    <p class="pd-said">${bidi(s.said)}</p>
    ${s.why ? `<p class="pd-why"><span class="pd-tag">${bidi('למה')}</span>${bidi(s.why)}</p>` : ''}
    <div class="pd-rows">
      <div class="pd-row"><span class="pd-lbl">${bidi(s.fromLabel)}</span>
        <b class="pd-px">${esc(s.fromPx)}</b></div>
      <div class="pd-row pd-to"><span class="pd-lbl">${bidi(s.toLabel)}</span>
        <b class="pd-px">${esc(s.toPx)}</b></div>
    </div>
    <p class="pd-sub">${bidi(s.sub)}</p></div>`,

  // 16b · the original post — the call as it ran, before the move.
  proofOrig: s => `<div class="a-po">
    <p class="eyeb">${bidi(s.eyebrow || 'הפוסט המקורי')}</p>
    <figure class="po-fr"><img src="${esc(s.src)}" alt=""></figure>
    <p class="po-cap">${bidi(s.caption)}</p></div>`,

  // 00 · THE CARD — the one design (Nov 2026). The channel's headline,
  // one line of what it means, the picture only when it is licensed.
  card: s => `<div class="a-cd${s.photo ? ' has-img' : ''}">
    ${s.photo ? `<figure class="cd-img" data-protect="the photo"><img src="${esc(s.photo.src)}" alt=""></figure>` : ''}
    <div class="cd-txt">
      <p class="eyeb">${bidi(s.eyebrow || '')}</p>
      ${s.figure ? `<p class="cd-fig ${esc(s.dir || '')}" data-protect="the figure">${esc(s.figure)}</p>` : ''}
      <h1 class="cd-h">${bidi(s.headline)}</h1>
      ${s.mean ? `<div class="cd-m"><p class="cd-ml">${bidi(s.label || '')}</p><p class="cd-mt">${bidi(s.mean)}</p></div>` : ''}
      ${s.credit ? `<p class="cd-cr">${esc(s.credit)}</p>` : ''}
    </div></div>`,

  // 17 · the proof post's opening.
  coverProof: s => `<div class="a-pv">
    <p class="eyeb">${bidi(s.eyebrow || 'הקריאות שלנו')}</p>
    <h1>${bidi(s.headline)}</h1>
    <div class="pv-rule"></div>
    <p class="pv-sub">${bidi(s.stand)}</p></div>`,

  // 18 · the record — the only board that writes down the method.
  record: s => `<div class="a-rc">
    <p class="eyeb">${bidi(s.eyebrow || '30 הימים האחרונים')}</p>
    <div class="rc-head"><b class="rc-n">${esc(s.count)}</b>
      <span class="rc-of">${bidi(s.of)}</span></div>
    ${(s.items ?? []).length ? `<ul class="rc-list">${(s.items ?? []).map(i =>
      `<li${i.ok === false ? ' class="no"' : ''}>${i.ok === undefined ? '' : `<i class="rc-k">${i.ok ? '✓' : '✗'}</i>`}<span class="rc-a">${bidi(i.asset)}</span><span class="rc-d">${bidi(i.when)}</span>
       <b class="rc-m ${i.dir ?? ''}">${esc(i.move)}</b></li>`).join('')}</ul>` : ''}
    <p class="rc-note">${bidi(s.note)}</p></div>`,

  // 18b · the record, ranked — strongest hits, worst misses, five a board.
  recordRows: s => `<div class="a-rc a-rr">
    <p class="eyeb">${bidi(s.eyebrow)}</p>
    <h2 class="rr-t">${bidi(s.title)}</h2>
    <ul class="rc-list">${(s.items ?? []).map(i =>
      `<li${i.ok === false ? ' class="no"' : ''}><i class="rc-k">${i.ok ? '✓' : '✗'}</i><span class="rc-a">${bidi(i.asset)}</span><span class="rc-d">${bidi(i.when)}</span>
       <b class="rc-m ${i.dir ?? ''}">${esc(i.move)}</b><span class="rc-s">${bidi(i.said)}</span></li>`).join('')}</ul>
    <p class="rc-note">${bidi(s.note)}</p></div>`,

  // 09 · the scene — the reel's board, and nothing like the others.
  //
  // Every other archetype here is a page: text laid on a field, read
  // at the reader's pace. This is a FRAME. He stands in a market that
  // is visibly doing something, one short line sits over it, and the
  // viewer has under two seconds to take it in — so the headline is
  // short, enormous, and carries a single accented word to land the
  // eye somewhere specific.
  scene: s => `<div class="a-sn${s.photo ? ' has-ph' : ''}${s.lead ? ' is-lead' : ''}${String(s.headline ?? '').split(/\s+/).length > 6 ? ' is-long' : ''}${s.ron === null ? ' no-ron' : ''}">
    ${sceneBg(s.dir, s.seed ?? 0)}
    ${s.photo ? `<img class="sn-ph" src="${esc(s.photo.src)}" alt="">
    <div class="sn-scrim"></div>` : ''}
    <div class="sn-txt">${s.lead && s.big
      // The opening card is the number, so the number is the type.
      // The instrument sits above it as an eyebrow rather than a
      // headline — a stranger needs to know WHAT moved, in a size that
      // does not compete with HOW MUCH.
      ? `<p class="sn-eyeb">${bidi(s.headline)}</p>
         <p class="sn-big" data-dir="${esc(s.dir || '')}">${bidi(s.big)}</p>`
      : `<p class="sn-h">${s.marked ?? bidi(s.headline)}</p>`}
      ${s.sub ? `<p class="sn-s">${bidi(s.sub)}</p>` : ''}</div></div>`,
};

/**
 * The scene behind him.
 *
 * The reel format wants a WORLD, not a colour field: the mascot
 * standing in a market that is visibly doing something, so the board
 * reads before a word of it is read. Drawn rather than photographed —
 * a wall of candles whose direction matches the story's direction,
 * a trend line through them, and a glow behind his head so he
 * separates from it.
 *
 * Deterministic from the seed, so the same story always renders the
 * same scene and a replay reproduces what it replayed.
 */
export function sceneBg(dir = '', seed = 0) {
  const W = 1080, H = 1920;
  const rnd = (n) => { const x = Math.sin(seed * 9301 + n * 49297) * 233280; return x - Math.floor(x); };
  const up = dir === 'up', dn = dir === 'dn';
  const rise = up ? 1 : dn ? -1 : 0;

  // A wall of candles across the lower two-thirds, drifting the way
  // the story drifts.
  const n = 26, cw = 26, gap = W / n;
  let candles = '';
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const base = 1180 - rise * t * 300 + (rnd(i) - 0.5) * 190;
    const h = 70 + rnd(i + 60) * 230;
    const green = rise ? (rnd(i + 9) > (dn ? 0.72 : 0.28)) : rnd(i + 9) > 0.5;
    const c = green ? 'var(--pos)' : 'var(--neg)';
    const x = i * gap + (gap - cw) / 2;
    candles += `<rect x="${x.toFixed(0)}" y="${(base - h).toFixed(0)}" width="${cw}" height="${h.toFixed(0)}" fill="${c}" opacity=".72"/>`
             + `<rect x="${(x + cw / 2 - 2).toFixed(0)}" y="${(base - h - 34).toFixed(0)}" width="4" height="${(h + 68).toFixed(0)}" fill="${c}" opacity=".5"/>`;
  }

  // The line through them — the one element that states the direction
  // outright rather than implying it.
  const pts = Array.from({ length: 14 }, (_, i) => {
    const t = i / 13;
    return `${(t * W).toFixed(0)},${(1010 - rise * t * 330 + (rnd(i + 200) - 0.5) * 130).toFixed(0)}`;
  }).join(' ');

  return `<svg class="sc-bg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <radialGradient id="g${seed}" cx="50%" cy="34%" r="52%">
        <stop offset="0%" stop-color="var(--acc)" stop-opacity=".30"/>
        <stop offset="100%" stop-color="var(--acc)" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="f${seed}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--bg)" stop-opacity=".18"/>
        <stop offset="62%" stop-color="var(--bg)" stop-opacity=".42"/>
        <stop offset="100%" stop-color="var(--bg)" stop-opacity=".97"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="var(--bg)"/>
    <rect width="${W}" height="${H}" fill="url(#g${seed})"/>
    <g>${Array.from({ length: 11 }, (_, i) =>
      `<line x1="0" y1="${300 + i * 130}" x2="${W}" y2="${300 + i * 130}" stroke="var(--fg)" stroke-opacity=".05"/>`).join('')}</g>
    <g>${candles}</g>
    <polyline points="${pts}" fill="none" stroke="${dn ? 'var(--neg)' : 'var(--pos)'}"
      stroke-width="8" stroke-opacity=".95" stroke-linejoin="round"/>
    <rect width="${W}" height="${H}" fill="url(#f${seed})"/>
  </svg>`;
}

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

// ── ground and mascot ────────────────────────────────────────
// Which ground each archetype stands on. Ink is the default, so only
// the departures are listed. The rule behind the choices: narrative on
// ink, Ron explaining on deep teal, evidence on slate, data on the
// document ground, and one board a deck allowed to shout in orange.
const GROUND = {
  coverFramed: 'deep',    // the digest opener, where he introduces
  note:        'deep',    // interpretation — his board
  item:        'slate',   // a story with a screenshot as evidence
  list:        'doc',     // several headlines, read as a record
  lesson:      'doc',     // a page from a notebook — the thing to keep
  brief:       'slate',
  outlook:     'slate',
  detail:      'doc',
  chart:       'doc',     // levels on paper
  watch:       'flare',   // the one that shouts
  telegram:    'deep',    // the sign-off
  ask:         'deep',    // the one board that asks for something
  coverBleed:  'ink',     // a scrim is mixed for a dark ground
  // The proof family stands on ONE reserved colour and nothing else
  // on the account is allowed to touch it — see the violet grounds in
  // slide.css. A reader should be able to tell a proof board from a
  // bulletin at arm's length, before reading a word of it.
  proofCert:    'sheet',  // white, with green reserved for VERIFIED
  proofVerdict: 'verd',   // the green field
  coverProof:   'verd',
  record:       'sheet',
  proofOrig:    'sheet',
  recordRows:   'sheet',
  analysts:     'doc',
  analystNote:  'deep',
};

// Which pose suits which board. The wardrobe rotates on top of this —
// same gesture, different outfit — so two consecutive decks never look
// like reruns even when they use the same archetypes.
const POSE = {
  coverFramed: 'welcome', cover: 'welcome',
  coverRule: 'explain', coverEdge: 'point', coverPoster: 'upward',
  coverBand: 'welcome', coverStack: 'yes', voice: 'explain',
  hero: 'point', note: 'explain', chart: 'upward',
  watch: 'pause', telegram: 'yes', ask: 'welcome',
  coverSplit: 'presenting', coverIndex: 'thinking', coverBracket: 'explain',
  coverFigure: 'point', scene: 'explain', sceneProof: 'proof-steady',
  // The proof boards have their own wardrobe — see PROOF below.
  proofCert: 'proof-point', proofVerdict: 'proof-steady',
  coverProof: 'proof-assured',
};
// Boards carrying evidence, plus the edged opening — there the accent
// bar already owns the reading edge, and a mascot lane on the other
// side left the headline a column six characters wide. One opening in
// seven without him is variety, not a loss.
// Boards he is kept off. The two new ones are not an oversight: the
// margin opening is BUILT from emptiness and he would fill exactly
// the space that is the design, and the bleed opening is a photograph
// edge to edge with nowhere for him to stand that is not on top of
// it.
const NO_RON = new Set(['item', 'list', 'coverEdge', 'coverMargin', 'coverBleed',
  // Text-first boards: the lesson needs the full measure for three
  // steps, and he has just presented the meaning on the board before.
  'lesson', 'brief', 'outlook', 'detail',
  // The record is a table. He has nowhere to stand on it.
  'record', 'proofOrig', 'recordRows', 'analysts', 'analystNote', 'card']);

/**
 * The mascot layer. `ctx.poses` is filled by render.js, which owns the
 * filesystem: { explain: [dataUri, dataUri, ...] } — one entry per
 * outfit for that gesture. `spin` rotates the wardrobe across the deck.
 */
// Which side he stands on, per archetype. The content needs this to
// leave him a lane, and the lane has to be on HIS side — in Hebrew the
// text starts at the right edge, so a mascot on the right is standing
// exactly where the first word lands.
const SIDE = { proofCert: 'right', proofVerdict: 'right',
               coverProof: 'right', cover: 'right', coverFramed: 'right', coverRule: 'right',
               coverBand: 'right', coverStack: 'right', coverPoster: 'right',
               coverEdge: 'left' };   // everything else: left

function ronSide(slide, ctx, i = 0) {
  return ronLayer(slide, ctx, i) ? (SIDE[slide.type] ?? 'left') : null;
}

// Story layouts that carry him. The other three are type alone —
// that is the whole reason the layouts exist, so it has to be checked
// here and not only in the CSS, or he renders under a headline sized
// for a board he is not on.
const STORY_RON = new Set(['top', 'base', 'bar', 'rules']);

function ronLayer(slide, ctx, i = 0) {
  // A scene without him is a background. He is the subject of the
  // reel, so no rule downstream gets to drop him from one.
  // A day-summary scene is ABOUT him — no rule downstream may drop
  // him from one. A proof scene is about the evidence, and he stands
  // on it only where he is invited.
  // The weekly reel's middle scenes are the news, with nobody in front
  // of it: a scene may opt out with ron:null like any other board.
  if (slide.type === 'scene' && slide.ron === null) return '';
  if (slide.type !== 'scene') {
    if (slide.ron === null || NO_RON.has(slide.type)) return '';
    if (slide.story && !STORY_RON.has(slide.story)) return '';
  }
  // A slide already carrying a photo has its image. Ron standing in
  // front of a screenshot is two subjects fighting, and on the framed
  // cover the frame landed across his face. One picture per board.
  if (slide.photo && slide.type !== 'scene' && slide.type !== 'sceneProof') return '';
  // A scene names its own gesture: the reel matches him to the story
  // — a hand up for a fall, an open hand for a rally — rather than to
  // the archetype, which is the same on every board.
  const gesture = slide.gesture ?? POSE[slide.type];
  const wardrobe = ctx.poses?.[gesture];
  if (!wardrobe?.length) return '';
  // The slide index is in the seed as well as the window's, or every
  // board in a set that happens to want the same gesture puts him in
  // the same shirt three times running.
  const src = wardrobe[((ctx.spin ?? 0) + i) % wardrobe.length];
  return `<div class="ron"><img src="${src}" alt=""></div>`;
}

// ── assembly ─────────────────────────────────────────────────
// Boards that carry evidence sit on the template's second ground.
const SECONDARY = new Set(['item', 'list', 'chart', 'watch', 'telegram', 'record']);

// The tape is the news board's signature row. A receipt has no tape.
const NO_TAPE = new Set(['telegram', 'proofCert', 'proofVerdict', 'coverProof', 'record', 'proofOrig', 'recordRows',
  'sceneProof']);
const COVERS = new Set(['cover', 'coverFramed']);   // overlay grid
const BLEED = new Set(['cover']);                  // photo escapes the band

/**
 * A cover's photo has to bleed behind the masthead, so it cannot live
 * inside .sl-bd - that band is a grid row and clips it. Covers emit
 * the image as a SIBLING of the body, positioned against the slide,
 * and .slide--cover switches the grid to overlay.
 */
const coverLayer = slide => {
  if (!BLEED.has(slide.type) || !slide.photo) return '';
  if (slide.type !== 'cover') return '';   // framed cover keeps its photo in flow
  return `<div class="cv-bleed"><img src="${esc(slide.photo.src)}" alt=""></div>`;
};

// "מה זה PCE?" — one plain line under the board, for the word a
// newcomer would otherwise stop at. See glossary.js.
function glossStrip(g) {
  if (!g?.length) return '';
  return `<div class="gls" data-protect="the glossary">${g.map(x =>
    `<p><b>${bidi(x.term)}</b><span>${bidi(x.says)}</span></p>`).join('')}</div>`;
}

export function buildSlide(slide, ctx, i, n, { story = false, layer = null } = {}) {
  const body = ARCHETYPES[slide.type];
  if (!body) throw new Error(`unknown archetype: ${slide.type}`);
  const cover = COVERS.has(slide.type);
  // render.js sets `squeeze` when a slide overruns its band: the body
  // scales down a notch and is re-measured, instead of the whole window
  // being thrown away for a headline that ran a hundred pixels long.
  // render.js may hand back an ronPlace after the mascot review; the
  // class is what CSS reads to shrink him or send him to the far edge.
  const place = slide.ronPlace ? ` of-${slide.ronPlace}` : '';
  // Now two-way: below 1 the band was overlong and is being squeezed,
  // above 1 it was underfull and is being grown.
  // ronK is the story board's first concession: before the type is
  // squeezed for a long headline, HE gets smaller, because he is the
  // decoration and the headline is the point.
  // Which of the template's two grounds this board stands on. The
  // openings and the interpretive boards take the primary; the boards
  // carrying evidence take the secondary, so a deck reads as two
  // related worlds rather than one flat one.
  const tpl = ctx.template ? byId(ctx.template) : null;
  const pal = slide.palette
    ?? (tpl ? (SECONDARY.has(slide.type) ? tpl.b : tpl.a) : null);
  // Inline, not a class: thirty templates would otherwise be thirty
  // near-identical blocks of CSS, and every component rule already
  // reads these tokens without knowing where they came from.
  const g = pal ? '' : (() => {
    const ground = slide.ground ?? GROUND[slide.type];
    return ground && ground !== 'ink' ? ` g-${ground}` : '';
  })();

  const props = [
    pal ? vars(pal) : null,
    slide.squeeze && slide.squeeze !== 1 ? `--sq:${slide.squeeze}` : null,
    slide.ronK && slide.ronK !== 1 ? `--ron-k:${slide.ronK}` : null,
    slide.ronFit ? `--ron-fit:${slide.ronFit}px` : null,
  ].filter(Boolean);
  const sq = props.length ? ` style="${props.join(';')}"` : '';
  // Stamped so the CSS can reserve his lane. Absent when he is not on
  // the board — a slide carrying a photo instead gets its full width.
  const side = ronSide(slide, ctx, i);
  const oa = side ? ` data-ron="${side}"` : '';
  // Three stories in a row should not be the same photograph three
  // times: he changes sides down the set.
  const alt = story && i % 2 === 1 ? ' of-alt' : '';
  // A reel board is NOT a story board that happens to move. It was
  // getting both classes, and slide--story pins him to an edge and
  // alternates sides down the set — which on a frame that centres him
  // meant half the scenes rendered with him sliced off at the margin.
  const reel = slide.type === 'scene' || slide.type === 'sceneProof';
  // A reel scene can be rendered as one flat frame, or split into the
  // layers that make it move: the market behind and the man in front.
  // Rendered apart they can be given different motion, and different
  // motion between planes is the whole difference between a picture
  // that drifts and a shot with depth in it.
  const lay = layer ? ` lay-${layer}` : '';
  // A proof board swaps the whole chrome, not just the body: its own
  // header band, no tape, and a footer that states the method instead
  // of counting slides.
  const isProof = PROOF.has(slide.type);
  const head = isProof ? proofHead(ctx, slide) : masthead(ctx);
  const tail = isProof ? proofFoot(slide) : foot(i + 1, n, slide.source, i + 1 < n ? slide.swipe : null);
  return `<div class="slide${lay}${story && !reel ? ' slide--story' + alt : ''}${reel ? ' slide--reel' : ''}${cover ? ' slide--cover' : ''}${isProof ? ' slide--proof' : ''}${g}${place}"${sq} data-type="${slide.type}"${slide.story ? ` data-story="${slide.story}"` : ''}${oa}><div class="bgm"></div>${coverLayer(slide)}
${head}<main class="sl-bd">${body({ ...slide, window: ctx.window, ronSide: side })}${glossStrip(slide.gloss)}${ronLayer(slide, ctx, i)}</main>${slide.tgStrip ? tgStrip(slide.tgStrip) : ''}${slide.day ? dayStrip(slide.day) : ''}${NO_TAPE.has(slide.type) ? '' : tape(ctx.quotes, ctx.stamp)}
${tail}</div>`;
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
