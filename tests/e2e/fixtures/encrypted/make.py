#!/usr/bin/env python3
# Makes the encrypted test files for tests/e2e/pdf-decrypt.mjs, encrypted-open.mjs and insert-pdf.mjs.
# Needs pikepdf (qpdf): python3 -m pip install pikepdf; then run this script from any folder (names given → only those).
# Every file is the same small document (two pages of text, a Chinese title, a sticky note, an attached file, XMP
# metadata, a text field with a value), encrypted in a different way. Only "r6-userpw" needs a password to open (secret).
import os
import sys
from pikepdf import Pdf, Page, Dictionary, Array, Name, String, Encryption, ObjectStreamMode, AttachedFileSpec

HERE = os.path.dirname(os.path.abspath(__file__))


def page_text(pdf, text):
    return pdf.make_stream(('BT /F1 36 Tf 72 700 Td (%s) Tj ET' % text).encode('ascii'))


def source(pages=2, signed=False, notes=0, ur3=False):
    pdf = Pdf.new()
    font = pdf.make_indirect(Dictionary(Type=Name.Font, Subtype=Name.Type1, BaseFont=Name.Helvetica))
    for k in range(1, pages + 1):
        pg = Dictionary(Type=Name.Page, MediaBox=Array([0, 0, 595, 842]), Resources=Dictionary(Font=Dictionary(F1=font)),
                        Contents=page_text(pdf, 'Secret page %d' % k))
        if notes and k > 1:   # (many small objects: what makes a big file slow to read)
            pg.Annots = Array([pdf.make_indirect(Dictionary(Type=Name.Annot, Subtype=Name.Text, Rect=Array([100, 600 - j, 120, 620 - j]),
                                                            Contents=String('note %d-%d' % (k, j)))) for j in range(notes)])
        pdf.pages.append(Page(pdf.make_indirect(pg)))
    p1 = pdf.pages[0]
    note = pdf.make_indirect(Dictionary(Type=Name.Annot, Subtype=Name.Text, Rect=Array([100, 600, 120, 620]), Contents=String('祕密便利貼 secret note')))
    field = pdf.make_indirect(Dictionary(Type=Name.Annot, Subtype=Name.Widget, FT=Name.Tx, T=String('name'), V=String('欄位內容'),
                                         Rect=Array([72, 500, 300, 530]), P=p1.obj, F=4))
    annots = [note, field]
    fields = [field]
    if signed:
        sig = pdf.make_indirect(Dictionary(Type=Name.Sig, Filter=Name('/Adobe.PPKLite'), SubFilter=Name('/adbe.pkcs7.detached'),
                                           ByteRange=Array([0, 10, 20, 30]), Contents=String(bytes(range(48, 112)))))
        sf = pdf.make_indirect(Dictionary(Type=Name.Annot, Subtype=Name.Widget, FT=Name.Sig, T=String('Signature1'), V=sig,
                                          Rect=Array([0, 0, 0, 0]), P=p1.obj, F=132))
        annots.append(sf)
        fields.append(sf)
    if ur3:   # usage rights (Reader extensions): a signature in /Perms, not a signature field
        pdf.Root.Perms = Dictionary(UR3=pdf.make_indirect(Dictionary(Type=Name.Sig, Filter=Name('/Adobe.PPKLite'), SubFilter=Name('/adbe.pkcs7.detached'),
            ByteRange=Array([0, 10, 20, 30]), Contents=String(bytes(range(48, 112))),
            Reference=Array([Dictionary(Type=Name.SigRef, TransformMethod=Name.UR3, TransformParams=Dictionary(Type=Name.TransformParams, V=Name('/2.2')))]))))
    p1.obj.Annots = Array(annots)
    pdf.Root.AcroForm = Dictionary(Fields=Array(fields))
    pdf.docinfo['/Title'] = '測試文件'
    pdf.attachments['hello.txt'] = AttachedFileSpec(pdf, b'hello attached world', mime_type='text/plain')
    with pdf.open_metadata(set_pikepdf_as_editor=False, update_docinfo=False) as meta:   # (keep the Chinese /Title)
        meta['dc:title'] = 'XMP title'
    return pdf


WANT = set(sys.argv[1:])


def save(name, enc, objstm=False, linearize=False, **kw):
    if WANT and name not in WANT:
        return
    pdf = source(**kw)
    mode = ObjectStreamMode.generate if objstm else ObjectStreamMode.disable
    pdf.save(os.path.join(HERE, name + '.pdf'), encryption=enc, object_stream_mode=mode, linearize=linearize, static_id=True)
    print('wrote', name)


# stream lengths as separate objects (qpdf's QDF mode: "/Length 10 0 R"), with at least two streams whose encrypted data
# ends in a carriage return: a reader that looks for "endstream" instead of using the length takes that byte for a line end
def save_indirect(name, enc, pages=300):   # enc: attempt number → Encryption (RC4 gives the same bytes for the same key)
    if WANT and name not in WANT:
        return
    p = os.path.join(HERE, name + '.pdf')
    for attempt in range(60):
        source(pages=pages).save(p, encryption=enc(attempt), qdf=True, compress_streams=False, static_id=True)   # (plain text: a lost byte shows)
        b = open(p, 'rb').read()
        if b.count(b'\r\nendstream') >= 2 and b'/Length 10 0 R' in b:
            print('wrote', name, '(%d streams end in CR)' % b.count(b'\r\nendstream'))
            return
    raise SystemExit('could not make ' + name)


save('r2-rc4-40', Encryption(owner='owner-pw', user='', R=2, aes=False, metadata=False))   # (R2/R3: RC4 only, metadata always encrypted)
save('r3-rc4-128', Encryption(owner='owner-pw', user='', R=3, aes=False, metadata=False))
save('r4-rc4-128', Encryption(owner='owner-pw', user='', R=4, aes=False, metadata=False))   # (qpdf: metadata stays plain with RC4)
save('r4-aes128', Encryption(owner='owner-pw', user='', R=4, aes=True), objstm=True)
save('r4-aes128-nometa', Encryption(owner='owner-pw', user='', R=4, aes=True, metadata=False))
save('r6-aes256', Encryption(owner='owner-pw', user='', R=6), objstm=True)
save('r6-userpw', Encryption(owner='owner-pw', user='secret', R=6))
save('signed-aes128', Encryption(owner='owner-pw', user='', R=4, aes=True), signed=True)
save('signed-aes128-objstm', Encryption(owner='owner-pw', user='', R=4, aes=True), objstm=True, signed=True)   # (the signature in an object stream)
save('ur3-aes128', Encryption(owner='owner-pw', user='', R=4, aes=True), ur3=True)
save('big-aes128', Encryption(owner='owner-pw', user='', R=4, aes=True), objstm=True, pages=100)
# linearized ("Fast Web View") with object streams, as Acrobat saves by default: the trailer is in the first xref stream
save('lin-aes128', Encryption(owner='owner-pw', user='', R=4, aes=True), objstm=True, linearize=True)
save('lin-aes256', Encryption(owner='owner-pw', user='', R=6), objstm=True, linearize=True)
save_indirect('len-aes128', lambda k: Encryption(owner='owner-pw-%d' % k, user='', R=4, aes=True))
save_indirect('len-rc4-128', lambda k: Encryption(owner='owner-pw-%d' % k, user='', R=3, aes=False, metadata=False))
# 3000 pages, about 18 000 objects: reading it must not hold up the program for long
save('many-aes128', Encryption(owner='owner-pw', user='', R=4, aes=True), objstm=True, pages=3000, notes=4)
