# Deferred minor findings, by release

Each release's final whole-branch review sorts its findings; Critical and Important ones are fixed before the
release, Minor ones are deferred. These are the deferred ones, still open, in the reviewers' words. They are fixed
in batches, one release per batch (the user, 2026-11-14: 「接著修正再發佈」). The minors of v1.0.42 and v1.0.43
were fixed in v1.0.47; those of v1.0.40, v1.0.41 and v1.0.47 in v1.0.48;
those of v1.0.38, v1.0.39 and v1.0.48 in v1.0.49;
those of v1.0.35, v1.0.36 and v1.0.37 in v1.0.50;
those of v1.0.29 to v1.0.34 and v1.0.50 in v1.0.51;
those of v1.0.26 to v1.0.28 and v1.0.51 in v1.0.52.

For each batch: read the items, fix the ones that still hold with a test that fails first, and record the rest
(test-only, docs-only, obsolete, or a deliberate choice) as rulings in the batch's ledger. Take a release's
section out of this file when its batch ships.

## v1.0.52 (batch v1.0.53)

- the page-text editor's baseline and the written text's differ by a size-dependent amount even without any font change
  (13 px: 0.95 pt, 14 px: 0.1 pt, 16 px: 0.4 pt) — Chrome rounds font metrics in line layout, layoutReal uses canvas
  metrics (found while testing the emptied-editor fix)
- settleEdits / openInNewTab skip a nudge that is being written (NUDGE null while NUDGE_RUN is in flight): call
  flushNudge unconditionally (it waits for NUDGE_RUN); openInNewTab's flush is not guarded (a throw stops the open)
- copySelected (copy pages) and openDigiSign read S.bytes without writing a pending nudge
- a whole CFF embed (CIDFontType0) still carries pdf-lib's /CIDToGIDMap /Identity (defined for CIDFontType2 only;
  PDF/A preflight may flag it); a CID-keyed CFF whose charset is the identity could take the /OpenType marking too
- fontkit CFF subsets: poppler says "Embedded font file may be invalid" (renders the same) — predates, to look into
- a second font pick in an emptied page-text editor nests zero-width runs; the caret branch's sel.getRangeAt(0)
  throws when there is no range (the old empty-box branch did not need one)
- pdfFontsIn: `!f ||` in generic is redundant (only `unread` carries the change)
- 「辨識文字中…」 also shows while the box's PDF text is being read, before any OCR
- no export → import round trip test for the view / textbox / styles shape checks
- cached font-list entries do not restore `variable` / `weight`: a variable font whose default is not regular is
  greyed only until a restart (then it fails at the commit, with a message)
- export.v1 inner values (dpi, quality) are taken as given by the export dialog (a hand-edited non-number dpi gives
  NaN sizes)
