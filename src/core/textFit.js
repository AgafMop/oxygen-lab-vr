// Fit text into a box: wrap on spaces, shrink from maxPx down to minPx, never below minPx.
const DEFAULT_FONT = 'Heebo, "Segoe UI", sans-serif';

function wrap(words, px, w, measure) {
  const lines = [];
  let line = '';
  for (const word of words) {
    const t = line ? `${line} ${word}` : word;
    if (line && measure(t, px) > w) { lines.push(line); line = word; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

/** Pure layout. measure(str, px) → width in the same units as w. */
export function layoutText({ text, w, h, maxPx, minPx, lineH = 1.2, measure }) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const top = Math.max(minPx, Math.floor(maxPx));
  for (let px = top; px >= minPx; px--) {
    const lines = wrap(words, px, w, measure);
    if (lines.every(l => measure(l, px) <= w) && lines.length * px * lineH <= h) return { px, lines, fits: true };
  }
  return { px: minPx, lines: wrap(words, minPx, w, measure), fits: false };
}

/** Draw `text` fitted into the box (x, y, w, h) on a 2D canvas context. */
export function fitText(g, text, { x, y, w, h, maxPx, minPx = 10, weight = 700, align = 'center', valign = 'middle', font = DEFAULT_FONT, lineH = 1.2 }) {
  const setFont = px => { g.font = `${weight} ${px}px ${font}`; };
  const measure = (s, px) => { setFont(px); return g.measureText(s).width; };
  const r = layoutText({ text, w, h, maxPx: maxPx ?? h, minPx, lineH, measure });
  setFont(r.px);
  g.textAlign = align; g.textBaseline = 'middle';
  const total = r.lines.length * r.px * lineH;
  const top = valign === 'top' ? y : valign === 'bottom' ? y + h - total : y + (h - total) / 2;
  const rtl = g.direction !== 'ltr';
  const side = align === 'start' ? (rtl ? 'right' : 'left') : align === 'end' ? (rtl ? 'left' : 'right') : align;
  const tx = side === 'center' ? x + w / 2 : side === 'left' ? x : x + w;
  r.lines.forEach((l, i) => g.fillText(l, tx, top + (i + 0.5) * r.px * lineH));
  return { px: r.px, fits: r.fits, lines: r.lines.length };
}
