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
export const PALETTES = {
  // ── dark worlds ────────────────────────────────────────────
  ink:      { bg:'#0B0D10', fg:'#F2F0EB', dim:'#9AA0AA', dim2:'#C3C7CE', rule:'#262B33',
              acc:'#FF6B1A', pos:'#35D07F', neg:'#FF5A5A', grid:'rgba(242,240,235,.035)' },
  deep:     { bg:'#0E3540', fg:'#EFF6F6', dim:'#8FB6BE', dim2:'#CBE1E5', rule:'#1E5464',
              acc:'#FF6B1A', pos:'#35D07F', neg:'#FF7A6E', grid:'rgba(239,246,246,.04)' },
  slate:    { bg:'#1A2029', fg:'#F0F1F3', dim:'#98A1AE', dim2:'#C9CFD8', rule:'#2E3846',
              acc:'#FF6B1A', pos:'#35D07F', neg:'#FF5A5A', grid:'rgba(240,241,243,.035)' },
  midnight: { bg:'#0C1330', fg:'#EDEFFA', dim:'#8B93BE', dim2:'#C4C9E6', rule:'#232C55',
              acc:'#6E8BFF', pos:'#4FD9A4', neg:'#FF6B8A', grid:'rgba(237,239,250,.04)' },
  forest:   { bg:'#0B2418', fg:'#ECF5EE', dim:'#86AE96', dim2:'#C2DCCB', rule:'#1B4230',
              acc:'#F2B33D', pos:'#59E39B', neg:'#FF7A6E', grid:'rgba(236,245,238,.04)' },
  plum:     { bg:'#1E1030', fg:'#F3EDFA', dim:'#A48FC4', dim2:'#D4C7E6', rule:'#341E4E',
              acc:'#FF8FCF', pos:'#5FE0B0', neg:'#FF6B8A', grid:'rgba(243,237,250,.04)' },
  oxblood:  { bg:'#2A0F14', fg:'#F8ECEC', dim:'#BE9095', dim2:'#E4C9CB', rule:'#4A1F27',
              acc:'#F2A33D', pos:'#5FD79B', neg:'#FF8A7A', grid:'rgba(248,236,236,.04)' },
  steel:    { bg:'#152230', fg:'#EAF0F6', dim:'#8DA0B4', dim2:'#C2CFDC', rule:'#26384B',
              acc:'#4FC3E8', pos:'#4FD9A4', neg:'#FF6F7D', grid:'rgba(234,240,246,.04)' },
  carbon:   { bg:'#000000', fg:'#FFFFFF', dim:'#8A8A8A', dim2:'#C8C8C8', rule:'#242424',
              acc:'#E8FF4F', pos:'#5FFF9E', neg:'#FF5757', grid:'rgba(255,255,255,.05)' },
  espresso: { bg:'#20160F', fg:'#F6EEE4', dim:'#B29B84', dim2:'#DFCDB9', rule:'#3A2A1D',
              acc:'#FFB454', pos:'#6FD79B', neg:'#FF8A7A', grid:'rgba(246,238,228,.04)' },

  // ── paper worlds ───────────────────────────────────────────
  doc:      { bg:'#EDE8DE', fg:'#14161A', dim:'#6C6659', dim2:'#3C3A34', rule:'#C6BEAE',
              acc:'#FF6B1A', pos:'#12833F', neg:'#B0271F', grid:'rgba(20,22,26,.05)' },
  ice:      { bg:'#E8EFF5', fg:'#0F1A24', dim:'#5E7387', dim2:'#2C3E4E', rule:'#BACBD9',
              acc:'#0F62C4', pos:'#0E7A47', neg:'#B0271F', grid:'rgba(15,26,36,.05)' },
  mint:     { bg:'#E4F0E9', fg:'#0D1E16', dim:'#5B7A69', dim2:'#284535', rule:'#B7D2C2',
              acc:'#0E7A47', pos:'#0E7A47', neg:'#B0271F', grid:'rgba(13,30,22,.05)' },
  sand:     { bg:'#F2E7D3', fg:'#1D1710', dim:'#7A6A50', dim2:'#413523', rule:'#D3C2A2',
              acc:'#C4520F', pos:'#12833F', neg:'#B0271F', grid:'rgba(29,23,16,.05)' },

  // ── fields: the accent IS the ground ───────────────────────
  flare:    { bg:'#FF6B1A', fg:'#120A04', dim:'rgba(18,10,4,.62)', dim2:'rgba(18,10,4,.84)',
              rule:'rgba(18,10,4,.3)', acc:'#120A04', pos:'#120A04', neg:'#120A04',
              grid:'rgba(20,22,26,.05)' },
  citrus:   { bg:'#E8FF4F', fg:'#12140A', dim:'rgba(18,20,10,.6)', dim2:'rgba(18,20,10,.84)',
              rule:'rgba(18,20,10,.28)', acc:'#12140A', pos:'#12140A', neg:'#12140A',
              grid:'rgba(18,20,10,.05)' },
  cobalt:   { bg:'#1F4FE0', fg:'#F4F7FF', dim:'rgba(244,247,255,.66)', dim2:'rgba(244,247,255,.88)',
              rule:'rgba(244,247,255,.3)', acc:'#E8FF4F', pos:'#8CF5C0', neg:'#FFB0B8',
              grid:'rgba(244,247,255,.06)' },
  rose:     { bg:'#E8467A', fg:'#FFF2F6', dim:'rgba(255,242,246,.68)', dim2:'rgba(255,242,246,.9)',
              rule:'rgba(255,242,246,.32)', acc:'#FFE45C', pos:'#9BF5CE', neg:'#FFD2D8',
              grid:'rgba(255,242,246,.06)' },
  jade:     { bg:'#0FA97A', fg:'#04211A', dim:'rgba(4,33,26,.62)', dim2:'rgba(4,33,26,.85)',
              rule:'rgba(4,33,26,.28)', acc:'#04211A', pos:'#04211A', neg:'#04211A',
              grid:'rgba(4,33,26,.05)' },
  violet:   { bg:'#6B3BE8', fg:'#F5F1FF', dim:'rgba(245,241,255,.66)', dim2:'rgba(245,241,255,.88)',
              rule:'rgba(245,241,255,.3)', acc:'#E8FF4F', pos:'#9BF5CE', neg:'#FFB0C4',
              grid:'rgba(245,241,255,.06)' },
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
  T( 9, 'Orchard',       'coverBand',   'forest',   'mint'),
  T(10, 'Bulletin',      'coverRule',   'ice',      'steel'),
  T(11, 'Voltage',       'coverPoster', 'citrus',   'carbon'),
  T(12, 'Cellar',        'coverStack',  'oxblood',  'espresso'),
  T(13, 'Meridian',      'coverEdge',   'cobalt',   'midnight'),
  T(14, 'Foundry',       'coverFramed', 'espresso', 'sand'),
  T(15, 'Almanac',       'coverBand',   'doc',      'sand'),
  T(16, 'Nocturne',      'coverStack',  'plum',     'midnight'),
  T(17, 'Beacon',        'coverPoster', 'rose',     'plum'),
  T(18, 'Glasshouse',    'coverRule',   'mint',     'forest'),
  T(19, 'Ironworks',     'coverEdge',   'slate',    'carbon'),
  T(20, 'Verdigris',     'coverFramed', 'jade',     'forest'),
  T(21, 'Dispatch',      'coverBand',   'ink',      'deep'),
  T(22, 'Ultraviolet',   'coverPoster', 'violet',   'plum'),
  T(23, 'Frostline',     'coverStack',  'ice',      'midnight'),
  T(24, 'Kiln',          'coverEdge',   'oxblood',  'flare'),
  T(25, 'Counting House','coverRule',   'sand',     'doc'),
  T(26, 'Undertow',      'coverFramed', 'midnight', 'deep'),
  T(27, 'Switchboard',   'coverBand',   'steel',    'slate'),
  T(28, 'Ember',         'coverStack',  'espresso', 'oxblood'),
  T(29, 'Harbour',       'coverEdge',   'deep',     'ice'),
  T(30, 'Blacktop',      'coverPoster', 'carbon',   'citrus'),
];

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
       + `--acc:${p.acc};--pos:${p.pos};--neg:${p.neg};--grid:${p.grid}`;
}

/** Light grounds need a different scrim and shadow than dark ones. */
export const isLight = name =>
  ['doc', 'ice', 'mint', 'sand', 'flare', 'citrus', 'jade'].includes(name);
