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
import { fileURLToPath } from 'url';

const run = promisify(execFile);

/**
 * lessac-medium, not ryan-high.
 *
 * The high models are more natural in a quiet room and roughly four
 * times slower to run, and this voice is heard on a phone speaker
 * over a music bed where almost none of that difference survives.
 * Speed is the property that matters on a runner with two cores and
 * a job timeout.
 */
const VOICE = process.env.REEL_VOICE_MODEL || 'en_US-lessac-medium';
/** Relative on purpose: run.js runs from the repo root, and a
 *  relative path needs no workflow expression to be translated into
 *  the container — which is exactly how PIPER_HOME pointed at a
 *  directory that did not exist the first time. */
const HOME = process.env.PIPER_HOME || '.piper';
const model = () => join(HOME, `${VOICE}.onnx`);
const HERE = fileURLToPath(new URL('.', import.meta.url));

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

/**
 * Every line of the reel, from ONE model load.
 *
 * This used to be one Piper process per line. Each of them read the
 * whole 60MB model back off disk and rebuilt the onnxruntime session
 * before saying a nine-word sentence — six scenes, six full loads,
 * and the first narrated reel spent ten minutes and forty-one seconds
 * doing it before the job timeout killed the run.
 *
 * @param lines  one entry per scene; null or '' where nobody speaks
 * @returns      the wav path per scene, null where there is none
 */
export async function sayAll(lines, dir) {
  // One line each, always. A newline inside a headline would make
  // piper treat it as two utterances.
  const req = {
    model: model(),
    length_scale: Number(process.env.REEL_VOICE_RATE || 1.0),
    lines: lines.map((t, i) => {
      const line = String(t ?? '').replace(/\s+/g, ' ').trim();
      return line ? { text: line, out: join(dir, `say-${i}.wav`) } : {};
    }),
  };
  const { stdout } = await run('python3', [join(HERE, 'py', 'speak.py')],
    { input: JSON.stringify(req), maxBuffer: 1 << 26 });
  const out = JSON.parse(stdout);
  return lines.map((_, i) => (out[i] && existsSync(out[i]) ? out[i] : null));
}

/** Seconds, measured from the file — never guessed from the text. */
export async function seconds(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration', '-of', 'csv=p=0', file]);
  const n = Number(String(stdout).trim());
  return Number.isFinite(n) ? n : 0;
}
