await Promise.all(['500 64px Caveat', '600 46px Caveat', '400 46px Caveat'].map(f => document.fonts.load(f)));
await import('./film.js');
