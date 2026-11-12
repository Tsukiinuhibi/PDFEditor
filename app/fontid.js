/* ====================================================================
   字型辨識 (font identification): which font a piece of scanned text is set in, glyph by glyph. Plain canvas and
   arithmetic: nothing here touches the document. The 文字辨識 window (app/index.html) gives it the glyphs (the
   picture and Tesseract's box for each character) and shows what it finds.
   ==================================================================== */
(() => {
  'use strict';
  // "PDFE Blank" maps every code point to an empty glyph: a character drawn as `<font>, "PDFE Blank"` comes out
  // blank when the font lacks it, instead of in some fallback font that would be compared by mistake
  let blank = null;
  const ready = () => blank || (blank = (async () => {
    const ff = new FontFace('PDFE Blank', 'url(fonts/blank.ttf)');
    await ff.load(); document.fonts.add(ff);
  })());
  const fontString = (css, px, weight = 400) => `${weight} ${px}px ${css}, "PDFE Blank"`;
  const measure = document.createElement('canvas').getContext('2d');
  // does the font draw anything for ch (a missing character falls through to the blank font: no ink)
  function hasGlyph(css, ch, weight = 400){
    measure.font = fontString(css, 100, weight);
    const m = measure.measureText(ch);
    return m.actualBoundingBoxAscent + m.actualBoundingBoxDescent > 1;
  }

  window.FontId = {ready, fontString, hasGlyph};
})();
