# Deferred minor findings, by release

Each release's final whole-branch review sorts its findings; Critical and Important ones are fixed before the
release, Minor ones are deferred. These are the deferred ones, still open, in the reviewers' words. They are fixed
in batches, one release per batch (the user, 2026-11-14: 「接著修正再發佈」). The minors of v1.0.42 and v1.0.43
were fixed in v1.0.47; those of v1.0.40, v1.0.41 and v1.0.47 in v1.0.48;
those of v1.0.38, v1.0.39 and v1.0.48 in v1.0.49;
those of v1.0.35, v1.0.36 and v1.0.37 in v1.0.50;
those of v1.0.29 to v1.0.34 and v1.0.50 in v1.0.51.

For each batch: read the items, fix the ones that still hold with a test that fails first, and record the rest
(test-only, docs-only, obsolete, or a deliberate choice) as rulings in the batch's ledger. Take a release's
section out of this file when its batch ships.

## v1.0.51 (batch v1.0.52)

- usedElsewhere's own() remembers a Type3 glyph or pattern without resources of its own by its stream only: two pages
  that share the font but map the drawn name to different pictures — only the first page's picture is marked used
- print, export (pictures, Word) and opening in a new tab read the document without writing a pending arrow-key nudge
  first (the same gap as before v1.0.51)
- settings keys checked only as plain objects (styles, view, textbox, print, find, export, fontid, ribbon) do not check
  their inner values (e.g. view.v1 {"gridMm":0})

## v1.0.28 (batch v1.0.52)

- FONTID.busy can stay true when a run is stopped by a box drawn on the 文字 tab (closed by the run token of fix 3 if it does)
- no progress shown on the 字型 tab while the 文字 tab's OCR runs (static 讀取中…)
- glyphs may come from the median-filtered picture (thinner hairlines) — needs measurement first
- Google web fonts (PDFE GF n faces, gfCache) accumulate over a long session
- no absolute similarity floor (drawings read confidently as 口/日/田 get low-% rows)
- the 500-candidate test repeats loaded fonts; Windows cold-font timing still to be measured on Windows
- glyphsFromImage runs unyielded (a few hundred ms and large temporary arrays on a near-full-page box)
- a font missing from commonObjs is reported as 「PDF 沒有記錄字型名稱」 (and embedded defaults to true)
- blocks:true output now on every 文字-tab read
- any 4xx on a batch triggers one-by-one retries (429/403 would multiply requests)
- version / release notes not on the branch — done in the release step (Task 8 step 5), not a code finding

## v1.0.27 (batch v1.0.52)

- whole-embedded CFF .otf is written as /CIDFontType0C (poppler warns; renders)
- face choice without a "Regular" style takes the first upright face; /bold/ can pick "Bold Condensed"
- italic is always the upright face skewed, even when the family has an Italic face (editor and page widths differ)
- SYS_BYTES / RFI never evicted; the first click on page text reads the matched font file twice, without a busy indicator
- fsType with several bits (e.g. 0x0006) is treated by its most restrictive bit
- subsetIsSound lays out without 'vert', so vertical alternates are not checked
- an emptied page-text editor that gets a font keeps the strut font '' at commit (sub-point drift)
- test gaps — different-version font widths (Focus 5), the real whole-embed write path, tab switch during the dialog
- test hooks on window.__pdfapp (project convention)

## v1.0.26 (batch v1.0.52)

- renderTextBox waits with Promise.all; offline mid-session it may skip waiting for PDFE Sans (use allSettled)
- Enter in the search box ignores isComposing (macOS IME confirm could pick a font)
- Enter on an empty search picks 思源黑體
- closing the menu with the font button leaves focus on body (restoreTBRange)
- the editor's highlight is not visible while the search box has focus
- mixed-font lines use Noto-tuned baseline/line height in renderTextBox
- .fm-list has no overscroll-behavior:contain
- HANDOFF says v1.0.26 is the latest release while it is still a preview
