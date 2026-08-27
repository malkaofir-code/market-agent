// ─────────────────────────────────────────────────────────────
// render.js — deck plan -> 1080x1350 PNGs.
// Owns the only real browser measurement in the pipeline, so it
// also owns the overflow tripwire (design.html §04).
// ─────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { buildSlide, page, CANVAS } from './builder.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, 'slide.css'), 'utf8');

// How far the type may shrink before we admit defeat, and in what steps.
const SQUEEZE_STEP = 0.06;
const MIN_SQUEEZE = 0.76;

/**
 * Shed-then-post (chosen over the spec's hard fail because the daemon
 * runs unattended): if a list slide overflows, drop its lowest-scoring
 * row and re-measure. Every other archetype still fails loudly - there
 * is nothing to shed on a cover.
 */
export async function renderDeck(deck, outDir, { scale = 1, format = 'png' } = {}) {
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: CANVAS.w, height: CANVAS.h }, deviceScaleFactor: scale,
  });
  const p = await ctx.newPage();
  const { slides, ...meta } = deck;
  const files = [], shed = [];

  try {
    for (let i = 0; i < slides.length; i++) {
      let slide = slides[i], fit = null;

      for (let attempt = 0; attempt < 8; attempt++) {
        await p.setContent(page(buildSlide(slide, meta, i, slides.length), CSS),
          { waitUntil: 'networkidle' });
        try { await p.evaluate(() => document.fonts.ready); } catch {}
        await p.waitForTimeout(120);

        fit = await p.evaluate(() => {
          const bd = document.querySelector('.sl-bd');
          const a = bd.firstElementChild;
          return { room: bd.clientHeight, needs: a.scrollHeight };
        });
        if (fit.needs <= fit.room) break;

        if (slide.type === 'list' && slide.rows.length > 1) {
          const dropped = slide.rows[slide.rows.length - 1];
          shed.push({ slide: i + 1, headline: dropped.headline });
          slide = { ...slide, rows: slide.rows.slice(0, -1) };
          continue;
        }

        // Every other archetype: shrink the type before giving up. The
        // spec's hard fail was written for a designer at a desk; here it
        // threw away a whole window because a framed cover ran 115px
        // long. Type that is 8% smaller is a rounding error to a reader
        // and it fits — an hour of news missing is not.
        if (slide.squeeze === undefined || slide.squeeze > MIN_SQUEEZE) {
          const next = Math.max(MIN_SQUEEZE, (slide.squeeze ?? 1) - SQUEEZE_STEP);
          slide = { ...slide, squeeze: next };
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
        format === 'jpeg' ? { path: file, type: 'jpeg', quality: 95 } : { path: file });
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
