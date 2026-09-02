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
};
// Boards carrying evidence, plus the edged opening — there the accent
// bar already owns the reading edge, and a mascot lane on the other
// side left the headline a column six characters wide. One opening in
// seven without him is variety, not a loss.
const NO_RON = new Set(['item', 'list', 'coverEdge']);

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

function ronLayer(slide, ctx, i = 0) {
  if (slide.ron === null || NO_RON.has(slide.type)) return '';
  // A slide already carrying a photo has its image. Ron standing in
  // front of a screenshot is two subjects fighting, and on the framed
  // cover the frame landed across his face. One picture per board.
  if (slide.photo) return '';
  const gesture = POSE[slide.type];
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

export function buildSlide(slide, ctx, i, n, { story = false } = {}) {
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
  return `<div class="slide${story ? ' slide--story' + alt : ''}${cover ? ' slide--cover' : ''}${g}${place}"${sq} data-type="${slide.type}"${oa}><div class="bgm"></div>${coverLayer(slide)}
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
