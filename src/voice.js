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
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const run = promisify(execFile);

// ── every call here is on a clock ─────────────────────────────
//
// Run #370 rendered its six scenes in twelve seconds and then sat in
// this module until the job timeout killed it. Nothing had failed —
// a model download was simply taking longer than anyone was prepared
// to wait, and there was no number anywhere that said how long that
// was. An optional feature with no timeout is not optional: it is a
// single point of failure for the thing it was supposed to decorate.
//
// So both slow paths carry a ceiling and blow past it into a
// rejection, which runReel() already treats as "ship the reel with
// the bed alone".
const SETUP_MS = Number(process.env.REEL_VOICE_SETUP_SEC || 120) * 1000;
const SAY_MS = Number(process.env.REEL_VOICE_SAY_SEC || 180) * 1000;
const CHECK_MS = 15_000;

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
  const o = { timeout: CHECK_MS, killSignal: 'SIGKILL', ...opts };
  try { return await run('piper', args, o); }
  catch { return await run('python3', ['-m', 'piper', ...args], o); }
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
    //
    // The workflow already tries this before the run, so reaching
    // here means that step did not deliver. Two minutes, then give up
    // and let the reel go out with the bed.
    await run('python3', ['-m', 'piper.download_voices', VOICE,
      '--download-dir', HOME],
      { maxBuffer: 1 << 26, timeout: SETUP_MS, killSignal: 'SIGKILL' });
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
  // Through a file, not stdin. Node's async execFile silently ignores
  // `input` — that is a spawnSync option — so the payload never
  // arrived, speak.py blocked on a stdin that never closed, and the
  // reel waiting on it burned the entire job timeout while looking
  // like a slow model download. A path in argv cannot be dropped.
  const reqPath = join(dir, 'say-request.json');
  writeFileSync(reqPath, JSON.stringify(req));
  const { stdout } = await run('python3', [join(HERE, 'py', 'speak.py'), reqPath],
    { maxBuffer: 1 << 26, timeout: SAY_MS, killSignal: 'SIGKILL' });
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

// ── Hebrew (Nov 2026 rebrand) ─────────────────────────────────
// The reel is hosted by Ron, for an Israeli audience, so it is spoken
// in Hebrew: the same line that is on the card. Piper has no Hebrew
// voice; edge-tts does. Same contract as sayAll — soft in every way.
const HE_VOICE = process.env.REEL_VOICE_HE || 'he-IL-AvriNeural';

/** edge-tts importable on this machine. */
export async function haveHebrew() {
  try { await run('python3', ['-c', 'import edge_tts'], { timeout: CHECK_MS, killSignal: 'SIGKILL' }); return true; }
  catch { return false; }
}

// Speech-only expansions. Do not vocalize ambiguous ordinary Hebrew words:
// their correct ניקוד depends on context, and a wrong reading changes meaning.
const HE_TERMS = [
  [/ארה[״"׳']?ב/g, 'אַרְצוֹת הַבְּרִית'],
  [/ת[״"׳']א(?=\s*\d)/g, 'תֵּל אָבִיב'],
  [/אג[״"׳']ח/g, 'אִגְּרוֹת חוֹב'],
  [/מט[״"׳']ח/g, 'מַטְבֵּעַ חוּץ'],
  [/מנכ[״"׳']ל/g, 'מַנְכַּ״ל'],
];
const EN_TERMS = [
  [/\bS\s*&\s*P\s*500\b/gi, 'אֶס אַנְד פִּי חֲמֵשׁ מֵאוֹת'],
  [/\bS\s*&\s*P\b/gi, 'אֶס אַנְד פִּי'],
  [/\bNASDAQ\b/gi, 'נַאסְדַ״ק'], [/\bNVDA\b/g, 'אֶן וִי דִּי אֵיי'],
  [/\bNYSE\b/g, 'אֶן וַואי אֶס אִי'], [/\bETF\b/g, 'אִי טִי אֶף'],
  [/\bGDP\b/g, 'ג׳י דִּי פִּי'], [/\bCPI\b/g, 'סִי פִּי אַיי'],
  [/\bAI\b/g, 'אֵיי אַיי'], [/\bUSD\b/g, 'יוּ אֶס דִּי'],
];
const LETTERS = { A:'אֵיי', B:'בִּי', C:'סִי', D:'דִּי', E:'אִי', F:'אֶף', G:'ג׳י', H:'אֵייץ׳', I:'אַיי', J:'ג׳יי', K:'קֵיי', L:'אֶל', M:'אֶם', N:'אֶן', O:'אוֹ', P:'פִּי', Q:'קְיוּ', R:'אָר', S:'אֶס', T:'טִי', U:'יוּ', V:'וִי', W:'דַּבְּלְיוּ', X:'אֶקְס', Y:'וַואי', Z:'זִי' };

/** Prepare narration without changing the text shown on the card. */
export function speakableHe(t) {
  let s = String(t ?? '').replace(/<[^>]+>/g, ' ');
  for (const [pattern, spoken] of [...HE_TERMS, ...EN_TERMS]) s = s.replace(pattern, spoken);
  // Unknown uppercase tickers/acronyms are read as letters; ordinary English
  // words and mixed-case company names are left to the voice engine.
  s = s.replace(/\b[A-Z]{2,6}\b/g, word => [...word].map(c => LETTERS[c]).join(' '));
  s = s.replace(/(\d)\.(\d)/g, '$1 נְקוּדָה $2')
    .replace(/%/g, ' אָחוּז').replace(/[+]/g, ' פְּלוּס ')
    .replace(/₪\s*([\d,]+)/g, '$1 שְׁקָלִים').replace(/\$\s*([\d.,]+)/g, '$1 דּוֹלָר')
    .replace(/[·|•▪️]/g, ', ').replace(/[✓✗]/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1').replace(/\s+/g, ' ').trim();
  if (s && !/[.!?…]$/.test(s)) s += '.';
  return s;
}

export async function sayAllHe(lines, dir) {
  const req = { voice: HE_VOICE, rate: process.env.REEL_VOICE_HE_RATE || '+0%',
    lines: lines.map((t, i) => { const line = speakableHe(t); return line ? { text: line, out: join(dir, `say-${i}.wav`) } : {}; }) };
  const reqPath = join(dir, 'say-request.json');
  writeFileSync(reqPath, JSON.stringify(req));
  const { stdout } = await run('python3', [join(HERE, 'py', 'speak_he.py'), reqPath],
    { maxBuffer: 1 << 26, timeout: SAY_MS, killSignal: 'SIGKILL' });
  const out = JSON.parse(stdout);
  return lines.map((_, i) => (out[i] && existsSync(out[i]) ? out[i] : null));
}
