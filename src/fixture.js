// The 21:00-21:15 window of 24.08.26 - the same content design.html
// built its specimens from. If builder.js is faithful, `npm run
// specimens` reproduces the doc. This is the renderer's golden test.
export const quotes = [
  { sym: 'NQ', last: '29,131.00', chg: -0.87 },
  { sym: 'ES', last: '6,412.25',  chg: -0.32 },
  { sym: 'YM', last: '44,180.00', chg: -0.41 },
];
export const deck = {
  window: '21:00–21:15',
  date: '24.08.26',
  stamp: '21:01',
  quotes,
  slides: [
    { type: 'cover',
      headline: 'הוצאת סוריה מרשימת הטרור — צינורות הנפט של עיראק בתמונה',
      stand: 'Brian Sullivan מ־CNBC מציין שהוצאת סוריה מרשימת "המדינות התומכות בטרור" נראית כמכוונת לאפשר בנייה ושיקום של צינורות נפט מעיראק לכיוון סוריה וטורקיה.' },
    { type: 'hero', figure: '7.5%',
      quote: 'מכס חדש בסין: 7.5% על יבוא. סין הודיעה על מכס של 7.5% על יבוא מוצרי פלדה, לפי בלומברג.' },
    { type: 'note',
      text: 'מסלול ייצוא נוסף מעיראק עשוי להפחית את פרמיית הסיכון סביב מעבר הורמוז.' },
    { type: 'chart', series: quotes, stamp: '21:01' },
    { type: 'list', rows: [
      { n: 1, headline: 'הנפט מחק את כל העלייה השבועית' },
      { n: 2, headline: 'טייוואן: כתב אישום בגין הברחת שרתי NVDA' },
      { n: 3, headline: 'התשואה ל־10 שנים נגעה ב־4.31%' },
    ]},
    { type: 'telegram', big: 'הבית של סוחרי NQ & ES', link: 't.me/nq_es_hunters',
      schedule: [
        { time: '08:00', label: 'סקירת בוקר' },
        { time: '15:00', label: 'טרום־פתיחה' },
        { time: '18:00', label: 'סקירת פתיחה' },
        { time: '23:00', label: 'סיכום יום' },
      ]},
  ],
};
