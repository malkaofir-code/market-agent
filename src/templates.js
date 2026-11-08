// ─────────────────────────────────────────────────────────────
// templates.js — the look of one window.
//
// A TEMPLATE is a colour world plus an opening composition. It is not
// a layout: the archetypes in builder.js still decide what a board
// contains. A template decides what the deck FEELS like, and — the
// point of the whole file — it decides what the first slide looks
// like, because the first slide is the only one most people see.
//
// Palettes are applied as inline custom properties rather than as
// thirty CSS classes. Every component rule already reads these tokens,
// so nothing downstream knows or cares which world it is standing in.
// ─────────────────────────────────────────────────────────────

/**
 * A palette is the complete token set for one ground.
 *
 * `pos` and `neg` are re-mixed per world, not inherited: #35D07F is a
 * clean green on near-black and a highlighter on paper. Same for the
 * grid, which has to be ink on a light ground and light on a dark one.
 */
export // No green FIELD and no white SHEET may be added to this table.
//
// Green is the proof boards' colour and white is their paper, and the
// whole point of reserving them is that a reader scrolling past knows
// what they are looking at before reading a word. A green ground on
// an ordinary Tuesday digest spends that recognition for nothing.
//
// Two grounds here were green fields (jade, mint) and three templates
// stood on them; they were repointed at sand, ice and steel and the
// palettes deleted. Green as a FIGURE colour is untouched and stays
// everywhere — `pos` below is green in almost every palette, because
// on a news board green is the direction of a number. On a proof
// board it is the status of a claim. Those two meanings must not be
// allowed to meet.
//
// The reserved grounds live in slide.css as .g-sheet / .g-verd and
// are reachable only through the proof archetypes' GROUND map.
const PALETTES = {
  // ── dark worlds ────────────────────────────────────────────
  // Nov 2026: one brand ground (ink) for every card; the five dark grounds
  // below are the weekly reel's scene rotation and nothing else.
  ink:      { bg:'#0B0D10', fg:'#F2F0EB', dim:'#9AA0AA', dim2:'#C3C7CE', rule:'#262B33',
              acc:'#FF6B1A', pos:'#35D07F', neg:'#FF5A5A', grid:'rgba(242,240,235,.035)' },
  deep:     { bg:'#0E3540', fg:'#EFF6F6', dim:'#8FB6BE', dim2:'#CBE1E5', rule:'#1E5464',
              acc:'#FF6B1A', pos:'#35D07F', neg:'#FF7A6E', grid:'rgba(239,246,246,.04)' },
  midnight: { bg:'#0C1330', fg:'#EDEFFA', dim:'#8B93BE', dim2:'#C4C9E6', rule:'#232C55',
              acc:'#6E8BFF', pos:'#4FD9A4', neg:'#FF6B8A', grid:'rgba(237,239,250,.04)' },
  abyss:    { bg:'#03181C', fg:'#E8F6F7', dim:'#7BA5AB', dim2:'#BEDDE1', rule:'#0E3238',
              acc:'#2FD4E8', pos:'#4FE0A8', neg:'#FF7A85', grid:'rgba(232,246,247,.04)' },
  navy:     { bg:'#0A1A33', fg:'#EEF3FB', dim:'#8199B8', dim2:'#C2D2E7', rule:'#182F52',
              acc:'#F5C451', pos:'#4FD9A4', neg:'#FF7A88', grid:'rgba(238,243,251,.04)' },
  basalt:   { bg:'#101418', fg:'#E9EDF0', dim:'#7E8A94', dim2:'#B8C2CA', rule:'#1F262D',
              acc:'#7AE8C0', pos:'#7AE8C0', neg:'#FF6F7D', grid:'rgba(233,237,240,.035)' },

  // ── paper worlds ───────────────────────────────────────────
};

/**
 * The thirty.
 *
 * `cover` is the opening composition — the thing the rotation exists
 * to vary, because two windows that open the same way read as the same
 * post. `a` dresses the covers and the interpretive boards; `b` dresses
 * the boards that carry evidence, so a deck has two related grounds
 * rather than one flat one.
 */
const T = (id, name, cover, a, b) => ({ id, name, cover, a, b });

export const TEMPLATES = [
  T( 1, 'Tape',          'coverFramed', 'deep',     'slate'),
  T( 2, 'Broadsheet',    'coverRule',   'doc',      'ink'),
  T( 3, 'Nightdesk',     'cover',       'ink',      'slate'),
  T( 4, 'Signal',        'coverEdge',   'midnight', 'steel'),
  T( 5, 'Klaxon',        'coverPoster', 'flare',    'ink'),
  T( 6, 'Ledger',        'coverBand',   'sand',     'espresso'),
  T( 7, 'Terminal',      'coverStack',  'carbon',   'ink'),
  T( 8, 'Deepwater',     'coverFramed', 'steel',    'midnight'),
  T( 9, 'Orchard',       'coverBand',   'forest',   'sand'),
  T(10, 'Bulletin',      'coverRule',   'ice',      'steel'),
  T(11, 'Voltage',       'coverPoster', 'citrus',   'carbon'),
  T(12, 'Cellar',        'coverStack',  'oxblood',  'espresso'),
  T(13, 'Meridian',      'coverEdge',   'cobalt',   'midnight'),
  T(14, 'Foundry',       'coverFramed', 'espresso', 'sand'),
  T(15, 'Almanac',       'coverBand',   'doc',      'sand'),
  T(16, 'Nocturne',      'coverStack',  'midnight', 'steel'),
  T(17, 'Beacon',        'coverPoster', 'rose',     'oxblood'),
  T(18, 'Glasshouse',    'coverRule',   'ice',      'steel'),
  T(19, 'Ironworks',     'coverEdge',   'slate',    'carbon'),
  T(20, 'Anchorage',     'coverFramed', 'steel',    'midnight'),
  T(21, 'Dispatch',      'coverBand',   'ink',      'deep'),
  T(22, 'Blackout',      'coverPoster', 'carbon',   'steel'),
  T(23, 'Frostline',     'coverStack',  'ice',      'midnight'),
  T(24, 'Kiln',          'coverEdge',   'oxblood',  'flare'),
  T(25, 'Counting House','coverRule',   'sand',     'doc'),
  T(26, 'Undertow',      'coverFramed', 'midnight', 'deep'),
  T(27, 'Switchboard',   'coverBand',   'steel',    'slate'),
  T(28, 'Ember',         'coverStack',  'espresso', 'oxblood'),
  T(29, 'Harbour',       'coverEdge',   'deep',     'ice'),
  T(30, 'Blacktop',      'coverPoster', 'carbon',   'citrus'),

  // ── the second thirty ────────────────────────────────────
  // Four openings became eleven and twenty palettes became
  // thirty-two, so none of these repeats a pair already above. Two of
  // the new openings are formats the set simply did not have: a
  // full-bleed photograph, and a figure at the size of the board.
  T(31, 'Seam',          'coverSplit',   'graphite', 'basalt'),
  T(32, 'Chapter',       'coverIndex',   'linen',    'newsprint'),
  T(33, 'Quotation',     'coverBracket', 'navy',     'steel'),
  T(34, 'Wide Margin',   'coverMargin',  'newsprint','linen'),
  T(35, 'Nightfall',     'coverBleed',   'ink',      'graphite'),
  T(36, 'Big Number',    'coverFigure',  'carbon',   'graphite'),
  T(37, 'Rustbelt',      'coverSplit',   'oxide',    'espresso'),
  T(38, 'Ledgerline',    'coverIndex',   'doc',      'linen'),
  T(39, 'Deep Field',    'coverBracket', 'abyss',    'basalt'),
  T(40, 'Salt Flat',     'coverMargin',  'sky',      'ice'),
  T(41, 'Long Exposure', 'coverBleed',   'abyss',    'navy'),
  T(42, 'Tally',         'coverFigure',  'moss',     'forest'),
  T(43, 'Vintner',       'coverSplit',   'wine',     'oxblood'),
  T(44, 'Index Card',    'coverIndex',   'newsprint','graphite'),
  T(45, 'Basalt',        'coverBracket', 'basalt',   'graphite'),
  T(46, 'Long Shore',    'coverMargin',  'linen',    'doc'),
  T(47, 'Undertow II',   'coverBleed',   'navy',     'abyss'),
  T(48, 'Counter',       'coverFigure',  'ochre',    'sand'),
  T(49, 'Kilnworks',     'coverSplit',   'oxide',    'oxblood'),
  T(50, 'Powder',        'coverMargin',  'blush',    'rose'),
];

/**
 * Story templates are a different thing, and it took a contact sheet
 * to see why.
 *
 * A story is ONE board, so the second ground a post uses for its
 * evidence slides has nothing to dress — which meant a story template
 * was only ever a colour, and thirty of them dressed one vertical
 * arrangement thirty times. Twenty palettes, one composition, sixty
 * per cent of a 1920px canvas empty.
 *
 * So the varying dimension here is the LAYOUT: where the block sits
 * in the height, what marks the page, and — the part that actually
 * broke the sameness — whether the mascot is on the board at all.
 * Three of the seven drop him, and the type doubles into the room he
 * was taking.
 */
const S = (id, name, layout, pal) => ({ id, name, layout, pal });

/** Layouts that carry the mascot. The rest are type alone. */
export const STORY_RON = new Set(['top', 'base', 'bar', 'rules']);

export const STORY_TEMPLATES = [
  S(101, 'Highwater',     'top',    'abyss'),
  S(102, 'Say It',        'quote',  'graphite'),
  S(103, 'Low Tide',      'base',   'navy'),
  S(104, 'Banner',        'bar',    'oxide'),
  S(105, 'Passepartout',  'frame',  'linen'),
  S(106, 'Broadsheet II', 'rules',  'newsprint'),
  S(107, 'Wash',          'flood',  'basalt'),
  S(108, 'Signalman',     'bar',    'ochre'),
  S(109, 'Vitrine',       'frame',  'wine'),
  S(110, 'Column',        'rules',  'moss'),
  S(111, 'Shoreline',     'base',   'sky'),
  S(112, 'Crest',         'top',    'wine'),
  S(113, 'Quiet Room',    'quote',  'blush'),
  S(114, 'Flagship',      'bar',    'navy'),
  S(115, 'Cabinet',       'frame',  'graphite'),
  S(116, 'Masthead',      'rules',  'linen'),
  S(117, 'Undercurrent',  'base',   'moss'),
  S(118, 'Lantern',       'top',    'ochre'),
  S(119, 'Placard',       'quote',  'newsprint'),
  S(120, 'Spill',         'flood',  'navy'),
];

export const byStoryId = id =>
  STORY_TEMPLATES.find(t => t.id === id) ?? STORY_TEMPLATES[0];

/**
 * Same anti-repeat contract as the posts, on the axis that matters
 * here: never the same LAYOUT twice running, then never a template
 * from the last `memory` hours.
 */
export function pickStoryTemplate(recent = [], seed = 0) {
  const last = recent[0] ? byStoryId(recent[0]).layout : null;
  const fresh = STORY_TEMPLATES.filter(t => !recent.includes(t.id));
  const pool = fresh.length ? fresh : STORY_TEMPLATES;
  const better = pool.filter(t => t.layout !== last);
  const from = better.length ? better : pool;
  return from[Math.abs(seed) % from.length];
}

export const byId = id => TEMPLATES.find(t => t.id === id) ?? TEMPLATES[0];

/**
 * Choose a template that is not one of the recent ones.
 *
 * Two rules, in order of stubbornness: never repeat the OPENING
 * COMPOSITION of the last deck, and never reuse a template from the
 * last `memory` windows. The first is what the eye actually notices
 * scrolling a profile grid; the second stops the palette cycling in a
 * visible pattern.
 *
 * `seed` keeps it deterministic per window, so a replay of a window
 * reproduces the deck it replayed rather than inventing a new look.
 */
export function pickTemplate(recent = [], seed = 0) {
  const lastId = recent[0];
  const lastCover = lastId ? byId(lastId).cover : null;

  const fresh = TEMPLATES.filter(t => !recent.includes(t.id));
  const pool = fresh.length ? fresh : TEMPLATES;
  const better = pool.filter(t => t.cover !== lastCover);
  const from = better.length ? better : pool;

  return from[Math.abs(seed) % from.length];
}

/** The recent list, newest first, capped. */
export function remember(recent = [], id, memory = 12) {
  return [id, ...recent.filter(x => x !== id)].slice(0, memory);
}

/** Inline custom properties for one palette. */
export function vars(name) {
  const p = PALETTES[name] ?? PALETTES.ink;
  return `--bg:${p.bg};--fg:${p.fg};--dim:${p.dim};--dim2:${p.dim2};--rule:${p.rule};`
       + `--acc:${p.acc};--pos:${p.pos};--neg:${p.neg};--grid:${p.grid}`
       // An accent bright enough for a dark ground is too pale to READ on
       // a light one: orange text on paper measured 2.3:1. Text set in the
       // accent on a light ground uses it darkened; fills keep the original.
       + (isLight(name) ? `;--acc-ink:color-mix(in srgb, ${p.acc} 55%, #000)` : '');
}

/** Light grounds need a different scrim and shadow than dark ones. */
export const isLight = name =>
  ['doc', 'ice', 'sand', 'flare', 'citrus', 'linen', 'newsprint', 'blush', 'sky', 'ochre'].includes(name);
