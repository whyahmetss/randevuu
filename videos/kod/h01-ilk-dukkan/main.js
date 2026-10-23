import { makeComp } from './ortak/gl.js';
import { BOIL } from './ortak/crayon.js';
await Promise.all(['400 52px "Patrick Hand"', '400 52px "Caveat Brush"'].map(f => document.fonts.load(f)));
const comp = makeComp(document.getElementById('gl'));
const M = await import('./film.js');
window.DUR = M.DUR; window.EV = M.EV; window.SUBS = M.ALTYAZI; window.TEXTS = M.TEXTS;
window.render = t => { BOIL.step = Math.floor(t * 12 + 1e-6); M.frame(comp, t); };
window.READY = true;
