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

export async function publish(files, caption, { dryRun = false } = {}) {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({
    storageState: storageState(), userAgent: UA, locale: 'en-US',
    viewport: { width: 1280, height: 900 },
  });
  const page = await ctx.newPage();
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

    // Instagram exposes Create as an aria-labelled control before it is
    // ever a text node, so try the label first and fall back to text.
    // Click the clickable ancestor, not the <svg> — a click on the glyph
    // itself is swallowed on some builds.
    const createSvg = page.locator('svg[aria-label="New post"], svg[aria-label="פוסט חדש"]').first();
    if (await createSvg.isVisible().catch(() => false)) {
      const holder = createSvg.locator('xpath=ancestor::*[self::a or self::button or @role="button" or @role="link"][1]');
      if (await holder.count()) await holder.first().click({ timeout: 10000 });
      else await createSvg.click({ timeout: 10000, force: true });
    } else {
      await page.locator(rx(T.create)).first().click({ timeout: 15000 });
    }
    await page.waitForTimeout(1500);
    await shot('02a-after-create');

    // The Post / Reel / Story submenu — searched ONLY inside the popup.
    // Unscoped, /post/i also matches the sidebar's own "New post" and we
    // would click the dialog shut.
    const menu = page.locator('div[role="dialog"], div[role="menu"]').last();
    if (await menu.isVisible().catch(() => false)) {
      const postItem = menu.locator('text=/^\\s*(post|פוסט)\\s*$/i').first();
      if (await postItem.isVisible().catch(() => false)) { await postItem.click(); await page.waitForTimeout(1500); }
    }
    await shot('02-create');

    // Upload. Prefer the hidden <input type=file>; if this build doesn't
    // render one until the chooser opens, click "Select from computer"
    // and catch the filechooser event instead — a runner has no OS dialog
    // to click through either way.
    const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 8000, state: 'attached' }).catch(() => null);
    if (fileInput) {
      await fileInput.setInputFiles(files);
    } else {
      console.log(dump(await page.content()));
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 20000 }),
        page.locator(rx(T.select)).first().click({ timeout: 15000 }),
      ]);
      await chooser.setFiles(files);
    }
    await page.waitForTimeout(3500);
    await shot('03-uploaded');

    // Crop: default is 1:1 and would destroy a 4:5 deck. Pick the
    // original ratio if the control is there.
    const crop = page.locator('svg[aria-label="Select crop"], svg[aria-label="בחירת חיתוך"]').first();
    if (await crop.isVisible().catch(() => false)) {
      await crop.click(); await page.waitForTimeout(700);
      const orig = page.locator(rx(['Original', 'מקורי'])).first();
      if (await orig.isVisible().catch(() => false)) await orig.click();
      await page.waitForTimeout(700);
      await shot('04-crop');
    }

    for (const step of ['05-next1', '06-next2']) {
      await page.locator(rx(T.next)).last().click({ timeout: 15000 });
      await page.waitForTimeout(2200);
      await shot(step);
    }

    const box = page.locator('div[contenteditable="true"], textarea').first();
    await box.click();
    await box.fill(caption.slice(0, 2200));
    await page.waitForTimeout(800);
    await shot('07-caption');

    if (dryRun) {
      await shot('08-would-share');
      return { id: null, dryRun: true, note: 'stopped before Share' };
    }

    await page.locator(rx(T.share)).last().click({ timeout: 15000 });
    await page.waitForTimeout(9000);
    await shot('09-shared');

    const done = await page.locator('text=/shared|הפוסט שותף|הועלה/i').first().isVisible().catch(() => false);
    if (!done) throw new Error('clicked Share but saw no confirmation — check 09-shared.png');
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
