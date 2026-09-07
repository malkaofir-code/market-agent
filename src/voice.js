// ─────────────────────────────────────────────────────────────
// voice.js — the reel, spoken.
//
// Instagram's music library is app-only: the Content Publishing API
// has no track parameter, so a reel published this way carries
// whatever audio is baked into the file. That was a synthesised bed
// and nothing else, which left this account competing on pictures
// alone against a feed full of people talking.
//
// This narrates, in English over Hebrew boards. Deliberately: the
// cards are for an Israeli audience and stay Hebrew, but a reel is
// the one surface here that reaches people who have never heard of
// the account, and most of them are not in Israel.
//
// Piper rather than a hosted API. It runs on the runner, costs
// nothing, has no key to expire at 22:06 and no rate limit to hit. It
// is audibly synthetic and that is the trade — a voice that is always
// there beats a better voice that stops when a card declines.
//
// NOTHING here decides what is said. The lines are built in
// compose.js from figures the parser actually matched; this module
// only turns text into a wav and reports how long it runs.
// ─────────────────────────────────────────────────────────────
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const run = promisify(execFile);

/** en_US-ryan-high: the most natural of the free Piper voices. */
const VOICE = process.env.REEL_VOICE_MODEL || 'en_US-ryan-high';
const HOME = process.env.PIPER_HOME || join(process.env.HOME || '/tmp', '.piper');
const model = () => join(HOME, `${VOICE}.onnx`);

// pip installs both a `piper` script and the module. Which of the two
// is on PATH depends on where pip put its bin directory, which is not
// the same on every image — so try the script, fall back to the
// module, and never let a PATH difference be the reason a reel is
// silent.
async function piper(args, opts = {}) {
  try { return await run('piper', args, opts); }
  catch { return await run('python3', ['-m', 'piper', ...args], opts); }
}

/** A working Piper with its voice model already on this machine. */
export async function haveVoice() {
  if (!existsSync(model())) return false;
  try { await piper(['--help']); return true; } catch { return false; }
}

/**
 * Fetch the voice model once and keep it.
 *
 * ~60MB from HuggingFace on a fresh runner. Failure is NOT fatal and
 * must not be: a reel with a bed and no narration is still a reel,
 * and losing the day's only discovery surface because a CDN was slow
 * is the worse trade. Returns false; the caller carries on silent.
 */
export async function ensureVoice() {
  if (existsSync(model())) return true;
  mkdirSync(HOME, { recursive: true });
  try { await piper(['--help']); } catch { return false; }
  try {
    // --download-dir explicitly rather than relying on cwd: this runs
    // from the repo root under Actions, and a 60MB model landing in
    // the working tree is both wrong and invisible until it is not.
    await run('python3', ['-m', 'piper.download_voices', VOICE,
      '--download-dir', HOME], { cwd: HOME, maxBuffer: 1 << 26 });
  } catch { return false; }
  return existsSync(model());
}

/** text -> wav. Returns the path, or null if this line cannot be said. */
export async function say(text, out) {
  // One line, always. Piper splits stdin on newlines and writes a
  // file per line, so a headline that arrived with a break in it
  // would silently produce a wav holding only its first clause.
  const line = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!line) return null;
  await piper(['-m', model(), '-f', out,
    // length-scale is phoneme duration, so BELOW one is faster.
    '--length-scale', String(process.env.REEL_VOICE_RATE || 1.0)],
    { input: line, maxBuffer: 1 << 26 });
  return existsSync(out) ? out : null;
}

/** Seconds, measured from the file — never guessed from the text. */
export async function seconds(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration', '-of', 'csv=p=0', file]);
  const n = Number(String(stdout).trim());
  return Number.isFinite(n) ? n : 0;
}
