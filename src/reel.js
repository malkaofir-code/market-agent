// ─────────────────────────────────────────────────────────────
// reel.js — the boards, in motion.
//
// The account had no way to reach anybody who does not already
// follow it. Carousels reach followers plus a trickle of Explore;
// stories reach followers only. Reels are the one Instagram surface
// that shows a post to strangers, so this is the only publish path
// here with discovery in it.
//
// It is assembled, not generated. A model that paints video cannot
// render an exact Hebrew headline or an exact figure — it invents
// glyphs that look like letters — and the whole worth of this account
// is that its numbers are right. So the frames are the same boards
// the story track already renders, and ffmpeg gives them motion.
// Deterministic, free, and incapable of inventing a number.
// ─────────────────────────────────────────────────────────────
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const run = promisify(execFile);
const HERE = fileURLToPath(new URL('.', import.meta.url));

/** Seconds each scene holds.
 *  1.9 rather than 2.6 — the reference cut this account is chasing runs
 *  six scenes in eleven and a half seconds, and a card that outstays
 *  its welcome is a scroll. Retention is the whole ranking signal. */
export const HOLD = Number(process.env.REEL_HOLD_SEC || 2.0);
const FPS = 30;
/** The dissolve between scenes. */
const FADE = Number(process.env.REEL_FADE_SEC || 0.18);
/** A safety net, not a pacing choice.
 *
 * A narrated scene runs as long as its sentence takes. This exists
 * only to stop a malformed line producing a forty-second card — the
 * lines compose writes run two to four seconds. It was 5.0 while
 * being tested and truncated an opening line by two tenths of a
 * second, which is the one failure a narrated reel cannot have: a
 * sentence cut mid-word is worse than no sentence at all. */
export const MAX_HOLD = Number(process.env.REEL_MAX_HOLD_SEC || 8.0);
/** Breath after the line finishes, before the cut. */
const PAD = Number(process.env.REEL_SAY_PAD_SEC || 0.55);
/** The bed under a voice, and the bed alone. */
const BED_UNDER = Number(process.env.REEL_BED_UNDER || 0.22);
const BED_ALONE = Number(process.env.REEL_BED_ALONE || 0.85);

/**
 * How long each scene holds.
 *
 * A silent reel holds every card the same length because nothing
 * distinguishes them. Once a card is spoken over, its length stops
 * being a design choice: it is however long the sentence takes, and
 * HOLD becomes the floor rather than the rule.
 */
export function holdsFor(voiceSecs, n) {
  return Array.from({ length: n }, (_, i) => {
    const v = voiceSecs?.[i];
    if (!v) return HOLD;
    return Math.min(MAX_HOLD, Math.max(HOLD, v + PAD));
  });
}

/** When each scene starts on the finished timeline — every dissolve
 *  steals `fade` seconds from the running total. */
export function startsOf(holds, fade = FADE) {
  const out = []; let t = 0;
  holds.forEach((h, i) => { out.push(Math.max(0, t - fade * i)); t += h; });
  return out;
}

export const totalOf = (holds, fade = FADE) =>
  holds.reduce((a, b) => a + b, 0) - fade * (holds.length - 1);

export async function haveFfmpeg() {
  try { await run('ffmpeg', ['-version']); return true; } catch { return false; }
}

/**
 * An audio bed, if one has been provided.
 *
 * Instagram's own music library is app-only — no API parameter exists
 * for it — so a reel published this way carries whatever audio is
 * baked into the file. That costs some reach, because the ranking
 * favours in-app audio, and there is no way around it from here.
 * Silence is still valid and still publishes; drop an mp3/m4a in
 * src/assets/audio/ and it gets used instead.
 */
export function audioBed(mood = 'tape') {
  const dir = join(HERE, 'assets', 'audio');
  if (!existsSync(dir)) return null;
  const all = readdirSync(dir).filter(x => /\.(mp3|m4a|aac|wav)$/i.test(x)).sort();
  if (!all.length) return null;
  // The track follows the day. Named rather than sorted-first, because
  // "whatever is alphabetically first" is how a bed silently changes the
  // moment somebody adds a file.
  const want = all.find(f => f.startsWith(`bed-${mood}.`))
    ?? all.find(f => f.startsWith('bed-tape.'))
    ?? all[0];
  return join(dir, want);
}

/**
 * Which of the three the day earned.
 *
 * Counted off the same `dir` field the candles behind him are drawn
 * from, so the music cannot disagree with the picture. A day with no
 * clear lean gets the neutral bed rather than a coin toss.
 */
export function moodOf(slides = []) {
  let up = 0, dn = 0;
  for (const s of slides) { if (s.dir === 'up') up++; else if (s.dir === 'dn') dn++; }
  if (up > dn + 1) return 'open';
  if (dn > up + 1) return 'close';
  return 'tape';
}

/**
 * frames -> mp4, 1080x1920, H.264/AAC.
 *
 * Each board gets a slow push-in. Stills cut together read as a
 * slideshow and a slideshow is scrolled past; a frame that is always
 * moving, however slightly, holds the eye long enough to be read.
 */
/**
 * Two planes, moving against each other, then cut together.
 *
 * A single still with a zoom on it is a slideshow with a Ken Burns
 * effect — the whole frame drifts as one sheet and the eye reads it
 * as a photograph being panned. Depth needs the planes to disagree:
 * the market pushes IN behind him while he drifts DOWN against it, so
 * for a second and a half the frame has somewhere to look.
 *
 * @param bgs  the market, one per scene (opaque)
 * @param fgs  him and the line, one per scene (alpha)
 */
export async function buildReel(bgs, fgs, out, {
  hold = HOLD, holds = null, audio = audioBed(), fade = FADE, voices = null } = {}) {
  if (!bgs.length) throw new Error('a reel needs at least one scene');
  if (bgs.length !== fgs.length) throw new Error('every scene needs both planes');
  const H = holds ?? Array(bgs.length).fill(hold);
  const dir = dirname(out);
  const parts = [];

  for (let i = 0; i < bgs.length; i++) {
    const h = H[i];
    const frames = Math.round(h * FPS);
    const part = join(dir, `scene-${i}.mp4`);
    await run('ffmpeg', ['-v', 'error', '-y', '-i', bgs[i], '-i', fgs[i],
      '-filter_complex',
      // Oversized before the zoom so pushing in never runs out of pixels.
      `[0:v]scale=1188:2112,setsar=1,` +
      `zoompan=z='1.0+0.055*on/${frames}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'` +
      `:s=1080x1920:fps=${FPS}[bg];` +
      `[1:v]scale=1080:1920,setsar=1,loop=loop=${frames - 1}:size=1:start=0,fps=${FPS}[fg];` +
      `[bg][fg]overlay=x=0:y='34-40*(t/${h})':format=auto:shortest=1[v]`,
      '-map', '[v]', '-frames:v', String(frames),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-r', String(FPS), part], { maxBuffer: 1 << 26 });
    parts.push(part);
  }

  const starts = startsOf(H, fade);
  const total = totalOf(H, fade);
  const spoken = (voices ?? []).filter(Boolean);

  const args = ['-v', 'error', '-y'];
  for (const p of parts) args.push('-i', p);
  // The bed, looped: a 40-second file has to cover a narrated cut that
  // now runs longer than it does.
  const bedIdx = parts.length;
  if (audio) args.push('-stream_loop', '-1', '-i', audio);
  else args.push('-f', 'lavfi', '-t', String(total + 1),
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
  const voiceIdx = [];
  (voices ?? []).forEach((v, i) => {
    if (!v) return;
    voiceIdx.push({ input: bedIdx + 1 + voiceIdx.length, at: starts[i] });
    args.push('-i', v);
  });

  // Cut them together on a short dissolve. Long enough not to jar,
  // short enough that two people are never both on screen long enough
  // to read as a ghost.
  let chain = '', last = '[0]';
  for (let i = 1; i < parts.length; i++) {
    const tag = i === parts.length - 1 ? '[v]' : `[x${i}]`;
    chain += `${last}[${i}]xfade=transition=fade:duration=${fade}:offset=${starts[i].toFixed(3)}${tag};`;
    last = tag;
  }
  if (parts.length === 1) chain = '[0]null[v];';

  // ── the audio ────────────────────────────────────────────
  // Ducking the bed under the voice and letting it back up between
  // lines is what an editor would do. This holds it at one level
  // instead: a sidechain that mis-triggers on a runner nobody is
  // watching produces a reel with an inaudible voice, and a slightly
  // loud bed is the smaller loss.
  chain += `[${bedIdx}:a]volume=${spoken.length ? BED_UNDER : BED_ALONE},`
         + `atrim=0:${total.toFixed(3)},asetpts=N/SR/TB[bed];`;
  if (!voiceIdx.length) {
    chain += `[bed]anull[a]`;
  } else {
    for (const [k, v] of voiceIdx.entries()) {
      const ms = Math.round(v.at * 1000);
      chain += `[${v.input}:a]aresample=44100,adelay=${ms}|${ms},volume=1.6[s${k}];`;
    }
    const tags = ['[bed]', ...voiceIdx.map((_, k) => `[s${k}]`)].join('');
    chain += `${tags}amix=inputs=${voiceIdx.length + 1}:duration=first:normalize=0,`
           + `alimiter=limit=0.95[a]`;
  }

  args.push('-filter_complex', chain,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-r', String(FPS),
    // Stereo explicitly. The bed is stereo and the voice wavs are
    // mono, and amix follows its inputs — without this the whole reel
    // came out mono once already.
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
    '-movflags', '+faststart', '-t', total.toFixed(3), out);

  await run('ffmpeg', args, { maxBuffer: 1 << 26 });
  return { out, seconds: Number(total.toFixed(1)), scenes: parts.length,
           audio: audio ? (spoken.length ? `bed+voice x${spoken.length}` : 'bed')
                        : (spoken.length ? `voice x${spoken.length}` : 'silent') };
}
