# Deferred minor findings, by release

Each release's final whole-branch review sorts its findings; Critical and Important ones are fixed before the
release, Minor ones are deferred. These are the deferred ones, still open, in the reviewers' words. They are fixed
in batches, one release per batch (the user, 2026-11-14: 「接著修正再發佈」). The minors of v1.0.42 and v1.0.43
were fixed in v1.0.47; those of v1.0.40, v1.0.41 and v1.0.47 in v1.0.48;
those of v1.0.38, v1.0.39 and v1.0.48 in v1.0.49;
those of v1.0.35, v1.0.36 and v1.0.37 in v1.0.50;
those of v1.0.29 to v1.0.34 and v1.0.50 in v1.0.51;
those of v1.0.26 to v1.0.28 and v1.0.51 in v1.0.52;
those of v1.0.52 in v1.0.53.

For each batch: read the items, fix the ones that still hold with a test that fails first, and record the rest
(test-only, docs-only, obsolete, or a deliberate choice) as rulings in the batch's ledger. Take a release's
section out of this file when its batch ships.

## v1.0.53 (batch v1.0.54)

- copySelected no longer blocks input at once when a nudge is pending: a second Ctrl+X in that gap could cut again
  (a re-entry guard)
- openDigiSign returns without a message when settleEdits keeps a text editor open (回去修改)
- the export round-trip test uses a hand-copied literal of the export window's defaults (share them, or drive
  saveExpPrefs from the window's state)
- the "nudge being written" test polls for the write in progress; a very fast write could be missed (a hook that
  delays the write would make it deterministic)
- export.v1 keys pad / macOn / lastDir are still taken as given (`+st.pad` → NaN for a hand-edited string)
- an open note while a nudge is flushed explicitly (mutate → closeNote → inner mutate waiting on NUDGE_RUN) — not
  traced, predates
- in an emptied page-text editor, a size picked after a font leaves the editor's strut at the old size while the commit
  uses realStrut — predates

## v1.0.54 (batch v1.0.55)

- a corner drag that changes no size (tiny, or every run already at 4 or 400) still writes an undo step and redraws
  with the reopened strut
- clamping each run to 4–400 changes the ratios of mixed sizes for good (limit the factor instead); a very small drag
  takes all text to 4 pt at once
- a second click on 〔▾〕 opens the size list again instead of closing it (dataset.for, as the note-author list)
- in the object bar, Esc deselects the box but leaves the size list open; a pick from it then restyles the box
- the highlighted text is not shown highlighted while the size box has the focus (CSS highlight, as the font menu)
- a shrunk 修改的文字 cover box can show the original text under it (also with a smaller size restyle; not new)
- sizes up to 400 are not limited by the page: a long line at 300–400 pt makes a very large picture

## v1.0.55 (batch later)

- `data:image/…` addresses (「複製圖片位址」 often gives one) are refused without a word: the 下載 button stays grey
- an image link dragged onto the window goes to the PDF window (「不是 PDF 檔」); it could go to the picture one
- picture sniffing is loose: any body starting "BM" is a BMP; an HTML page starting `<!--` / `<?xml` with an inline
  `<svg` counts as SVG (only a less helpful message)
- no limit on pixel dimensions before decoding a picture from the web (a small file can declare enormous sizes)
- 〔下載〕 is clickable again while the picture is being decoded (a second download; harmless)
- blob URLs of pictures not placed are never revoked (up to 50 MB each, for the session)
- the picture's name drops anything after a last dot ("v1.2" → "v1"); Content-Disposition is not used for pictures
- tests: GIF, WebP, BMP, JPEG (original bytes kept), over 50 MB, cancel, a redirect
