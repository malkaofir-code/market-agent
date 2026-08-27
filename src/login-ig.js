// ─────────────────────────────────────────────────────────────
// login-ig.js — capture an Instagram web session, ONCE, locally.
//
// Run this on your Mac. A browser opens; you log in by hand,
// including any 2FA. Nothing about your password touches this code —
// it only saves the cookies the browser ends up with.
//
//   node src/login-ig.js
//
// Writes ig-state.json (gitignored). That file IS a live login to the
// account: treat it exactly like a password.
// ─────────────────────────────────────────────────────────────
import { chromium } from 'playwright';
import { createInterface } from 'readline/promises';

const OUT = './ig-state.json';

const ctx = await chromium.launchPersistentContext('', {
  headless: false,
  viewport: { width: 1280, height: 900 },
  // A real UA and locale: the login page behaves differently for
  // headless defaults, and a mismatch here is what gets sessions
  // flagged later.
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale: 'en-US',
});
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.goto('https://www.instagram.com/accounts/login/');

console.log('\nA browser window is open.');
console.log('1. Log in as @marketalert.il (including 2FA)');
console.log('2. Wait until you can see your normal feed');
console.log('3. Come back here and press Enter\n');

const rl = createInterface({ input: process.stdin, output: process.stdout });
await rl.question('Press Enter once you are logged in… ');
rl.close();

const state = await ctx.storageState({ path: OUT });
const igCookies = state.cookies.filter(c => c.domain.includes('instagram'));
const sessionid = igCookies.find(c => c.name === 'sessionid');

console.log(`\nsaved ${OUT} — ${igCookies.length} instagram cookie(s)`);
console.log(sessionid ? 'sessionid present — looks like a real session' : 'NO sessionid — the login did not complete');
console.log('\nNext: put the FILE CONTENTS into a GitHub secret named IG_STORAGE_STATE:');
console.log('  cat ig-state.json | pbcopy');
await ctx.close();
