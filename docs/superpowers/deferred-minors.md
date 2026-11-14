# Deferred minor findings, by release

Each release's final whole-branch review sorts its findings; Critical and Important ones are fixed before the
release, Minor ones are deferred. These are the deferred ones, still open, in the reviewers' words. They are fixed
in batches, one release per batch (the user, 2026-11-14: 「接著修正再發佈」). The minors of v1.0.42 and v1.0.43
were fixed in v1.0.47.

For each batch: read the items, fix the ones that still hold with a test that fails first, and record the rest
(test-only, docs-only, obsolete, or a deliberate choice) as rulings in the batch's ledger. Take a release's
section out of this file when its batch ships.

## v1.0.47 (batch v1.0.48)

- 轉存 Word: 「取消中…（正在停止 Word）」 shows during 準備中, before Word has started (wording only)
- file:write leaves a partial .pdfeditor-tmp when writing the temporary file itself fails (a full disk); the rename/copy failure path already removes it

## v1.0.41 (batch v1.0.48)

- a link that is a direct dictionary in /Annots (no NNR id) can be "saved" or "deleted" with nothing happening and no message
- another program's link with /Border [0 0 1] and no /AP reads as 細藍框 (also for a red frame); getting our drawn frame needs 不顯示框, save, then 細藍框
- on a look change the old /AP stream and an indirect /A are left as unused objects; /QuadPoints and /PA are kept
- the click eater lives 800 ms; a Ctrl+press on a link that ends in a drag can swallow the next real click within that time
- in the short gap after a change, before the page's overlay is rebuilt, Ctrl+click finds nothing and falls through to the tool
- with the link tool, a new link cannot be drawn starting inside an existing link's box
- the $$('[data-act="insertImage"]') line in setTool matches nothing now; actions.insertImage has no caller left
- Ctrl+click opens a web address with no confirmation (Acrobat asks first); main.js allows only http, https and mailto
- tests — no JavaScript-action fixture; the page-link Ctrl+click check does not first confirm the view went back to page 1; fixed waits throughout
- the insertImage on-state line in setTool matches nothing now; actions.insertImage has no caller left

## v1.0.40 (batch v1.0.48)

- Latin-1 or Big5 filename= values become mojibake ("r�sum�.pdf") — keep the original name when the decoded one has �
- early returns (!res.ok, Content-Length over the cap) leave the response body open until garbage collection
- no http(s) check on res.url after redirects
- peak memory about 2 GB for a 500 MB file (four copies across main, IPC and the page)
- the whole clipboard is sent to the page on every open, not only an address
- a double Ctrl+Shift+O orphaned a dialog — the URLOPEN guard added for Important 1/2 now also stops it; no test of its own
- reopening right after Esc can leave 〔開啟〕 dead while the cancelled request winds down
- raw English error text (net::ERR_…, an address with a user name and password); 401/403 have no sign-in hint
- no busy sign while a large downloaded PDF is read; a password-protected PDF gets the generic message
- with gzip, the progress line can read "12.0 / 3.0 MB"
- the text/plain drop fallback is wider than the spec — dragged text that is an address also starts a download
- an empty file name (filename="...") becomes page.pdf instead of the address's own name
- an old custom Ctrl+Shift+O binding stops working silently (the built-in shortcut wins)
- fixed sleeps in the test; /r and /noext asserted together; the test overwrites the system clipboard
- docs not closed out (HANDOFF queue line, package.json version, release notes) — the release step does these

## v1.0.39 (batch v1.0.49)

- a line that cannot be taken out (text in a form object) with an empty replacement still counts in 「已取代 N 處」 and makes an undo step that changes nothing
- lines that cannot be done are dropped without saying which; a block without editing data is not replaceable (the editor treats it as plain text)
- a line mixing original pieces and one of our blocks is rewritten as plain text, leaving the block's shell (as the single-click editor does)
- every change re-reads every page's text while the bar is open; over 400 pages the line cache clears in the middle of a search
- a scan read by OCR is remembered by page object, so a rotated or changed scan keeps its old reading; blank pages are sent to OCR
- no button to stop 「辨識掃描頁…」 (turning 掃描頁 off or closing the bar stops it; the page in flight finishes); stepping overwrites the progress label
- the find boxes swallow Ctrl+S / Ctrl+O / Ctrl+P; Ctrl+F and F3 do nothing in the replace box or other inputs
- with 全形＝半形 on, whole-word sees AB as a word inside ＡＢＣ (full-width letters count as CJK)
- the 搜尋 tab keeps the last list while the bar is closed (not refreshed after edits)
- Ctrl+F / F3 became reserved: an old custom binding on them stops working without a message
- a font fallback message can repeat once per line in a replace-all

## v1.0.38 (batch v1.0.49)

- 「9」 on a 5-page file says 頁面範圍的格式不對 (the page does not exist), and the red line shows as soon as 自訂 is chosen
- a second Ctrl+P while the printer list loads opens a second window over the first (the first promise is left waiting); no busy sign while a slow printer list loads
- a stalled spooler leaves the window on 「正在送到印表機…」 with 取消 and Esc doing nothing
- pages centred at fractional pixels are resampled (slightly soft) at 300 dpi
- an emptied 放大 % / 比例 box is saved as 0; values under the minimum are clamped without the box changing; 份數 over 999 shows the larger number but sends 999
- stored print settings are type-checked but not range-checked (a hand-edited settings file with quality 100000)
- 「第 K 張正面／背面」 shows only for booklets, not for other two-sided jobs
- a PDF opened from Explorer while the print window is open prints from the new document
- the exported settings file carries this computer's printer names (harmless on import)
- in a browser build both print buttons are off with no explanation

## v1.0.37 (batch v1.0.50)

- no message when an object is dropped on a locked layer's row (the spec names one; the drop is refused, the lock icon shows)
- the object menu's 移到圖層 still lists locked layers and works on a locked layer's objects (pre-existing)
- an unlayered object in a layered document at its top says 已經在最上層 although layered objects lie above it
- a signed document: dragging a row to where it already is asks the signature question, then nothing changes
- folded lists (LY_FOLD) are keyed by object id and shared between open documents (the virtual 圖層 1 folds in every tab)
- keepPlace may put the new object lower when null entries or a duplicate reference lie right under the old one
- using the panel's menu or drag on one object lets go of another object (or a group) selected on the page
- the open object lists are rebuilt in full on every change (slow with thousands of annotations)
- the plan's names differ from the code (LY_OBJ_SHUT, buttons only for movable objects) — both ruled

## v1.0.36 (batch v1.0.50)

- the spec still says a group drag snaps (code and HANDOFF say it does not)
- no picture of the objects while a group is dragged (only the outlines move)
- Esc during a group drag does not cancel it
- objects partly outside the page cannot be caught by the box (Shift+click works)
- an unselected object under a selected one's outline cannot be Shift-added
- an arrow-key nudge still pending is lost on Shift+click
- deleteMulti lets the group go before the change (also when it is declined)
- closing the last tab leaves the multi/objbar class on the bar until the next document
- the 對齊到 list keeps the focus when reopened without a change (Delete/Esc wait for a click elsewhere)
- test gaps — locked/hidden layers (only the hidden flag), ink and note popups in a group, vertical distribute, Shift+box, one-object box, the 2-object bar, tab switch

## v1.0.35 (batch v1.0.50)

- an indirect trailer /ID is not visited by reachableRefs (deleted, left dangling; harmless now that encrypted files are skipped)
- stacked pictures whose first is fully clipped: the replace area comes from it (zero size)
- performance on large documents (three full walks per delete/replace, imageKey re-hashes per draw)
- BI…EI end detection is heuristic (binary data with " EI " inside)
- purgeImages / cloneChain do not see resources shared with content the walker does not read (appearances, patterns, Type3)
- no re-entry guard on 刪除圖片／更換圖片…; the picked image's object URL is not revoked; a 32-bit hash decides "same picture" without a byte compare
- test gaps — copy-on-write for replace, ↻ direction sign

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
