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
export function audioBed() {
  const dir = join(HERE, 'assets', 'audio');
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).filter(x => /\.(mp3|m4a|aac|wav)$/i.test(x)).sort()[0];
  return f ? join(dir, f) : null;
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
export async function buildReel(bgs, fgs, out, { hold = HOLD, audio = audioBed(), fade = FADE } = {}) {
  if (!bgs.length) throw new Error('a reel needs at least one scene');
  if (bgs.length !== fgs.length) throw new Error('every scene needs both planes');
  const frames = Math.round(hold * FPS);
  const dir = dirname(out);
  const parts = [];

  for (let i = 0; i < bgs.length; i++) {
    const part = join(dir, `scene-${i}.mp4`);
    await run('ffmpeg', ['-v', 'error', '-y', '-i', bgs[i], '-i', fgs[i],
      '-filter_complex',
      // Oversized before the zoom so pushing in never runs out of pixels.
      `[0:v]scale=1188:2112,setsar=1,` +
      `zoompan=z='1.0+0.055*on/${frames}':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'` +
      `:s=1080x1920:fps=${FPS}[bg];` +
      `[1:v]scale=1080:1920,setsar=1,loop=loop=${frames - 1}:size=1:start=0,fps=${FPS}[fg];` +
      `[bg][fg]overlay=x=0:y='34-40*(t/${hold})':format=auto:shortest=1[v]`,
      '-map', '[v]', '-frames:v', String(frames),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-r', String(FPS), part], { maxBuffer: 1 << 26 });
    parts.push(part);
  }

  // Cut them together on a short dissolve. Long enough not to jar,
  // short enough that two people are never both on screen long enough
  // to read as a ghost.
  const args = ['-v', 'error', '-y'];
  for (const p of parts) args.push('-i', p);
  args.push(audio ? '-i' : '-f', audio ? audio : 'lavfi');
  if (!audio) args.push('-t', String(hold * parts.length),
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');

  let chain = '', last = '[0]';
  for (let i = 1; i < parts.length; i++) {
    const off = (hold - fade) * i - fade * 0;
    const tag = i === parts.length - 1 ? '[v]' : `[x${i}]`;
    chain += `${last}[${i}]xfade=transition=fade:duration=${fade}:offset=${off.toFixed(3)}${tag};`;
    last = tag;
  }
  if (parts.length === 1) chain = '[0]null[v];';
  args.push('-filter_complex', chain.replace(/;$/, ''),
    '-map', '[v]', '-map', `${parts.length}:a`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-movflags', '+faststart', '-shortest', out);

  await run('ffmpeg', args, { maxBuffer: 1 << 26 });
  const seconds = hold * parts.length - fade * (parts.length - 1);
  return { out, seconds: Number(seconds.toFixed(1)), scenes: parts.length,
           audio: audio ? 'bed' : 'silent' };
}
