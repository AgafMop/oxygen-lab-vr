// The student's lab notebook as data (pure; drawn by src/ui/notebook.js, tested in Node).

const LRI = String.fromCharCode(0x2066), PDI = String.fromCharCode(0x2069);
/** Numbers (with ° or %) inside Hebrew canvas text, isolated so "37°" doesn't draw as "°37". */
export const iso = t => String(t).replace(/\d+(?:\.\d+)?(?:\s?[°%])?/g, m => LRI + m + PDI);

const GRAPH = { rise: 'עולה (ככל שחם יותר, יותר חמצן)', fall: 'יורד (ככל שחם יותר, פחות חמצן)', peak: 'עולה ואז יורד', flat: 'לא משתנה' };
const REASON = { leak: 'דליפה בפקק', storm: 'האמבט התקרר בסופה', unmixed: 'לא עורבב', error: 'מדידה חריגה' };
export const PROTOCOL = [
  'מרכיבים משקפי מגן.',
  'מכוונים את האמבט לטמפרטורה שבחרנו.',
  'ממלאים את המשורה ההפוכה במים, עד הסוף.',
  'מוזגים 20 מ״ל מי חמצן 3% לארלנמאייר.',
  'מוסיפים כפית שמרים אחת.',
  'מערבבים מיד.',
  'סוגרים בפקק עם צינור אל המשורה.',
  'מפעילים שעון: דקה אחת.',
  'קוראים כמה גז נאסף במשורה ורושמים.',
  'חוזרים שלוש פעמים בכל טמפרטורה.',
];
const NOTES_PER_PAGE = 7;
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
export const fmt = v => (Math.round(v * 10) / 10).toString();

/** Pages (pure data) from the game state: [{ title, kind: 'lines' | 'table', lines?, rows? }]. */
export function notebookPages(s) {
  const pages = [];
  const hyp = [
    'השאלה: איך הטמפרטורה משפיעה על כמות החמצן שהשמרים מייצרים?',
    'ד״ר אזולאי טוענת: יותר חם, יותר חמצן.',
    s.hypSentence ? `ההשערה שלי: ${s.hypSentence.text}` : 'ההשערה שלי: עוד לא נכתבה.',
  ];
  if (s.hypothesis) hyp.push(`הגרף שציירתי: ${GRAPH[s.hypothesis] || ''}`);
  if (s.flags?.varsFirstTry !== undefined || s.hypothesis) {
    hyp.push('משנים: הטמפרטורה.', 'מודדים: נפח החמצן (מ״ל) בדקה.', 'קבוע: 20 מ״ל מי חמצן 3%, כפית שמרים, דקה אחת.');
  }
  pages.push({ title: 'השערת המחקר', kind: 'lines', lines: hyp });
  pages.push({ title: 'מהלך הניסוי', kind: 'lines', numbered: true, lines: PROTOCOL });

  const temps = Object.keys(s.trials || {}).map(Number).sort((a, b) => a - b);
  if (temps.length) {
    const rows = temps.map(T => {
      const l = s.trials[T];
      const valid = l.filter(t => t.valid).map(t => t.volume);
      return { T, vals: l.map(t => ({ v: t.volume, ok: t.valid })), avg: valid.length ? fmt(mean(valid)) : '–',
        who: l.some(t => t.by === 'student') ? 'אני' : 'רובי' };
    });
    const struck = [];
    for (const T of temps) s.trials[T].forEach(t => { if (!t.valid) struck.push(`${T}°: ${REASON[t.reason] || 'נפסלה'}`); });
    pages.push({ title: 'תוצאות: נפח החמצן (מ״ל) בכל מדידה', kind: 'table', rows, foot: struck.length ? `נפסלו: ${struck.join(' · ')}` : '' });
  }
  const notes = s.notes || [];
  for (let i = 0; i < notes.length; i += NOTES_PER_PAGE) {
    pages.push({ title: 'יומן המעבדה', kind: 'lines', bullets: true, lines: notes.slice(i, i + NOTES_PER_PAGE) });
  }
  if (s.peakPick != null) {
    const c = [
      `הכי הרבה חמצן נוצר בסביבות ${s.peakPick}°.`,
      'בקור: הקטלאז עובד לאט, מעט חמצן.',
      'חם מדי: הקטלאז משנה צורה, ומי החמצן כבר לא נכנס.',
    ];
    if (s.hypSentence) c.push(`ההשערה שלי הייתה: ${s.hypSentence.text}`);
    c.push(`האם ד״ר אזולאי צדקה? רק עד ${s.peakPick}°. מעל זה, חום מקלקל את האנזים.`);
    pages.push({ title: 'מסקנה', kind: 'lines', lines: c });
  }
  return pages;
}

