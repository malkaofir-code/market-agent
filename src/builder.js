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

// ── band D: footnote ─────────────────────────────────────────
function foot(i, n, src) {
  return `<footer class="sl-ft"><span class="ft-ix">${pad2(i)}/${pad2(n)}</span>
<span class="ft-src">${src ? bidi(src) : ''}</span>
<span class="ft-hd">${HANDLE}</span></footer>`;
}

// ── band B: the six archetypes ───────────────────────────────
const photo = (p, stat) => p
  ? `<div class="ph" data-protect="the source photo" style="height:${p.h ?? 452}px"><img src="${esc(p.src)}" alt="">${
      stat ? `<span class="stat">${esc(stat)}</span>` : ''}</div>`
  : '';

const ARCHETYPES = {
  // 01 · cover — the photo bleeds off the top and dissolves into the
  // ground; the headline sits inside the fade rather than beside it.
  cover: s => `<div class="a-cv">
    <div class="txt"><p class="eyeb">${bidi(s.eyebrow || 'הסיפור של החלון')}</p>
    <h1>${bidi(s.headline)}</h1>
    <p class="stand">${bidi(s.stand)}</p></div></div>`,

  // 01b · cover, framed — the composition carried over from direction
  // B: the photo as a physical object, headline block cutting across.
  // Standing cover; `cover` above stays for windows with no image.
  coverFramed: s => `<div class="a-cf">
    ${s.photo ? `<div class="frame"><img src="${esc(s.photo.src)}" alt=""></div>` : ''}
    <div class="block"><p class="eyeb">${bidi(s.eyebrow || 'הסיפור של החלון')}</p>
    <h1>${bidi(s.headline)}</h1></div>
    <p class="stand">${bidi(s.stand)}</p><div class="kick"></div></div>`,

  // 01c · cover, ruled — the broadsheet opening. A heavy rule, a small
  // eyebrow, and a headline given the whole width. No picture competes
  // with it; when the window has one it goes on a later board.
  coverRule: s => `<div class="a-cr">
    <div class="cr-bar"></div>
    <p class="eyeb">${bidi(s.eyebrow || 'הסיפור של החלון')}</p>
    <h1>${bidi(s.headline)}</h1>
    <div class="cr-hr"></div>
    <p class="stand">${bidi(s.stand)}</p></div>`,

  // 01d · cover, edged — a full-height accent bar down the reading
  // edge. In RTL that is the RIGHT, which is where the eye starts, so
  // the bar is the first thing seen and the headline hangs off it.
  coverEdge: s => `<div class="a-ce"><div class="ce-bar"></div>
    <div class="txt"><p class="eyeb">${bidi(s.eyebrow || 'הסיפור של החלון')}</p>
    <h1>${bidi(s.headline)}</h1>
    <p class="stand">${bidi(s.stand)}</p></div></div>`,

  // 01e · cover, poster — one thing, enormous. Everything else is
  // reduced to a caption. For the loud grounds, where a paragraph of
  // standfirst on a field of orange is unreadable anyway.
  coverPoster: s => `<div class="a-po">
    <p class="eyeb">${bidi(s.eyebrow || 'עכשיו')}</p>
    <h1>${bidi(s.headline)}</h1>
    <p class="cap">${bidi(s.stand)}</p></div>`,

  // 01f · cover, banded — the headline inverted inside a solid band
  // across the middle, the picture above it, the standfirst below.
  coverBand: s => `<div class="a-cb">
    ${s.photo ? `<div class="cb-ph"><img src="${esc(s.photo.src)}" alt=""></div>` : ''}
    <div class="cb-band"><p class="eyeb">${bidi(s.eyebrow || 'הסיפור של החלון')}</p>
    <h1>${bidi(s.headline)}</h1></div>
    <p class="stand">${bidi(s.stand)}</p></div>`,

  // 01g · cover, stacked — the headline boxed like something coming
  // off a wire, with a stamped index. The most machine-like opening in
  // the set, for the grounds that can carry it.
  coverStack: s => `<div class="a-ck">
    <div class="ck-tab">${bidi(s.eyebrow || 'עדכון')}</div>
    <div class="ck-box"><h1>${bidi(s.headline)}</h1></div>
    <p class="stand">${bidi(s.stand)}</p></div>`,

  // 01h · cover, split — the board cut in two. An accent field holds
  // the eyebrow, the headline crosses the seam so it belongs to
  // neither half. The seam is the composition; nothing else on the
  // board is decorated.
  coverSplit: s => `<div class="a-sp">
    <div class="sp-field"><p class="eyeb">${bidi(s.eyebrow || 'הסיפור של החלון')}</p></div>
    <h1>${bidi(s.headline)}</h1>
    <p class="stand">${bidi(s.stand)}</p></div>`,

  // 01i · cover, index — a chapter opener. The hour enormous as a
  // numeral, the headline small beneath it. Inverts the usual
  // hierarchy: the biggest thing carries the least information, which
  // is what makes it read as a record rather than a bulletin.
  coverIndex: s => `<div class="a-ix">
    <p class="ix-n">${esc(s.index ?? '01')}</p>
    <div class="ix-hr"></div>
    <p class="eyeb">${bidi(s.eyebrow || 'הסיפור של החלון')}</p>
    <h1>${bidi(s.headline)}</h1>
    <p class="stand">${bidi(s.stand)}</p></div>`,

  // 01j · cover, bracket — the headline held in a drawn bracket.
  // Drawn with borders, not a glyph: a quotation mark inside an RTL
  // line is a bidi argument nobody wins, and a border has no
  // direction.
  coverBracket: s => `<div class="a-bk">
    <p class="eyeb">${bidi(s.eyebrow || 'הסיפור של החלון')}</p>
    <div class="bk-hold"><h1>${bidi(s.headline)}</h1></div>
    <p class="stand">${bidi(s.stand)}</p></div>`,

  // 01k · cover, margin — a narrow column against a wide empty field.
  // The quietest opening in the set and the only one that GAINS from
  // emptiness, which is why it takes no mascot: he would fill exactly
  // the space that is the design.
  coverMargin: s => `<div class="a-mg">
    <div class="mg-col"><p class="eyeb">${bidi(s.eyebrow || 'הסיפור של החלון')}</p>
      <h1>${bidi(s.headline)}</h1>
      <div class="mg-hr"></div>
      <p class="stand">${bidi(s.stand)}</p></div></div>`,

  // 01l · cover, bleed — the photograph as the whole board, headline
  // burned into the bottom over a scrim. Forty-four per cent of the
  // source messages carry a picture and not one opening used it
  // full-bleed; they framed it, banded it or ignored it. Without a
  // photo it falls back to the ruled opening rather than rendering an
  // empty scrim.
  coverBleed: s => s.photo ? `<div class="a-bl">
    <img class="bl-img" src="${esc(s.photo.src)}" alt="">
    <div class="bl-scrim"></div>
    <div class="bl-txt"><p class="eyeb">${bidi(s.eyebrow || 'עכשיו')}</p>
      <h1>${bidi(s.headline)}</h1></div></div>` : ARCHETYPES.coverRule(s),

  // 01m · cover, figure — the number at the size of the board, the
  // headline reduced to a caption. For a market account this is the
  // most legible thing that can go in a feed: a reader moving fast
  // reads one number and either stops or does not. Falls back when
  // the window's lead carries no clean figure.
  coverFigure: s => s.figure ? `<div class="a-fg">
    <p class="eyeb">${bidi(s.eyebrow || 'עכשיו')}</p>
    <p class="fg-n">${esc(s.figure)}</p>
    <h1>${bidi(s.headline)}</h1></div>` : ARCHETYPES.coverPoster(s),

  // 02 · hero figure — sized to its measure, not to a constant.
  hero: s => {
    // The measure is the COLUMN, not the canvas. With Ron on the board
    // a lane is gone, and a figure sized against the full 1080 grew
    // straight through him — the review then shrank him instead, which
    // is the wrong end of the problem to fix.
    const room = s.ronSide ? 600 : 940;
    const size = Math.min(s.ronSide ? 208 : 258, Math.floor(room / (String(s.figure).length * 0.62)));
    return `<div class="a-hr"><p class="eyeb">${bidi(s.eyebrow || 'המספר של החלון')}</p>
    <p class="fig ${s.dir ?? ''}" data-protect="the figure" style="font-size:${size}px">${esc(s.figure)}</p>
    ${photo(s.photo && { ...s.photo, h: 300 })}
    <p class="quo">${bidi(s.quote)}</p></div>`;
  },

  // 03 · item — one story, its photo, and the sentence under it.
  item: s => `<div class="a-it">
    <div class="hd"><span class="rowidx">${pad2(s.n)}</span><h2>${bidi(s.headline)}</h2></div>
    ${photo(s.photo, s.stat)}
    ${s.body ? `<p class="body">${bidi(s.body)}</p>` : ''}</div>`,

  // 04 · interpretation — the one heavy frame in the system.
  note: s => `<div class="a-nt"><p class="eyeb">MEANING · משמעות</p>
    ${s.about ? `<p class="abt">${bidi(s.about)}</p>` : ''}
    ${(s.basis?.length || s.stat) ? `<div class="why">
      <p class="why-k">מה דווח</p>
      ${s.stat ? `<p class="why-n">${bidi(s.stat)}</p>` : ''}
      ${(s.basis ?? []).map(b => `<p class="why-l">${bidi(b)}</p>`).join('')}
    </div>` : ''}
    <p class="txt">${bidi(s.text)}</p>
    <p class="dis">${bidi(s.disclaimer || 'פרשנות, לא המלצה.')}</p></div>`,

  // 04b · Ron's board — the interpretation, with him presenting it.
  //
  // He is the one thing on this account nobody else can copy: a feed
  // of market headlines is a utility, and utilities get muted, while
  // a character is a reason to follow. So once a deck he stops being
  // decoration and stands next to the day's "so what".
  //
  // The tail on the block points at him, which is what makes it read
  // as speech rather than as a caption that happens to sit near a
  // drawing. The source stays credited in the footer and the
  // disclaimer stays on the board: he PRESENTS the interpretation,
  // he is not being passed off as its author.
  voice: s => `<div class="a-vo">
    <p class="eyeb">רון מסביר</p>
    <div class="say"><p class="txt">${bidi(s.text)}</p></div>
    ${s.about ? `<p class="abt">${bidi(s.about)}</p>` : ''}
    <p class="dis">${bidi(s.disclaimer || 'פרשנות, לא המלצה.')}</p></div>`,

  // 05 · tape chart — hand-built bars, pinned LTR.
  chart: s => `<div class="a-ch"><p class="eyeb">TAPE · חוזים עתידיים</p>
    <h2>${bidi(s.title || 'התמונה בחוזים')}</h2>
    <div class="bars" data-protect="the chart">${s.series.map(d => {
      const sg = sign(d.chg), w = Math.min(46, Math.abs(d.chg) * 36);
      return `<div class="bar"><span class="sym">${esc(d.sym)}</span>
      <div class="track"><div class="fill ${sg}" style="width:${w}%"></div><div class="zero"></div></div>
      <span class="val ${sg}">${fmtPct(d.chg)}</span></div>`;
    }).join('')}</div>
    <p class="note">נכון ל־${bidi(s.stamp)} · שעון ישראל</p></div>`,

  // 06 · list — everything that did not earn its own photo slide.
  list: s => `<div class="a-ls"><h2>${bidi(s.title || 'עוד מהחלון הזה')}</h2><div class="rows" data-protect="the list">${
    s.rows.map(r => `<div class="row"><span class="row-n">${pad2(r.n)}</span>
    <span><p class="row-h">${bidi(r.headline)}</p>${
      r.source ? `<span class="row-s">${bidi(r.source)}</span>` : ''}</span></div>`).join('')
  }</div></div>`,

  // 07 · what to watch — a single sentence, no furniture competing.
  watch: s => `<div class="a-wt"><p class="eyeb">${bidi(s.eyebrow || 'מה לעקוב')}</p>
    <p class="big">${bidi(s.text)}</p><div class="kick"></div></div>`,

  // 08 · telegram — once a day, on the 23:00 deck.
  telegram: s => `<div class="a-tg"><p class="eyeb">TELEGRAM · בזמן אמת</p>
    <p class="big">${bidi(s.big)}</p>
    <div class="sched">${(s.schedule || []).map(r =>
      `<div class="sr"><span class="st">${esc(r.time)}</span><span class="se">${bidi(r.label)}</span></div>`
    ).join('')}</div>
    <div class="link">${esc(s.link)}</div></div>`,

  // 09 · the scene — the reel's board, and nothing like the others.
  //
  // Every other archetype here is a page: text laid on a field, read
  // at the reader's pace. This is a FRAME. He stands in a market that
  // is visibly doing something, one short line sits over it, and the
  // viewer has under two seconds to take it in — so the headline is
  // short, enormous, and carries a single accented word to land the
  // eye somewhere specific.
  scene: s => `<div class="a-sn${s.photo ? ' has-ph' : ''}${s.lead ? ' is-lead' : ''}">
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

  // 08 · the ask.
  //
  // The deck has never asked for anything. Saves and shares are what
  // the ranking actually rewards — a save says "I will need this
  // again", a share puts the account in front of someone who has
  // never seen it — and a reader who was not asked does neither.
  //
  // One board, at the end, where the reader has already got the news
  // and owes nothing. Never on the cover, which is a headline's job,
  // and never on a news board, which would make the reporting look
  // like bait.
  ask: s => `<div class="a-ask"><p class="eyeb">${bidi(s.eyebrow || 'לפני שאתם ממשיכים')}</p>
    <p class="big">${bidi(s.big)}</p>
    <div class="acts" data-protect="the three asks">${(s.acts || []).map(a =>
      `<div class="act"><span class="ai">${esc(a.mark)}</span><span class="al">${bidi(a.label)}</span></div>`
    ).join('')}</div>
    ${s.foot ? `<p class="afoot" data-protect="the sign-off">${bidi(s.foot)}</p>` : ''}</div>`,
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
  chart:       'doc',     // levels on paper
  watch:       'flare',   // the one that shouts
  telegram:    'deep',    // the sign-off
  ask:         'deep',    // the one board that asks for something
  coverBleed:  'ink',     // a scrim is mixed for a dark ground
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
  coverFigure: 'point', scene: 'explain',
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
const NO_RON = new Set(['item', 'list', 'coverEdge', 'coverMargin', 'coverBleed']);

/**
 * The mascot layer. `ctx.poses` is filled by render.js, which owns the
 * filesystem: { explain: [dataUri, dataUri, ...] } — one entry per
 * outfit for that gesture. `spin` rotates the wardrobe across the deck.
 */
// Which side he stands on, per archetype. The content needs this to
// leave him a lane, and the lane has to be on HIS side — in Hebrew the
// text starts at the right edge, so a mascot on the right is standing
// exactly where the first word lands.
const SIDE = { cover: 'right', coverFramed: 'right', coverRule: 'right',
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
  if (slide.type !== 'scene') {
    if (slide.ron === null || NO_RON.has(slide.type)) return '';
    if (slide.story && !STORY_RON.has(slide.story)) return '';
  }
  // A slide already carrying a photo has its image. Ron standing in
  // front of a screenshot is two subjects fighting, and on the framed
  // cover the frame landed across his face. One picture per board.
  if (slide.photo && slide.type !== 'scene') return '';
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
const SECONDARY = new Set(['item', 'list', 'chart', 'watch', 'telegram']);

const NO_TAPE = new Set(['telegram']);
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
  const reel = slide.type === 'scene';
  // A reel scene can be rendered as one flat frame, or split into the
  // layers that make it move: the market behind and the man in front.
  // Rendered apart they can be given different motion, and different
  // motion between planes is the whole difference between a picture
  // that drifts and a shot with depth in it.
  const lay = layer ? ` lay-${layer}` : '';
  return `<div class="slide${lay}${story && !reel ? ' slide--story' + alt : ''}${reel ? ' slide--reel' : ''}${cover ? ' slide--cover' : ''}${g}${place}"${sq} data-type="${slide.type}"${slide.story ? ` data-story="${slide.story}"` : ''}${oa}><div class="bgm"></div>${coverLayer(slide)}
${masthead(ctx)}<main class="sl-bd">${body({ ...slide, window: ctx.window, ronSide: side })}${ronLayer(slide, ctx, i)}</main>${slide.tgStrip ? tgStrip(slide.tgStrip) : ''}${NO_TAPE.has(slide.type) ? '' : tape(ctx.quotes, ctx.stamp)}
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
