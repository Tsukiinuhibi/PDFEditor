# Deferred minor findings, by release

Each release's final whole-branch review sorts its findings; Critical and Important ones are fixed before the
release, Minor ones are deferred. These are the deferred ones, still open, in the reviewers' words. They are fixed
in batches, one release per batch (the user, 2026-11-14: 「接著修正再發佈」). The minors of v1.0.42 and v1.0.43
were fixed in v1.0.47; those of v1.0.40, v1.0.41 and v1.0.47 in v1.0.48;
those of v1.0.38, v1.0.39 and v1.0.48 in v1.0.49;
those of v1.0.35, v1.0.36 and v1.0.37 in v1.0.50.

For each batch: read the items, fix the ones that still hold with a test that fails first, and record the rest
(test-only, docs-only, obsolete, or a deliberate choice) as rulings in the batch's ledger. Take a release's
section out of this file when its batch ships.

## v1.0.50 (batch v1.0.51)

- IMG_JOB is held across waits that might never settle (pickImage relies on the file input's cancel event; openModal
  replaces an earlier unanswered dialog without settling it): 刪除圖片／更換圖片… would then do nothing until restart (no
  live path found in Electron 45)
- usedElsewhere does not read a Type3 font without /Resources of its own (it draws with the page's) or soft-mask groups
  (ExtGState /SMask /G): a page picture they draw by name can lose the name (the data survives)
- cloneChain in "all" mode: an inner form that an appearance also draws, inside an outer form drawn on two pages, is
  copied twice (one copy and its PDFE_Fm name unused); usedElsewhere walks the document once more for it
- an arrow-key nudge still pending is lost on Shift+box (and on Ctrl+] or a panel action)
- the panel's object menu still offers 刪除 and 隱藏 for an object on a locked layer (pre-existing)
- merging or deleting a layer with 「保留物件」 can move objects into a locked layer (pre-existing)

## v1.0.34 (batch v1.0.51)

- coverage gaps — opacity on turned stamps/pictures, a pixel check for a faded stamp, Focus 3's "original reference", Focus 4's centre/size
- the opacity list shows 100% for area fills made before v1.0.34 with a lower opacity (no CA)
- refillStamp trusts the SMask layout (no length / bit-depth check) for fills re-saved by other programs
- no message when a stamp cannot be recoloured; picking the value already set still adds an undo step
- the stamp picker keeps a recoloured standard stamp's colour when 使用此戳記 is pressed without a new pick

## v1.0.33 (batch v1.0.51)

- the re-selection after a restyle is unconditional (only reachable by keyboard while busy blocks the pointer)
- opacity values not in the list (presets .6 / .45) show 100% in the object's bar
- an area highlight's frame grows 2 pt per side on its first restyle (markupGeom's padding; the fill does not change, it does not accumulate)
- a box preset on a polyline writes IC (ignored when drawing)
- regenAP's default style argument is unused
- each selection also reads the cached geometry document

## v1.0.32 (batch v1.0.51)

- a value of valid JSON but the wrong shape (lasttool / lastact / bindings / stamp / colors) breaks tools, shortcuts or pickers until a good file is imported — only a hand-edited or damaged file; per-key shape checks would stop it
- a storage error part-way through the import writes some keys, says 匯入失敗 and does not reload
- no size limit before reading the chosen file
- closeModal(true) before the question closes whatever window is open (only the settings window in practice)
- the question does not say the people list and default author come from the file
- 「會取代目前的 N 項設定」 counts the file's entries, some of which may be new on this computer
- installed-font names (textbox font, recent fonts) travel to computers that may not have them (they fall back); worth a HANDOFF line
- test gaps — the evil / seenversion file only through parseSettingsFile, not the picker; browser mode; fixed waits
- with localStorage unreadable the export writes an empty file and still says 已匯出

## v1.0.31 (batch v1.0.51)

- HANDOFF 3.9.3 still says 「pagesEl 的 contextmenu」 (it is the viewer's now)
- with note A open, right-clicking note B and dismissing its menu leaves A open (saved later, when it closes); a right-click on .abar / .xbar no longer closes an open note either
- a right-click that finishes a polygon or fill outline selects the new shape when the click was inside it
- a right-click while left-dragging a selection deselects it and each pointermove until release throws (AS is null in dragAnnot's upd); Esc mid-drag has the same old fault
- selectAnnot after `await annAt` is not re-guarded by S.els[i]
- test gaps — polyline (2 points), signature / image / digisign tools, right-click on the selected object itself, on .xbar, on a hidden / locked layer object

## v1.0.30 (batch v1.0.51)

- a note with no author (other software) shows the default name ▾ ticked; picking that name writes nothing; a copy of it is pasted with the default name
- repeated Ctrl+V with the mouse off the page stacks the copies on one spot (+16 pt from the original each time)
- if DESK.info() fails the people list is never made (人員 empty, 〔新增〕 silent; AUTHOR stays 使用者)
- the author button does not close its own open list (the list closes on pointerdown and the click opens it again)
- test gaps — Review Focus 1 tested for 〔刪除〕 only (編輯 / 複製 by reading); the note menu header with < > not tested; no test opens a note without /T or without an appearance; the spec's test list says 螢光筆, the test uses a rectangle (same AUTHOR path)
- a stored list that the loader cleans (trimmed / duplicate names) is written back only on the next change
- test gaps — Review Focus 1 tested for 〔刪除〕 only (編輯 / 複製 by reading); the note menu header with < > not tested; no test opens a note without /T or without an appearance; the spec's test list says 螢光筆, the tes

## v1.0.29 (batch v1.0.51)

- Review Focus 1 named a password dialog — password PDFs show a toast, not a modal; the wait works for every openModal window (tested with the settings window)
- "##" lines inside a section (not a version heading) are shown literally — only "###"+ become headings; none exist today
- nested lists are flattened (each line trimmed); none exist today
- if localStorage cannot be written, a used computer would see the window at every start
- main.js notesText deletes anything shaped like <…> in a release body
- test gaps — 「讀不到版本記錄」 in settings not asserted; the settings check asserts el.hidden rather than visibility; cl.length >= 19 is a magic number

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
