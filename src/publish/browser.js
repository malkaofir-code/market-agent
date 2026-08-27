// ─────────────────────────────────────────────────────────────
// publish/browser.js — post the carousel through instagram.com,
// the same way a person would.
//
// No Meta app, no App Review, no container API. It drives the web UI
// with a session captured by login-ig.js.
//
// Deliberate choices, each one a failure we can predict:
//  · Selectors are anchored on aria-labels and visible text in BOTH
//    English and Hebrew — the account's UI language is not ours to
//    assume, and a missing selector is indistinguishable from a
//    changed one.
//  · Every step screenshots on failure. When Instagram changes its
//    flow, a picture of the moment it broke is worth more than a
//    stack trace.
//  · It never types a password. If the session is dead it fails
//    loudly and asks for a fresh capture.
// ─────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const SHOTS = './out/browser';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Both languages, every time. */
const T = {
  create:  ['New post', 'Create', 'פוסט חדש', 'יצירה'],
  post:    ['Post', 'פורסם', 'פוסט'],
  select:  ['Select from computer', 'בחירה מהמחשב'],
  next:    ['Next', 'הבא'],
  share:   ['Share', 'שיתוף', 'שתף'],
  caption: ['Write a caption...', 'כתיבת כיתוב...', 'כתוב כיתוב...'],
};
// One regex, not a comma-joined list: `text="A", text="B"` is NOT
// valid Playwright syntax — it matches nothing and times out looking
// like a missing button. `text=/a|b/i` is the multi-language form.
// The composer's input is the ONLY one that takes more than one file.
// Instagram also ships a single-file profile-picture input on the same
// page, and `.first()` picked that one — "Non-multiple file input can
// only accept single file".
const FILE_INPUT = 'input[type="file"][multiple]';

const rx = names => `text=/${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}/i`;

// When a selector goes missing the log is the only witness the runner
// leaves behind: print the aria-labels and button text actually on the
// page rather than guessing at what Instagram rendered.
const dump = html => 'PAGE DUMP — aria-labels: ' +
  [...new Set((html.match(/aria-label="[^"]{1,40}"/g) ?? []))].slice(0, 60).join(' ');

function storageState() {
  const raw = process.env.IG_STORAGE_STATE;
  if (raw) return JSON.parse(raw);
  if (existsSync('./ig-state.json')) return JSON.parse(readFileSync('./ig-state.json', 'utf8'));
  throw new Error('no Instagram session — set IG_STORAGE_STATE or run node src/login-ig.js');
}

// A browser step that hangs costs a whole hourly slot and tells us
// nothing. Cap the flow and fail with the step we died on.
const WATCHDOG_MS = Number(process.env.BROWSER_TIMEOUT_MS ?? 240000);

export async function publish(files, caption, opts = {}) {
  let timer;
  const guard = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`browser publish exceeded ${WATCHDOG_MS / 1000}s — see out/browser/`)), WATCHDOG_MS);
  });
  try { return await Promise.race([run(files, caption, opts), guard]); }
  finally { clearTimeout(timer); }
}

async function run(files, caption, { dryRun = false } = {}) {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({
    storageState: storageState(), userAgent: UA, locale: 'en-US',
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
  // Playwright's 30s default applies to every un-timed call; a flow with
  // a dozen of them can hang a runner for minutes. Bound it once.
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(30000);
  const shot = async name => { try { await page.screenshot({ path: join(SHOTS, `${name}.png`) }); } catch {} };

  try {
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // A dead session redirects to /accounts/login. Say so plainly —
    // this is the failure mode a datacenter IP produces.
    // A dead session either redirects to /accounts/login or renders a
    // password field inline — check both, or a logged-out run reads as
    // a missing button instead.
    const loginForm = await page.locator('input[name="password"]').first().isVisible().catch(() => false);
    if (/accounts\/login/.test(page.url()) || loginForm) {
      await shot('00-logged-out');
      throw new Error('session rejected — Instagram logged us out. Re-run login-ig.js and update IG_STORAGE_STATE.');
    }
    await shot('01-feed');

    // Getting into the composer. Instagram ships several routes to the
    // same dialog and which one works varies by build, so try them in
    // order and stop at the first that mounts the multi-file input.
    // A wrong guess costs seconds; a missing opener costs the slot.
    const composerOpen = async (ms = 4000) => {
      try { await page.waitForSelector(FILE_INPUT, { timeout: ms, state: 'attached' }); return true; }
      catch { return false; }
    };
    const clickHolder = async (sel, ms = 6000) => {
      const svg = page.locator(sel).first();
      if (!(await svg.count())) return false;
      const holder = svg.locator('xpath=ancestor::*[self::a or self::button or @role="button" or @role="link"][1]');
      const target = (await holder.count()) ? holder.first() : svg;
      try { await target.click({ timeout: ms }); return true; } catch { return false; }
    };
    // Interstitials swallow the click that follows them. Clear first.
    const DISMISS = ['Not Now', 'Not now', 'לא עכשיו', 'Allow all cookies',
                     'Decline optional cookies', 'Close', 'סגירה'];
    const dismiss = async () => {
      for (const label of DISMISS) {
        const b = page.locator(`text=/^\\s*${label}\\s*$/i`).first();
        if (await b.isVisible().catch(() => false)) {
          await b.click({ timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(600);
        }
      }
    };
    const NEW = 'svg[aria-label="New post"], svg[aria-label="פוסט חדש"]';
    const POST = 'svg[aria-label="Post"], svg[aria-label="פוסט"]';

    const OPENERS = [
      ['create-route', async () => {
        await page.goto('https://www.instagram.com/create/select/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
      }],
      ['sidebar-new', async () => { await clickHolder(NEW); }],
      ['menu-post',   async () => { await clickHolder(POST); }],
      ['create-text', async () => { await page.locator(rx(T.create)).first().click({ timeout: 6000 }).catch(() => {}); }],
      ['home-new-post', async () => {
        await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        await clickHolder(NEW);
        await page.waitForTimeout(1200);
        await clickHolder(POST);
      }],
    ];

    let ready = false, via = null;
    await dismiss();
    for (const [name, open] of OPENERS) {
      await open().catch(() => {});
      await page.waitForTimeout(1200);
      await shot(`02-${name}`);
      if (await composerOpen(4000)) { ready = true; via = name; break; }
      await dismiss();
    }

    // Last resort: the button that opens an OS file dialog. A runner has
    // no OS dialog, but Playwright can answer the event itself.
    if (!ready) {
      const sel = page.locator(rx(T.select)).first();
      if (await sel.isVisible().catch(() => false)) {
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 15000 }),
          sel.click({ timeout: 8000 }),
        ]);
        await chooser.setFiles(files);
        ready = true; via = 'filechooser';
      }
    }
    if (!ready) {
      console.log('url:', page.url());
      console.log(dump(await page.content()));
      throw new Error('composer never opened — no multi-file input and no "Select from computer"');
    }
    console.log('composer opened via', via);
    if (via !== 'filechooser') await page.locator(FILE_INPUT).first().setInputFiles(files);
    await page.waitForTimeout(4000);
    await shot('03-uploaded');

    // Crop. The composer opens on 1:1 and the deck is 4:5 — taking the
    // default would slice the top and bottom off every slide. Ask for
    // the original ratio, and settle for an explicit 4:5 if this build
    // labels it that way instead.
    const CROP = 'svg[aria-label="Select crop"], svg[aria-label="בחירת חיתוך"], svg[aria-label="Crop"]';
    if (await page.locator(CROP).first().isVisible().catch(() => false)) {
      await clickHolder(CROP);
      await page.waitForTimeout(900);
      for (const want of [['Original', 'מקורי'], ['4:5']]) {
        const opt = page.locator(rx(want)).first();
        if (await opt.isVisible().catch(() => false)) { await opt.click({ timeout: 5000 }).catch(() => {}); break; }
      }
      await page.waitForTimeout(900);
      await shot('04-crop');
    }

    // Two Nexts: crop -> edit, edit -> caption. Scoped to the dialog, so
    // a stray "Next" in the stories tray cannot win the click.
    const dialog = () => page.locator('div[role="dialog"]').last();
    for (const step of ['05-next1', '06-next2']) {
      await dialog().locator(rx(T.next)).last().click({ timeout: 15000 });
      await page.waitForTimeout(2500);
      await shot(step);
    }

    // Caption. aria-label first — a bare contenteditable also matches
    // the search box on some builds.
    const box = dialog().locator(
      'div[aria-label*="aption"][contenteditable="true"], div[aria-label*="כיתוב"][contenteditable="true"], ' +
      'div[contenteditable="true"], textarea').first();
    await box.click({ timeout: 10000 });
    const text = caption.slice(0, 2200);
    // fill() throws on some contenteditable builds; typing always works.
    await box.fill(text).catch(async () => { await page.keyboard.insertText(text); });
    await page.waitForTimeout(900);
    await shot('07-caption');

    if (dryRun) {
      await shot('08-would-share');
      return { id: null, dryRun: true, note: `stopped before Share (composer via ${via})` };
    }

    await dialog().locator(rx(T.share)).last().click({ timeout: 15000 });

    // A ten-slide carousel is not instant. Wait for the confirmation
    // instead of sleeping a guess, and treat the dialog tearing itself
    // down as the second witness — Instagram leaves it up on failure.
    const done = await page.locator('text=/your post has been shared|post shared|הפוסט שותף|הפוסט שלך שותף/i')
      .first().waitFor({ state: 'visible', timeout: 90000 }).then(() => true).catch(() => false);
    await shot('09-shared');
    if (!done && (await dialog().isVisible().catch(() => false))) {
      console.log(dump(await page.content()));
      throw new Error('clicked Share but saw no confirmation and the composer is still open — see 09-shared.png');
    }
    return { id: null, permalink: `https://www.instagram.com/${process.env.IG_HANDLE ?? ''}/` };
  } catch (e) {
    await shot('99-failed');
    // The screenshot is an artifact; the log is immediate. Print both.
    try { console.log('url:', page.url()); console.log(dump(await page.content())); } catch {}
    writeFileSync(join(SHOTS, 'error.txt'), `${e.message}\n\n${e.stack ?? ''}`);
    throw e;
  } finally {
    await browser.close();
  }
}

// The API publisher exports these; the browser one needs neither —
// nothing has to be publicly hosted when the files go up from disk.
export const upload = async files => files;
export const remove = async () => {};
export const check = async () => ({ name: 'browser', public: true });
