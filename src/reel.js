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
import { join } from 'path';
import { fileURLToPath } from 'url';

const run = promisify(execFile);
const HERE = fileURLToPath(new URL('.', import.meta.url));

/** Seconds each board holds. Short: a card that outstays its welcome
 *  is a scroll, and retention is the whole ranking signal on Reels. */
export const HOLD = Number(process.env.REEL_HOLD_SEC || 2.6);
const FPS = 30;

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
export async function buildReel(files, out, { hold = HOLD, audio = audioBed() } = {}) {
  if (!files.length) throw new Error('a reel needs at least one frame');
  const frames = Math.round(hold * FPS);
  const total = (files.length * frames) / FPS;

  const args = ['-y'];
  for (const f of files) args.push('-loop', '1', '-t', String(hold), '-i', f);
  if (audio) args.push('-i', audio);
  // A silent track rather than no track: some Instagram surfaces
  // treat an audio-less reel as malformed, and a null source costs
  // nothing.
  else args.push('-f', 'lavfi', '-t', String(total), '-i',
                 'anullsrc=channel_layout=stereo:sample_rate=44100');

  const chain = files.map((_, i) =>
    `[${i}:v]scale=1080:1920,setsar=1,` +
    `zoompan=z='min(zoom+0.0009,1.09)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'` +
    `:s=1080x1920:fps=${FPS}[v${i}]`).join(';');
  const concat = files.map((_, i) => `[v${i}]`).join('') + `concat=n=${files.length}:v=1:a=0[v]`;

  args.push('-filter_complex', `${chain};${concat}`,
    '-map', '[v]', '-map', `${files.length}:a`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
    '-movflags', '+faststart', '-shortest', out);

  await run('ffmpeg', args, { maxBuffer: 1 << 26 });
  return { out, seconds: Number(total.toFixed(1)), audio: audio ? 'bed' : 'silent' };
}
