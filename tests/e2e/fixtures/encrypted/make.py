#!/usr/bin/env python3
# Makes the encrypted test files for tests/e2e/pdf-decrypt.mjs, encrypted-open.mjs and insert-pdf.mjs.
# Needs pikepdf (qpdf): python3 -m pip install pikepdf; then run this script from any folder.
# Every file is the same small document (two pages of text, a Chinese title, a sticky note, an attached file, XMP
# metadata, a text field with a value), encrypted in a different way. Only "r6-userpw" needs a password to open (secret).
import os
from pikepdf import Pdf, Page, Dictionary, Array, Name, String, Encryption, ObjectStreamMode, AttachedFileSpec

HERE = os.path.dirname(os.path.abspath(__file__))


def page_text(pdf, text):
    return pdf.make_stream(('BT /F1 36 Tf 72 700 Td (%s) Tj ET' % text).encode('ascii'))


def source(pages=2, signed=False):
    pdf = Pdf.new()
    font = pdf.make_indirect(Dictionary(Type=Name.Font, Subtype=Name.Type1, BaseFont=Name.Helvetica))
    for k in range(1, pages + 1):
        pg = Dictionary(Type=Name.Page, MediaBox=Array([0, 0, 595, 842]), Resources=Dictionary(Font=Dictionary(F1=font)),
                        Contents=page_text(pdf, 'Secret page %d' % k))
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
    p1.obj.Annots = Array(annots)
    pdf.Root.AcroForm = Dictionary(Fields=Array(fields))
    pdf.docinfo['/Title'] = '測試文件'
    pdf.attachments['hello.txt'] = AttachedFileSpec(pdf, b'hello attached world', mime_type='text/plain')
    with pdf.open_metadata(set_pikepdf_as_editor=False, update_docinfo=False) as meta:   # (keep the Chinese /Title)
        meta['dc:title'] = 'XMP title'
    return pdf


def save(name, enc, objstm=False, **kw):
    pdf = source(**kw)
    mode = ObjectStreamMode.generate if objstm else ObjectStreamMode.disable
    pdf.save(os.path.join(HERE, name + '.pdf'), encryption=enc, object_stream_mode=mode, static_id=True)
    print('wrote', name)


save('r2-rc4-40', Encryption(owner='owner-pw', user='', R=2, aes=False, metadata=False))   # (R2/R3: RC4 only, metadata always encrypted)
save('r3-rc4-128', Encryption(owner='owner-pw', user='', R=3, aes=False, metadata=False))
save('r4-rc4-128', Encryption(owner='owner-pw', user='', R=4, aes=False, metadata=False))   # (qpdf: metadata stays plain with RC4)
save('r4-aes128', Encryption(owner='owner-pw', user='', R=4, aes=True), objstm=True)
save('r4-aes128-nometa', Encryption(owner='owner-pw', user='', R=4, aes=True, metadata=False))
save('r6-aes256', Encryption(owner='owner-pw', user='', R=6), objstm=True)
save('r6-userpw', Encryption(owner='owner-pw', user='secret', R=6))
save('signed-aes128', Encryption(owner='owner-pw', user='', R=4, aes=True), signed=True)
save('big-aes128', Encryption(owner='owner-pw', user='', R=4, aes=True), objstm=True, pages=100)
