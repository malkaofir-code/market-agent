// ─────────────────────────────────────────────────────────────
// render.js — deck plan -> 1080x1350 PNGs.
// Owns the only real browser measurement in the pipeline, so it
// also owns the overflow tripwire (design.html §04).
// ─────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { buildSlide, page, CANVAS, STORY } from './builder.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, 'slide.css'), 'utf8');

/**
 * Ron's wardrobe, read once per process.
 *
 * The slide HTML is handed to Chromium with setContent(), which has no
 * base URL — a relative <img src> resolves against about:blank and a
 * file:// path is blocked from it. Data URIs are the only thing that
 * survives, so the poses are inlined. They are palette-quantised to
 * ~50KB each, which is cheap next to a 1080x1350 screenshot.
 *
 * Filenames carry the gesture: 03-deep-teal-knit-EXPLAINING.png. The
 * map is gesture -> [outfit, outfit, ...] so the deck can rotate the
 * wardrobe without changing what he is doing.
 */
const GESTURES = {
  point: /point-right|classic-point/, upward: /upward|presenting/,
  explain: /explaining/, welcome: /welcome/, yes: /-yes|assured/,
  pause: /pause|thinking|listening/,
};
function loadPoses() {
  const dir = join(HERE, 'assets', 'ron');
  if (!existsSync(dir)) return {};
  const out = {};
  for (const f of readdirSync(dir).filter(f => f.endsWith('.png')).sort()) {
    const uri = 'data:image/png;base64,' + readFileSync(join(dir, f)).toString('base64');
    for (const [g, re] of Object.entries(GESTURES))
      if (re.test(f)) (out[g] ??= []).push(uri);
  }
  return out;
}
const POSES = loadPoses();

// How far the type may shrink before we admit defeat, and in what steps.
const SQUEEZE_STEP = 0.06;
const MIN_SQUEEZE = 0.76;
// The other direction. A window with one short story used to leave a
// third of the board empty; these grow the band's contents until they
// fill it. The cap is where the type stops looking like a headline and
// starts looking like a mistake.
// Per archetype, because the ceiling is not the same everywhere: a bar
// chart or a lone number scales cleanly, while prose in a column that
// Ron has already narrowed turns into one ragged word per line long
// before it fills the board. Zoom scales the band's whole contents —
// him included — so growing never changes the geometry, only the size.
const GROW_CAP = {
  watch: 1.28, hero: 1.22, telegram: 1.20, chart: 1.08,
  note: 1.12, item: 1.12, list: 1.10, cover: 1.10, coverFramed: 1.10,
};
// With Ron on the board the sums change. Zoom shrinks the band's own
// width in CSS pixels while his lane stays the px it was, so every
// notch of growth takes a bigger bite out of what is left for the
// text — a watch slide grew itself down to four characters a line.
// On a laned slide he IS the thing filling the board; the type stays
// where the designer put it.
const GROW_CAP_LANE = { watch: 1.20, telegram: 1.14, hero: 1.14, note: 1.12,
                        chart: 1.06, cover: 1.08, coverFramed: 1.08 };
const NO_GROW_LANED = 1.08;
const STORY_GROW = 1.75;
const RON_STEPS = [0.84, 0.68, 0.54];
const GROW_STEP = 0.05;
const FILL = 0.80;          // grow while the content uses less than this

// How Ron gives way when he lands on data, in order.
const MASCOT_RETRIES = ['smaller', 'far-edge', 'smaller-far-edge'];

/**
 * Shed-then-post (chosen over the spec's hard fail because the daemon
 * runs unattended): if a list slide overflows, drop its lowest-scoring
 * row and re-measure. Every other archetype still fails loudly - there
 * is nothing to shed on a cover.
 */
export async function renderDeck(deck, outDir, { scale = 1, format = 'png', story = false } = {}) {
  mkdirSync(outDir, { recursive: true });
  const size = story ? STORY : CANVAS;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: size.w, height: size.h }, deviceScaleFactor: scale,
  });
  const p = await ctx.newPage();
  // `spin` rotates the wardrobe. Seeded from the window key so the same
  // window always renders identically — a replay must reproduce the
  // deck it replays — while consecutive windows dress him differently.
  const spin = [...(deck.key ?? '')].reduce((a, c) => a + c.charCodeAt(0), 0);
  const { slides, ...meta } = { ...deck, poses: POSES, spin };
  const files = [], shed = [];

  try {
    for (let i = 0; i < slides.length; i++) {
      let slide = slides[i], fit = null;

      // ── the mascot review ────────────────────────────────────
      // Ron is placed by CSS, which knows nothing about how long a
      // headline turned out or how many rows a table grew. Returns
      // true when the board is clean; otherwise it edits `slide` and
      // the caller re-renders.
      async function reviewMascot() {
      const clash = await p.evaluate(() => {
        const o = document.querySelector('.ron');
        if (!o) return null;
        const a = o.getBoundingClientRect();
        const hits = [];
        for (const el of document.querySelectorAll('[data-protect]')) {
          const b = el.getBoundingClientRect();
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w > 0 && h > 0) {
            const area = w * h;
            // A few pixels of a descender brushing his shoulder is not
            // a collision. A tenth of the protected element is.
            if (area > 0.1 * b.width * b.height || area > 0.25 * a.width * a.height)
              hits.push({ what: el.dataset.protect, cover: Math.round(100 * area / (b.width * b.height)) });
          }
        }
        return hits.length ? hits : null;
      });

      if (clash) {
        // Retreat in order: shrink, then move to the opposite edge,
        // then drop him. A slide without Ron is fine; a number with a
        // cartoon elbow through it is not.
        const step = slide.ronTry ?? 0;
        if (step < MASCOT_RETRIES.length) {
          shed.push({ slide: i + 1, headline: `Ron vs ${clash.map(c => c.what).join(', ')}`,
            note: `${MASCOT_RETRIES[step]} (covered ${clash[0].cover}%)` });
          slide = { ...slide, ronTry: step + 1, ronPlace: MASCOT_RETRIES[step] };
          return false;
        }
        shed.push({ slide: i + 1, headline: 'Ron dropped', note: 'no placement clears the data' });
        slide = { ...slide, ron: null };
        return false;
      }
      return true;
      }


      for (let attempt = 0; attempt < 20; attempt++) {
        await p.setContent(page(buildSlide(slide, meta, i, slides.length, { story }), CSS),
          { waitUntil: 'networkidle' });
        try { await p.evaluate(() => document.fonts.ready); } catch {}
        await p.waitForTimeout(120);

        // Both numbers in REAL pixels. scrollHeight reports the child's
        // own CSS pixels, which are not the band's once a zoom is in
        // play — and the band's clientHeight counts padding that is
        // deliberately reserved for Ron. Comparing those two directly
        // is how a story board decided it needed 1695px of a 1222px
        // band and threw the window away.
        fit = await p.evaluate(() => {
          const bd = document.querySelector('.sl-bd');
          const a = bd.firstElementChild;
          const cs = getComputedStyle(bd);
          const room = bd.clientHeight
            - parseFloat(cs.paddingTop || 0) - parseFloat(cs.paddingBottom || 0);
          // What he actually DRAWS, not the box he is given. contain
          // letterboxes him inside it, and on a story the box is what
          // the reserve is cut from — so a box taller than the pose is
          // a strip of empty ground under the headline.
          let drawn = 0;
          const img = document.querySelector('.ron img');
          if (img && img.naturalWidth) {
            const b = img.getBoundingClientRect();
            drawn = Math.min(b.height, b.width * img.naturalHeight / img.naturalWidth);
          }
          return { room, needs: a.getBoundingClientRect().height,
                   laned: !!document.querySelector('.ron'),
                   reserve: parseFloat(cs.paddingBottom || 0), drawn };
        });

        // Give back whatever the box reserved and the pose did not use.
        if (story && fit.drawn && Math.abs(fit.reserve - 40 - fit.drawn) > 20) {
          slide = { ...slide, ronFit: Math.ceil(fit.drawn) };
          continue;
        }
        // Fits. Two more questions before it is done.
        if (fit.needs <= fit.room) {
          // One: is it swimming? A short window used to render as a
          // line of type stranded in a third of a board of empty
          // ground. The same zoom that rescues an overlong slide grows
          // an underfull one — Ron included, since he lives inside
          // the band. `shrunk` stops it oscillating with the squeeze.
          const z = slide.squeeze ?? 1;
          // A story has the same width as a post and 570px more height,
          // and the text is not in a lane there — so it can afford to
          // be read from across a room.
          const cap = story ? STORY_GROW
            : fit.laned ? (GROW_CAP_LANE[slide.type] ?? NO_GROW_LANED)
            : (GROW_CAP[slide.type] ?? 1.12);
          if (!slide.shrunk && z < cap && fit.needs < fit.room * FILL) {
            // Aim straight at the room rather than creeping toward it
            // in 5% steps: a story wants to grow by 75% and there are
            // only fourteen attempts in the budget, so creeping meant
            // running out of them and shipping the type at its
            // starting size. The leap is capped so an overshoot is
            // one notch, not a cliff, and overflow catches it anyway.
            const reach = Math.min(1.35, (fit.room * 0.94) / Math.max(fit.needs, 1));
            const next = Math.min(cap, z * Math.max(reach, 1 + GROW_STEP / z));
            if (next > z + 0.004) { slide = { ...slide, squeeze: next }; continue; }
          }
          // Two: is Ron standing on data?
          if (await reviewMascot()) break;
          continue;
        }

        if (slide.type === 'list' && slide.rows.length > 1) {
          const dropped = slide.rows[slide.rows.length - 1];
          shed.push({ slide: i + 1, headline: dropped.headline });
          slide = { ...slide, rows: slide.rows.slice(0, -1) };
          continue;
        }

        // A story reserves the bottom third for Ron, and a long
        // headline needs some of it back. He gives ground before the
        // type does — he is the decoration, the headline is the point.
        // ...but only while the type is still at or below its designed
        // size. Once it has been GROWN, the overflow is the growth's
        // fault, not his: shrinking him there let the type keep taking
        // room until he was a thumbnail in the corner.
        if (story && fit.laned && (slide.squeeze ?? 1) <= 1.0001) {
          const k = slide.ronK ?? 1;
          const next = RON_STEPS.find(x => x < k - 1e-6);
          if (next) { slide = { ...slide, ronK: next }; continue; }
        }

        // Every other archetype: shrink the type before giving up. The
        // spec's hard fail was written for a designer at a desk; here it
        // threw away a whole window because a framed cover ran 115px
        // long. Type that is 8% smaller is a rounding error to a reader
        // and it fits — an hour of news missing is not.
        if (slide.squeeze === undefined || slide.squeeze > MIN_SQUEEZE) {
          const next = Math.max(MIN_SQUEEZE, (slide.squeeze ?? 1) - SQUEEZE_STEP);
          slide = { ...slide, squeeze: next, shrunk: true };
          continue;
        }

        // Still over at the floor: a framed cover is the greediest
        // layout in the system, so fall back to the plain one rather
        // than lose the deck.
        if (slide.type === 'coverFramed') {
          shed.push({ slide: i + 1, headline: `${slide.headline ?? ''}`.slice(0, 60),
            note: 'framed cover -> plain cover (would not fit)' });
          slide = { ...slide, type: 'cover', squeeze: undefined };
          continue;
        }

        throw new Error(
          `TRIPWIRE slide ${i + 1} (${slide.type}): needs ${fit.needs}px, room ${fit.room}px ` +
          `even at ${Math.round(MIN_SQUEEZE * 100)}% type. Skipped rather than clipped.`);
      }

      // The API path needs JPEG (Meta accepts nothing else). Quality 95
      // because the ground is a 5.5%-ink graph-paper grid and hairline
      // rules - exactly the content JPEG smears at the usual 80.
      const file = join(outDir, `slide-${String(i + 1).padStart(2, '0')}.${format}`);
      await p.locator('.slide').screenshot(
        format === 'jpeg' ? { path: file, type: 'jpeg', quality: 100 } : { path: file });
      files.push(file);
    }
  } finally {
    await browser.close();
  }
  return { files, shed };
}

// `node src/render.js --fixture` reproduces the design.html specimens.
if (process.argv.includes('--fixture')) {
  const { deck } = await import('./fixture.js');
  const out = join(HERE, '..', 'out', 'specimens');
  const r = await renderDeck(deck, out);
  console.log(`${r.files.length} specimens -> ${out}`);
  if (r.shed.length) console.log('shed:', r.shed);
}
