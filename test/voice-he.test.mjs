import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speakableHe } from '../src/voice.js';

test('prepares Hebrew abbreviations and English tickers for speech', () => {
  const s = speakableHe('בארה״ב S&P 500 עלה ב-1.5%, וגם NVDA ואג״ח');
  assert.match(s, /אַרְצוֹת הַבְּרִית/);
  assert.match(s, /אֶס אַנְד פִּי חֲמֵשׁ מֵאוֹת/);
  assert.match(s, /1 נְקוּדָה 5 אָחוּז,/);
  assert.match(s, /אֶן וִי דִּי אֵיי/);
  assert.match(s, /אִגְּרוֹת חוֹב/);
  assert.ok(s.endsWith('.'));
});

test('preserves meaningful punctuation and existing Hebrew vowels', () => {
  assert.equal(speakableHe('שָׁלוֹם, עולם?'), 'שָׁלוֹם, עולם?');
  assert.equal(speakableHe('השוק עלה — המניות ירדו'), 'השוק עלה, המניות ירדו.');
  assert.equal(speakableHe('ירד ב-1%'), 'ירד ב-1 אָחוּז.');
  assert.equal(speakableHe(''), '');
  assert.match(speakableHe('XYZ'), /אֶקְס וַואי זִי/);
});
