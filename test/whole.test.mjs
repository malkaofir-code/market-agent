// The guard, against real files and against the same files cut short.
// No network: this is about the bytes, not the bucket.
import { readFileSync } from 'fs';
import { whole } from '../src/host/supabase.js';
const png = readFileSync('src/assets/ron/01-classic-point-right.png');
const jpg = Buffer.concat([Buffer.from([0xFF, 0xD8]), Buffer.alloc(4000, 7), Buffer.from([0xFF, 0xD9])]);
const T = [
  ['whole PNG',      png,                                  'image/png',  null],
  ['PNG cut to 22%', png.subarray(0, Math.floor(png.length * .22)), 'image/png',  'truncated PNG (no IEND)'],
  ['whole JPEG',     jpg,                                  'image/jpeg', null],
  ['JPEG cut short', jpg.subarray(0, 900),                 'image/jpeg', 'truncated JPEG (no EOI)'],
  ['empty',          Buffer.alloc(0),                      'image/jpeg', 'empty file'],
  ['tiny mp4',       Buffer.alloc(500),                    'video/mp4',  'implausibly small MP4'],
];
let bad = 0;
for (const [name, buf, type, want] of T) {
  const got = whole(buf, type);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(16)} -> ${got ?? 'accepted'}`);
}
process.exit(bad ? 1 : 0);
