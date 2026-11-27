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

## v4.5.0（物件的複製貼上，原本預定的 v1.0.56）留下的小問題
- 頁面右鍵選單與貼上提示裡的 Ctrl+V 說明仍以頁面為主，沒有提到物件。
- 滑鼠在頁面上時沒有「貼在原位置」的方式（只能把滑鼠移出頁面）。
- `clip.step++` 在 `mutate` 之前，貼上失敗也會累加；換頁後沒有歸零。
- `copyObjects` 沒有檢查來源是否為加密檔，也沒有忙碌狀態。
- 剪下時刪的是目前的選取，不是剛複製的那份清單（兩者通常相同）。
- `OBJ_CLIP.src.doc` 讓關掉的分頁物件留在記憶體裡。
- 選著文字時 Ctrl+C 與 Ctrl+X 的行為不一致。
- 連結物件選不到，所以 `destOut`／`destIn` 實際上用不到；連結被丟掉時留下的資料沒清。
- 測試覆蓋：多選含便利貼、跨檔的轉向頁、字型共用沒有專門的檢查。

## v4.6.0（插入的圖片做文字辨識）留下的小問題
- 辨識的是頁面上那一塊畫出來的樣子：蓋在圖片上的東西會一起讀；轉過角度的圖片用外框、斜的字辨識率較差。
- 測試不穩：`object-style-2.mjs` 的「runs of different sizes: a new colour keeps their sizes」在全部測試裡失敗一次（字級變成 14），單獨重跑兩次都通過。

## v4.7.0（右鍵編輯選單、圖片框選辨識、移動不閃）留下的小問題
- `OBJBAR_FOR` 可能被較早的 `paintObjBar` 呼叫設定（快速換選取時），右鍵選單偶爾只剩上下層級／複製／刪除；應改用世代計數。
- 編輯文字的右鍵選單：剪下／複製／貼上用 `document.execCommand`，貼上在 Electron 是否可用要在實機確認。
- 選單的字級框取得焦點時，反白的文字看起來像取消了（實際仍會套用）；可比照字型選單用 `CSS.highlights` 標示。
- 「第一次微調寫入後、畫面重畫前馬上再按方向鍵」的情況，現在只顯示外框（不取畫面），時間窗很短，測試不易穩定重現。
- 物件列（`#hint`）的 `--c:` 顏色已從 `tbObjStyle` 清理；其他讀自檔案、放進 HTML 的值還沒全面檢查。
- 測試不穩：`object-style-2.mjs` 的「runs of different sizes: a new colour keeps their sizes」偶爾在全部測試裡失敗一次，單獨重跑會過（v4.6.0 起）。

## v4.7.1（移動時的畫面、選單色塊）留下的小問題
- 轉過角度的物件拖曳時仍用舊做法（截圖＋淡白遮罩）。
- 剛開始拖曳、底下的畫面還沒畫好的那一瞬間，仍是舊做法（滑鼠先停在物件上就會提前準備好）。

## v4.8.0（物件群組、單數／雙數頁）留下的小問題
- 群組成員在隱藏或鎖定的圖層時，移動／刪除群組會留下它們，沒有提示。
- 群組裡的文字方塊要編輯時：先點選整組、再點一次選到它，之後還要再雙擊才進入編輯。
- 一頁的文件選「雙數頁」時會顯示第 1 頁（沒有雙數頁）。

## v4.8.1（留下的小問題第一批）留下的小問題
- 群組：點第一下選取群組時，上方工具列出現會把頁面往下推，直接雙擊第二下會點到別處（先點一下再雙擊就可以）。
- 只有一個成員看得到的群組，不會提示其他成員被隱藏；提示文字只說「圖層」，個別隱藏的物件也算在內。
- 複製／剪下頁面正在進行時再按一次，第二次直接略過，沒有提示。
- 清空的頁面文字先選字型再選字級，編輯框的行距仍用舊字級（送出時正確）。
- 測試：沒有群組隱藏成員提示、`OBJBAR_GEN` 的專門測試；剪下兩次的測試在舊程式上也會通過（重現不出來）。

## v4.8.2（留下的小問題第二批）留下的小問題
- 轉過角度的物件拖曳時，舊位置仍用淡白遮罩（沒有改成畫出底下的內容）。
- 清空的頁面文字先選字型再選字級，編輯框的行距仍用舊字級（送出時正確）。
- 一張 OS/2 v2 格式（標頭 16 位元組）的 BMP、或前 4 KB 內有 `<html` 的 SVG 會被當成不是圖片。

## v4.8.3（選取時頁面不跳動）留下的小問題
- 捲到最上面時，設定列出現無法往上補，頁面仍會往下移。

## v4.8.4（拖進來的圖片）留下的小問題
- 沒有副檔名、也沒有附帶 <img> 的圖片連結，仍會被當成 PDF 連結（下載後提示不是 PDF）。

## v4.8.5（留下的小問題第五批）仍保留
- 清空的頁面文字先選字型再選字級，編輯框的行距仍用舊字級（送出時正確）。
- 縮小「修改的文字」的框時，底下的原文可能露出來。
- 字級上限 400 不依頁面大小限制（刻意保留：使用者自己輸入的值）。

## v4.9.0（跨頁移動、選單貼上、設定列不閃）留下的小問題
- 單頁檢視或單／雙數頁過濾時，看不到的頁不能拖過去（沒有提示）。
- 有回覆（/IRT）的註解移到別頁時，回覆留在原頁。
- BAR_HOLD 的 4 秒保險：寫入超過 4 秒（大檔、簽章確認視窗開著）時設定列會先消失再出現。

## v4.10.0（分頁清單、完整檔名、Shift 等比例）留下的小問題
- 清單裡的檔名超過約 520 px 仍會截斷，滑鼠停留顯示的是路徑。
- 圖片與戳記要變形只能拉邊上的把手（不按 Shift）。

## v4.11.0（頁面符合圖片）留下的小問題
- 頁面外的內容只是不再顯示，仍留在檔案裡（要真的刪掉資料不能靠這個功能）。
- 擷取圖片工具先拉框調整範圍後，按鈕與提示仍說「圖片」，實際用的是框住的範圍。
- 頁面大小不變、只位置改變時，重畫前會短暫看到舊畫面。

## v4.12.0（開啟 Word 檔）留下的小問題
- 還沒在真的 Windows＋Word 上實測（PowerShell 的參數、各種會跳出詢問的檔案）。
- Word 檔裡的連結內容（例如網路上的範本、連結的圖片）開啟時仍可能被 Word 讀取；網路下載的檔案會先問。
- 追蹤修訂與註解不會轉進 PDF（只轉文件內容）。
- 從網路下載的判斷只看 Windows 的「來自網路」標記。
- 全部測試一起跑時，claude.mjs（pdf_replace／pdf_open 回報「正在忙」）和 font-identify-engine.mjs（FontId 還沒載入）偶爾會失敗，單獨重跑會通過。

## v4.12.1（Word 開檔方式修正）
- 新的開檔方式（以參數名稱呼叫 Word）仍需在使用者的 Windows＋Word 上確認；開啟 Word 檔與「轉存 Word（用 Word）」都要試。

## v4.13.0（背景畫頁面）留下的小問題
- 移動物件時的底圖、編輯後先畫的新頁、匯出、列印仍在視窗裡畫（大圖頁面拖動物件的第一下可能稍頓）。
- JPEG 內嵌的色彩描述檔（例如 Adobe RGB）不轉換（和 pdf.js 原本的做法一樣）；尚未用真的帶描述檔的照片比對。
- 實際速度要在使用者的電腦上確認（測試機為 Linux 無顯示卡環境）。

## v4.14.0（檔案資訊）留下的小問題
- 只列出前 60 頁的圖片；頁面內嵌的小圖（BI…EI）不列。
