import { composeCallback } from '../src/compose.js';
const deck = composeCallback({
  id: 7, kind: 'forecast', posted_at: Math.floor(Date.parse('2026-09-08T07:00:00Z') / 1000),
  headline: 'ג\'יי פי מורגן מזהיר: תיקון בשווקים לקראת סוף הרבעון',
  asset: 'S&P 500', move_pct: -3.96, days_after: 2,
});
console.log(JSON.stringify(deck, null, 1));
