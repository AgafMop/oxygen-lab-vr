// The research hypothesis as a sentence, and the graph shape that sentence describes (pure; Node-tested).
// "כאשר [IV] [rises/falls], [DV] [rises/falls/rises then falls/does not change]."

export const IV = ['כמות השמרים', 'הטמפרטורה', 'כמות מי החמצן'];
export const DV = ['כמות השמרים', 'כמות החמצן', 'כמות מי החמצן'];
export const UPDOWN = ['תעלה', 'תרד'];
export const EFFECT = ['תעלה', 'תרד', 'תעלה ואז תרד', 'לא תשתנה'];
export const RIGHT_IV = 'הטמפרטורה', RIGHT_DV = 'כמות החמצן';

/** Graph cards (temperature grows to the right): id → label. */
export const SHAPES = [['rise', 'עולה'], ['fall', 'יורד'], ['peak', 'עולה ואז יורד'], ['flat', 'לא משתנה']];

export const sentenceText = (iv, ivDir, dv, dvDir) => `כאשר ${iv} ${ivDir}, ${dv} ${dvDir}.`;

/** The graph (oxygen against rising temperature) that a sentence describes. */
export function shapeOf({ ivDir, dvDir }) {
  if (dvDir === 'לא תשתנה') return 'flat';
  if (dvDir === 'תעלה ואז תרד') return 'peak';
  return (dvDir === 'תעלה') === (ivDir === 'תעלה') ? 'rise' : 'fall';
}

export const DEFAULT_SENTENCE = { iv: RIGHT_IV, ivDir: 'תעלה', dv: RIGHT_DV, dvDir: 'תעלה ואז תרד',
  text: sentenceText(RIGHT_IV, 'תעלה', RIGHT_DV, 'תעלה ואז תרד') };
