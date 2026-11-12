# Makes app/fonts/blank.ttf ("PDFE Blank"): every code point maps to one empty, zero-width glyph. 字型辨識 draws a
# character as `<font>, "PDFE Blank"`, so a character the font lacks comes out blank instead of in a fallback font.
# Usage: python scripts/make-blank-font.py app/fonts/blank.ttf   (needs fonttools)
import sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable

fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(['.notdef', 'blank'])
fb.setupCharacterMap({0x41: 'blank'})
fb.setupGlyf({'.notdef': TTGlyphPen(None).glyph(), 'blank': TTGlyphPen(None).glyph()})
fb.setupHorizontalMetrics({'.notdef': (0, 0), 'blank': (0, 0)})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({'familyName': 'PDFE Blank', 'styleName': 'Regular'})
fb.setupOS2()
fb.setupPost()
font = fb.font
# one (3,10) format 13 subtable (many code points to one glyph): U+0020–U+D7FF, U+E000–U+FFFF, U+10000–U+3FFFF
st = CmapSubtable.newSubtable(13)
st.platformID, st.platEncID, st.language = 3, 10, 0
st.cmap = {cp: 'blank' for r in (range(0x20, 0xD800), range(0xE000, 0x10000), range(0x10000, 0x40000)) for cp in r}
font['cmap'].tables = [st]
font.save(sys.argv[1])
