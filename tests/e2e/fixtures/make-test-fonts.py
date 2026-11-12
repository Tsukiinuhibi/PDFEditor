"""Makes the small test fonts the end-to-end tests use (run from the repository root with fonttools installed):

    python tests/e2e/fixtures/make-test-fonts.py

Each one is a tiny subset of app/fonts/NotoSansTC-Regular.ttf (SIL Open Font License, see app/fonts/OFL.txt)
under its own family name, changed in one way:
  vert-test.ttf        keeps the vertical data (vhea, vmtx, GSUB 'vert')        family "PDFE Vert Test"
  nosubset-test.ttf    OS/2 fsType = 0x0100 (no subsetting: embed it whole)    family "PDFE NoSubset Test"
  restricted-test.ttf  OS/2 fsType = 0x0002 (restricted: must not be embedded) family "PDFE Restricted Test"
  oddglyph-test.ttf    glyph records of odd length (glyf padding 1)            family "PDFE Odd Test"
  var-test.ttf         a variable font (wght 400–700), default instance 400    family "PDFE Var Test"
  varbold-test.ttf     a variable font (wght 400–700), default instance 700    family "PDFE VarBold Test"
                       (masters: subsets of app/fonts/NotoSansTC-Regular.ttf and NotoSansTC-Bold.ttf, which come from
                       the same variable font and so interpolate)
  gf-test.ttf          DejaVu Serif (Bitstream Vera licence: changed fonts take another name), ASCII only, drawn 80%
                       as wide: a drawing no installed font has, served as a fake "Google font"   family "PDFE GF Test"
"""
import struct
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.designspaceLib import DesignSpaceDocument, AxisDescriptor, SourceDescriptor
from fontTools import varLib
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

SRC = 'app/fonts/NotoSansTC-Regular.ttf'
OUT = 'tests/e2e/fixtures/'

def odd_glyphs(path):
    """Give every outlined glyph record an odd length (one spare byte at its end, which is allowed) and write the
    'loca' table in the long format. Done on the bytes: fonttools would pad the records again when saving."""
    data = open(path, 'rb').read()
    num = struct.unpack('>H', data[4:6])[0]
    tables = {}
    for k in range(num):
        tag, chk, off, ln = struct.unpack('>4sIII', data[12 + 16 * k:28 + 16 * k])
        tables[tag.decode('latin-1')] = data[off:off + ln]
    head = bytearray(tables['head']); short = struct.unpack('>h', head[50:52])[0] == 0
    loca = tables['loca']; n = len(loca) // (2 if short else 4)
    offs = [struct.unpack('>H', loca[2 * k:2 * k + 2])[0] * 2 for k in range(n)] if short else [struct.unpack('>I', loca[4 * k:4 * k + 4])[0] for k in range(n)]
    glyf, new_offs = b'', []
    for k in range(n - 1):
        rec = tables['glyf'][offs[k]:offs[k + 1]]
        if rec and len(rec) % 2 == 0: rec += b'\0'
        new_offs.append(len(glyf)); glyf += rec
    new_offs.append(len(glyf))
    tables['glyf'] = glyf
    tables['loca'] = b''.join(struct.pack('>I', o) for o in new_offs)
    head[8:12] = b'\0\0\0\0'; head[50:52] = struct.pack('>h', 1); tables['head'] = bytes(head)
    tags = sorted(tables)
    out = bytearray(data[:4] + struct.pack('>HHHH', len(tags), *search_params(len(tags))))
    pos = 12 + 16 * len(tags); body = b''
    for t in tags:
        tdata = tables[t]
        out += struct.pack('>4sIII', t.encode('latin-1'), checksum(tdata), pos + len(body), len(tdata))
        body += tdata + b'\0' * (-len(tdata) % 4)
    out += body
    adj = (0xB1B0AFBA - checksum(bytes(out))) & 0xFFFFFFFF
    h = tags.index('head'); hoff = struct.unpack('>I', out[12 + 16 * h + 8:12 + 16 * h + 12])[0]
    out[hoff + 8:hoff + 12] = struct.pack('>I', adj)
    open(path, 'wb').write(out)

def checksum(b):
    b = b + b'\0' * (-len(b) % 4)
    return sum(struct.unpack('>%dI' % (len(b) // 4), b)) & 0xFFFFFFFF

def search_params(n):
    e = n.bit_length() - 1
    return (2 ** e) * 16, e, n * 16 - (2 ** e) * 16

def make(name, family, text, fs_type=None, padding=4, features=()):
    opts = subset.Options()
    opts.name_IDs = ['*']; opts.name_languages = ['*']; opts.notdef_outline = True
    opts.layout_features = list(features)
    f = TTFont(SRC, recalcTimestamp=False)
    s = subset.Subsetter(opts); s.populate(text=text); s.subset(f)
    n = f['name']
    for rec in list(n.names):
        if rec.nameID in (1, 2, 3, 4, 6, 16, 17): n.names.remove(rec)
    ps = family.replace(' ', '') + '-Regular'
    n.setName(family, 1, 3, 1, 0x409); n.setName('Regular', 2, 3, 1, 0x409); n.setName(ps, 3, 3, 1, 0x409)
    n.setName(family + ' Regular', 4, 3, 1, 0x409); n.setName(ps, 6, 3, 1, 0x409)
    if fs_type is not None: f['OS/2'].fsType = fs_type
    f['glyf'].padding = padding
    f.save(OUT + name)
    if padding == 1: odd_glyphs(OUT + name)
    g = TTFont(OUT + name)
    loca = g['loca']
    odd = sum(1 for k in range(len(loca) - 1) if (loca[k + 1] - loca[k]) % 2)
    print(f'{name}: {len(g.getGlyphOrder())} glyphs, loca format {g["head"].indexToLocFormat}, odd-length glyphs {odd}, '
          f'fsType {g["OS/2"].fsType:#06x}, vhea {"vhea" in g}, vert {"GSUB" in g and any(fr.FeatureTag == "vert" for fr in g["GSUB"].table.FeatureList.FeatureRecord)}')

def make_variable(name, family, text, default):
    masters = {}
    for w, src in ((400, 'app/fonts/NotoSansTC-Regular.ttf'), (700, 'app/fonts/NotoSansTC-Bold.ttf')):
        opts = subset.Options(); opts.name_IDs = ['*']; opts.name_languages = ['*']; opts.notdef_outline = True; opts.layout_features = []
        f = TTFont(src, recalcTimestamp=False)
        s = subset.Subsetter(opts); s.populate(text=text); s.subset(f)
        masters[w] = f
    ds = DesignSpaceDocument()
    ax = AxisDescriptor(); ax.tag = 'wght'; ax.name = 'Weight'; ax.minimum = 400; ax.maximum = 700; ax.default = default
    ds.addAxis(ax)
    for w, f in masters.items():
        src = SourceDescriptor(); src.font = f; src.location = {'Weight': w}; src.name = f'w{w}'; ds.addSource(src)
    vf, _, _ = varLib.build(ds)
    n = vf['name']
    for rec in list(n.names):
        if rec.nameID in (1, 2, 3, 4, 6, 16, 17): n.names.remove(rec)
    ps = family.replace(' ', '') + '-Regular'
    n.setName(family, 1, 3, 1, 0x409); n.setName('Regular', 2, 3, 1, 0x409); n.setName(ps, 3, 3, 1, 0x409)
    n.setName(family + ' Regular', 4, 3, 1, 0x409); n.setName(ps, 6, 3, 1, 0x409)
    vf['glyf'].padding = 4
    vf.save(OUT + name)
    g = TTFont(OUT + name)
    print(f'{name}: fvar {"fvar" in g}, usWeightClass {g["OS/2"].usWeightClass}, glyphs {len(g.getGlyphOrder())}')

def make_condensed(name, family, src, sx):
    opts = subset.Options(); opts.name_IDs = ['*']; opts.name_languages = ['*']; opts.notdef_outline = True
    opts.layout_features = []; opts.hinting = False
    f = TTFont(src, recalcTimestamp=False)
    s = subset.Subsetter(opts); s.populate(unicodes=range(0x20, 0x7F)); s.subset(f)
    gs, glyf, hmtx = f.getGlyphSet(), f['glyf'], f['hmtx']
    outlines = {}
    for g in f.getGlyphOrder():
        rec = DecomposingRecordingPen(gs); gs[g].draw(rec)
        pen = TTGlyphPen(None); rec.replay(TransformPen(pen, (sx, 0, 0, 1, 0, 0))); outlines[g] = pen.glyph()
    for g, gl in outlines.items():
        glyf[g] = gl
        adv, lsb = hmtx[g]; hmtx[g] = (round(adv * sx), round(lsb * sx))
    n = f['name']
    for rec in list(n.names):
        if rec.nameID in (1, 2, 3, 4, 6, 16, 17): n.names.remove(rec)
    ps = family.replace(' ', '') + '-Regular'
    n.setName(family, 1, 3, 1, 0x409); n.setName('Regular', 2, 3, 1, 0x409); n.setName(ps, 3, 3, 1, 0x409)
    n.setName(family + ' Regular', 4, 3, 1, 0x409); n.setName(ps, 6, 3, 1, 0x409)
    f.save(OUT + name)
    print(f'{name}: {len(TTFont(OUT + name).getGlyphOrder())} glyphs, {sx:.0%} wide')

make('vert-test.ttf', 'PDFE Vert Test', '直書測試字型，。「」ABC', features=('vert', 'vrt2'))
make('nosubset-test.ttf', 'PDFE NoSubset Test', '無子集測試ABC', fs_type=0x0100)
make('restricted-test.ttf', 'PDFE Restricted Test', '禁止嵌入測試ABC', fs_type=0x0002)
make('oddglyph-test.ttf', 'PDFE Odd Test', '奇數長度測試ABCDEFGH', padding=1)
make_variable('var-test.ttf', 'PDFE Var Test', '可變字型測試粗體ABC', 400)
make_variable('varbold-test.ttf', 'PDFE VarBold Test', '可變字型測試粗體ABC', 700)
make_condensed('gf-test.ttf', 'PDFE GF Test', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf', 0.8)
