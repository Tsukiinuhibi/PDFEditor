# PDF 工作台（PDFEditor）交接文件

這份文件寫給接手開發的人或 Claude，讓你不必翻過去的對話就能繼續做。最後更新：2026-11-13，最新發布版本是 **v1.0.33**。

---

## 1. 專案在哪裡

| 項目 | 位置 |
|---|---|
| 程式碼（主要） | Forgejo：`https://forgejo.taiyopen.com/tsukiinuhibi/PDFEditor`，分支 `main`。**推送到這裡** |
| 程式碼（打包用副本） | GitHub：`https://github.com/Tsukiinuhibi/PDFEditor`。Forgejo 的「推送鏡像」會把每個新 commit 同步過來；不要直接在這裡改 |
| 更新與安裝檔 | Forgejo Releases：`https://forgejo.taiyopen.com/tsukiinuhibi/PDFEditor/releases`（公開） |
| 打包 | GitHub Actions（`.github/workflows/release.yml`），在 GitHub 的 Windows 機器上打包，再上傳到 Forgejo |
| 使用者 | 繁體中文（台灣），Windows。介面文字、版本說明、回覆一律用繁體中文 |

開始工作：

```bash
git clone https://forgejo.taiyopen.com/tsukiinuhibi/PDFEditor.git
cd PDFEditor
npm install
npm start          # 開啟程式（開發模式不會檢查更新）
```

---

## 2. 技術架構

- **Electron 45**（`main.js` 主程序、`preload.js` 橋接），渲染端主要是**一個檔案**：`app/index.html`，約 9,000 行，裡面有 CSS 和一個 `<script type="module">`。另有 `app/fontid.js`（v1.0.28，一般 `<script>`，對外 `window.FontId`）：字型辨識的比對引擎與 Google Fonts 清單，只用 canvas 與數學、不碰文件。沒有打包工具，也沒有框架。
- 函式庫都直接從 `node_modules` 載入：
  - `pdfjs-dist` 4.10.38：顯示、文字擷取、抓頁面上的圖片。含 cMaps 和標準字型，有啟用 worker，`isEvalSupported:false`。
  - `pdf-lib` 1.17.1：所有寫入，用全域 `PDFLib`。
  - `@pdf-lib/fontkit` 1.1.1（全域 `fontkit`）：嵌入字型子集，以及檢查字型有沒有某個字、量字寬。
  - `app/fonts/NotoSansTC-Regular.ttf`、`NotoSansTC-Bold.ttf`：思源黑體（Noto Sans TC，OFL 授權，`OFL.txt`），由 Google Fonts 的可變字型用 fontTools `varLib.instancer --static --update-name-table` 產生 400／700 兩個字重。**每個字形都補齊到 4 位元組（`glyf.padding = 4`）**：fontkit 做子集時會用短格式 `loca`（位移 ÷2），字形長度是奇數的話，子集裡後面的字形會壞掉。換字型時一定要再做一次。
  - `app/fonts/blank.ttf`（「PDFE Blank」，616 bytes，`scripts/make-blank-font.py` 產生）：每個碼位都對到一個空字形。字型辨識畫字時字型清單寫成「候選字型, "PDFE Blank"」，候選字型沒有的字就畫成空白（量得到墨跡高度 0），不會被系統的替代字型冒充。
  - `node-forge` 1.4.3：數位簽章（PKCS#7 detached）。
  - `gifenc`：輸出 GIF。
  - `tesseract.js` 7（全域 `Tesseract`）＋ `tesseract.js-core`：文字辨識（OCR），只打包三個 LSTM 版的 `*-lstm.wasm.js`（其餘在 `build.files` 排除）。語言資料放在 `app/ocr/lang/`：`chi_tra`、`chi_tra_vert`、`eng` 的 best_int 版（取自 `@tesseract.js-data`，MIT）。
  - `electron-updater`：自動更新。
- `app://` 自訂協定（`protocol.handle` + `net.fetch`）提供 `app/` 和 `node_modules/` 的檔案，有 CSP。`contextIsolation`、`sandbox:true`，渲染端只能透過 `window.desktop`（程式中叫 `DESK`）呼叫主程序。
- **preload 提供的 API**：`ready, info, openDialog, readFile, writeFile, saveAs(name, bytes, {avoid}), pathForFile, openExternal, setTheme, capture`（滴管用的視窗截圖）、`exportImages{defaultDir, chooseDir, plan, write, openFolder}, onOpenPath, onAppCommand`（滑鼠側鍵）、`update{state, check, install, on}`。
- 主程序允許寫入的路徑有白名單（`allowedDirs`）。轉存圖片的資料夾會記在 `userData/export-dirs.json`。

### `app/index.html` 的段落（用 `/* ====` 開頭的註解分段，用標題搜尋就找得到）

| 段落 | 內容 |
|---|---|
| Loading | 分頁（tabs）、`loadDoc`、`mountDoc` |
| Layout / Rendering | 版面、`renderPage`（先在畫面外畫好再替換） |
| UI state / Input | 工具列狀態、滾輪、鍵盤、空白鍵拖曳、中鍵自動捲動 |
| View aids | 網格、輔助線、標尺、貼齊（`snapPoint`） |
| Editing (pdf-lib) | **`mutate`**：所有修改都經過這裡 |
| Export pages as images | 轉存圖片對話框、`renderForExport`、`settleEdits` |
| Inline rich-text boxes | 文字方塊編輯器 `openTextEditor` / `commitTextEditor`、插入圖片 |
| Edit the PDF's own text | 解析內容串流並移除原文字（`removePageText`）、文字選取 |
| Annotation tools | 便利貼、文字標記、圖形、畫筆／橡皮擦、戳記 |
| Colour picker | `openColorPicker`（色環、滴管、最愛、常用）、`eyedropper` |
| 填色 | `fillAt`（洪水填色）、矩形、套索、節點 |
| Select / move / resize | 選取工具 `selectAnnot`、`commitAnnotBox`、旋轉 `geomDrag` / `commitGeom` |
| Image crop / Digital signature / Sidebar | 擷取圖片、數位簽章、側邊欄（縮圖、圖片、註解、附件、圖層） |
| 圖層 | 圖層面板與操作（PDF OCG） |
| Custom key bindings / Desktop | 自訂按鍵、更新 UI |

---

## 3. 核心概念（改程式前一定要懂）

### 3.1 文件狀態與分頁
- 全域 `S` 是目前分頁的狀態。`DOC_KEYS` 列出的欄位會在切換分頁時存進或換出，例如 `bytes, pdf, pages, undo, redo, handle, activeLayer`。新增「每份文件各自一份」的欄位時，要加進 `DOC_KEYS` 和 `blankDoc()`。
- `S.version` 每次重新載入都會遞增（全域計數器 `VSEQ`），各種快取都用它當鍵值。
- `S.pages[i]`：`{page（pdf.js）, w, h（以 pt 為單位，已套用旋轉的「視覺」尺寸）, rot, vp1}`。

### 3.2 所有修改都走 `mutate(label, async doc => {...})`
1. 用 pdf-lib 載入 `S.bytes`。
2. 執行你的函式；回傳 `false` 代表取消。
3. 存檔，把舊的 bytes 推進 `S.undo`。
4. `loadDoc(..., keepView)` 用新的 bytes 重新顯示。
- **不會寫回原檔**（v1.0.13 起，使用者的明確要求）。存檔一律走 `saveAsNew()`，也就是另存新檔。主程序的 `file:save-as` 會拒絕覆蓋 `avoid` 清單裡的原檔。**不要加回自動存檔或覆蓋原檔的功能。**
- 修改前，`mutate` 會先把畫筆筆跡（`flushPen`）和開著的便利貼（`closeNote`）存好。

### 3.3 座標
- 「視覺座標」：以 pt 為單位，左上角是原點，已套用頁面旋轉。UI、`getAnns` 回傳的 `a.x/y/w/h` 都用這套。
- PDF 座標：寫入時用 `visToPdf(i, box)` → `{rect, rot}`，點的轉換用 `toPdfPts(i, pts)`；反方向用 `flatPts(i, arr)`。
- 外觀串流：用 `formAP(doc, ops, w, h, rot, res)` 或 `imageAP(doc, png, w, h, rot)`。BBox 用視覺尺寸，再加上旋轉矩陣。

### 3.4 註解慣例
- 程式自己建立的註解都有 `PDFE:true`。調整大小、旋轉、改顏色時，會根據樣式重新產生外觀（`readAnnStyle` + `geomBox/geomLine/geomPoly/geomInk`）。外來的註解只更新幾何資料，並刪掉 AP，讓閱讀器自己重畫。
- 新增註解一律用 `addAnnot(doc, i, dict)`，它會自動加上目前圖層的 `/OC`，並依圖層順序重排 `/Annots`。
- 文字方塊是 FreeText，外觀是 PNG 圖片（用 canvas 畫，支援中文）。`PDFE_RT` 存的是可再編輯的格式化文字（JSON），`RC` 是 XHTML，`Contents` 是純文字。
- 插入的圖片是 Stamp（`Subj` 為「圖片」）；填色區塊是 Stamp（`Contents` 為「填色區塊」）或 Square／Polygon（`Subj` 為「填色」）。
- 旋轉的矩形、橢圓、戳記、圖片（v1.0.18，`ROT_BOX`）：PDF 沒有這些註解的旋轉屬性，所以把不旋轉的外觀存在 `PDFE_Base`（它填滿 `PDFE_BaseRect`），`/AP` 是一個包住它、繞中心轉 `PDFE_Rot` 度（畫面上順時針）的 Form，`/Rect` 是轉完後的外框。一律用 `setTurn(doc, dict, base, baseRect, deg)` 寫入，0° 會還原成一般註解。選取時 `annRot` 讀出不旋轉的方框和角度：`AS.box` 是不旋轉的方框、`AS.rot` 是角度，選取框用 CSS 旋轉；`dragAnnot` 把指標轉回物件自己的座標來調整大小。改樣式或大小時先重畫不旋轉的外觀（`shapeGeom`），再用同一個角度 `setTurn`。
- `getAllAnns(i)` 會回傳所有註解。**`getAnns(i)` 會排除隱藏中、或位在隱藏／鎖定圖層的註解**，所有可以點選、編輯的地方都要用 `getAnns`。

### 3.5 圖層（v1.0.12）
- 每個圖層是一個 PDF OCG，存在 `/OCProperties`；顯示狀態寫在 `/D /ON /OFF`，鎖定狀態存在 OCG 的 `PDFE_Lock`。
- 上下順序就是 `/D /Order`，`restack(doc)` 會依這個順序重排每頁的 `/Annots`。
- 巢狀圖層（v1.0.19）：`/Order` 裡，圖層後面接的陣列是它的子圖層，開頭是文字的陣列是有名稱的群組。`readOrderTree` 讀成樹（圖層 `{ref, id, kids}`、群組 `{group, label, kids, id}`，群組 id 是位置，例如 `g:1`、`g:0.2`），`writeOrderTree` 寫回（空群組會消失）。`readLayers` 回傳展開後的清單（上層在前，子圖層緊接在父圖層下方）並附上 `depth`。新增、刪除、移動圖層一律改樹再寫回，不要再直接寫平的 `/Order`。顯示／隱藏、鎖定一個圖層時，它底下的子圖層一起變（`famOf`）；群組的眼睛和鎖套用到整組。刪除父圖層時子圖層補到它的位置。
- 沒有圖層的文件會顯示一個虛擬的「圖層 1」（id 是 `__v`），第一次操作時 `materialize()` 才真的建立。
- `layerModel()` 用 pdf-lib 解析，並依 `S.bytes` 快取；`docHasLayers()` 用 pdf.js 快速判斷有沒有圖層。

### 3.6 修改 PDF 原文（v1.0.13）
- `csTokens` 會把內容串流拆成 token，`locateTextOps` 追蹤 CTM、Tm、字型寬度，算出每個顯示文字的運算子在頁面上的位置。
- `removePageText` 會把選取範圍內的運算子換成**等寬的空白位移** `[-n] TJ`，所以後面的文字不會移動。如果字型寬度不可靠（例如 Type3、沒有 Widths），就改用 `/PDFE_Hide BMC 3 Tr … EMC` 把文字隱藏起來。
- 新的文字寫進頁面本身（v1.0.20，見 3.8）。字型沒有的字（emoji、罕用字）才退回舊做法：FreeText，`Subj` 為「修改的文字」，外觀是 PNG。
- 14 種標準字型用 `PDFLib.StandardFontEmbedder` 取得字寬。Form XObject 裡的文字無法移除，這時會改成加底色把原文蓋住。

### 3.7 不閃爍（v1.0.14）
- `mountDoc({prev})`：頁數相同時，新的頁面元素會先沿用舊的 canvas，等新畫面畫好才替換。
- 剛編輯完的東西會加上 `.hold` class，暫時留在畫面上，等頁面重畫完成時由 `renderPage` 移除。`holdSelection()` 和 `clearHolds(i)` 負責處理這件事；`mutate` 失敗時要記得呼叫 `clearHolds`。
- `busy()` 一開始只擋住輸入，超過 450ms 才會顯示遮罩。
- 頁數改變時（v1.0.17）：`matchPages` 用 pdf.js 的 `page.ref`（pdf-lib 存檔後頁面物件編號不變）找出每一頁在修改前是第幾頁，舊畫面跟著頁面走。新頁面和尺寸改變的頁面（例如旋轉）由 `prerenderNew` 先在畫面外畫好，縮圖也先用這張圖縮小顯示。

### 3.8 修改原文寫成真正的文字（v1.0.20）
- `writePageText(doc, i, x, y, lines, box)` 把編輯器的格式化文字寫進頁面內容串流，用 `doc.embedFont(…, {subset:true})` 嵌入 Noto Sans TC 子集（只含用到的字）。粗體用 Bold 字型，斜體是 `Tm` 傾斜 0.25，底線和文字底色是 `re f`。
- 每段文字是一個區塊：`/PDFE_Text /<名稱> BDC q … Q EMC`。名稱指向頁面 Resources `/Properties` 裡的字典：`PDFE_RT`（`{lines, box}` JSON，再次編輯用）、`PDFE_M`（版面座標：方框左上角、x 向右、y 向上 → 頁面座標的矩陣）、`PDFE_Size`、`PDFE_Fonts`（這段用到的 Font／ExtGState 資源名稱，刪掉區塊時一起清掉）。
- 加到內容串流最後面（`appendPageContent`）：如果原本內容在最外層改了繪圖狀態（cm、gs、Tr…），先用 `q … Q` 包起來，所以包一次之後就不會再包。區塊開頭用自己的 ExtGState 把透明度、混合模式重設。
- 版面（`layoutReal`）和編輯器完全一樣：同一個字型（編輯器加 class `real`，字型 `"PDFE Sans"` 來自 `app/fonts`，`font-kerning:none`）、行高 1.3、內距 4 pt，基線在 `realBaseline(fs)` = 1.086 × 字級。編輯原文時，編輯器的位置讓第一行基線對齊原本的基線。
- 文字模式：`pageTextItems` 會標出每段文字屬於第幾個區塊（`blk`，依頁面順序，和 `pdfeBlocksIn` 的順序一致）。點區塊 → `editOwnText`（帶著原本格式），送出時 `cutPageBlock` 整段拿掉再寫新的；框選時碰到的區塊整段算進來。
- 系統字型（v1.0.27）：每段 run 可以有 `font`（系統字型家族）。`realFontInfo(font, bold)` 給出要用的 fontkit 字型與位元組：空字串是內建思源黑體；系統字型由 `systemFontBytes`（`queryLocalFonts` 的一般／粗體字面；.ttc 用 `sfntFromCollection` 拆出單一字面；沒有粗體字面就 `synthetic`，寫入時 `2 Tr`＋0.03 em 描邊）取得。每個（字型、粗細）只嵌入一次：先用 `subsetIsSound` 把子集讀回來檢查，壞了或授權要求整個嵌入（`embed:'full'`）就整個嵌入。
- fontkit 子集化的短 `loca` 問題現在在程式裡修好了（`patchFontkitSubset` 把奇數長度的字形補一個位元組），系統字型不用預先處理；內建思源黑體照舊已補齊。
- 存檔前（`commitTextEditor`，編輯器還開著）：`resolveRealFonts` 把讀不到的字型換成思源黑體並 toast；`realTextCheck` 找出「指定字型沒有、思源黑體有」的字 → 跳「字型裡沒有這些字」，選「回去修改」編輯器維持開著，選「這些字改用思源黑體」就 `missingToDefault` 拆 run；連思源黑體都沒有的字照舊退回 FreeText 圖片做法。
- 版面：`layoutReal(lines, strut)` 的字寬用各字型 fontkit 的前進寬（PDF 就是這樣畫），行高與基線用 `fontBoxMeasurer`（canvas 量的 ascent／descent，和編輯器的 CSS 一樣）加上編輯器本身的字型（`realStrut`：思源黑體、最小字級）。直書 `layoutRealV` 用各字型的直書前進量，系統字型另外寫 `W2`（`verticalW2`：前進量、原點 x 取一半寬、原點 y 依 HarfBuzz：VORG 或 topSideBearing＋字形頂）。
- 打開原文時，一行裡的每一段（pdf.js 的每個 item，一段一個字型）各自用 `matchSystemFont` 把 PDF 的字型名（去掉 `ABCDEF+` 與 pdf-lib 的 `-1234`）對到已安裝、授權 `ok`、讀得到（直書還要有直書資料）的家族；對不到的那段用思源黑體（`joinRowPieces`、`mergeRuns`）。打開後沒改就按 Esc，不會跳缺字提醒（和 `edit.orig` 相同就不檢查）。
- 存檔前每個系統字型先試嵌入一次（`trialEmbedFonts`，在動文件之前）：失敗的改用思源黑體並 toast，打的字不會不見。授權（fsType）和「不能子集」從實際要嵌入的字型檔讀，不看目錄。可變字型（有 `fvar`）只能嵌入檔案的預設粗細：預設是一般粗細時，粗體用假粗體；預設不是一般粗細的，修改原文時灰掉（「可變字型，無法嵌入」）。
- 刪掉或重寫區塊時（`cutPageBlock`），沒有其他頁面在用的字型與 ExtGState 物件會整串刪掉（`dropObjectGraph`），重複修改不會讓檔案變大；假粗體和一般體共用同一份嵌入。
- `commitTextEditor` 選了「回去修改」時編輯器維持開著：換工具、換分頁、存檔、匯出圖片、打開別的編輯器都會停下來（`settleEdits` 回傳 false）。
- 字型選單在修改原文時也有：`fontBlockReason` 灰掉「授權不允許嵌入」（直書另外灰掉「沒有直書資料」）；`embed:'full'` 的字型選之前跳「整個字型會放進檔案」。
- 這種文字是頁面本身的一部分：不能用選取工具移動，不屬於圖層。
- 方向（v1.0.21）：`pageTextItems` 替每段文字算出它在畫面上的方向 `rot`（0／90／180／270，順時針）和是否直書 `vert`（直書字型，或 `findStackedText` 找到的「一字一行」的假直書），並換算到「閱讀座標」（把畫面轉回 `rot`）：`base` 是基線（直書是欄的中線），`a0..a1` 是沿閱讀方向的範圍，`u` 是 PDF 座標的範圍（給 `removePageText`）。`lineOf`／`groupLines` 都在閱讀座標裡分行（直書的欄從右到左）。
- 編輯器（`openTextEditor` 的 `rot`、`vert`）用 CSS 轉向；直書用 `writing-mode:vertical-rl; text-orientation:upright`，錨點是右上角（`translateX(-100%)`）。`writePageText` 用同一個方向寫回：直書用 `layoutRealV` 排版、字型加 `vert` 特性（直書標點）並在嵌入後把 Encoding 改成 `/Identity-V`（Noto 的直書原點 880、前進 1000，和 PDF 預設 `DW2 [880 -1000]` 一樣，所以和瀏覽器排出來的位置一致）。區塊的 `PDFE_RT` 會記 `vert`，方向從 `PDFE_M` 算回來。
- `locateTextOps`／`fontMetrics` 認得直書字型（`-V` 編碼、`W2`／`DW2`），`removePageText` 用每段的方向算範圍；只有 Identity 編碼的 CID 字型才當作寬度可靠。

### 3.9 文字辨識（v1.0.22）
- 工具 `ocr`：拖曳框選 → `readRegion(i, box)`。先用 `pdfTextIn`（從 `pageTextItems` 取框內的字，依閱讀方向分行，直書也可以）；框內沒有 PDF 文字才做影像辨識：`ocrImage` 以約 300 dpi 繪出範圍並加白邊，交給 Tesseract。
- 設定是實測挑的：橫書用 `eng+chi_tra`（英文放前面，中英混排最準），直書用 `chi_tra_vert`；版面模式一律 `3`（自動）——直書用 5、6 都會讀成亂碼。
- 每次辨識跑兩次（v1.0.24）：原圖、`denoiseCanvas`（灰階＋3×3 中值濾波，用排序網路，A4 約 0.3 秒）各一次，取 `confidence` 高的。在 11 張測試圖（5 種雜點、小字、低解析度、乾淨大字／小字）上平均 100%，只用原圖 91%、只用去雜點 99%（乾淨低解析度小字會變差，所以兩次都跑）。整頁兩次約 4 秒。`tidyOcr` 拿掉中文字之間的空格，並把中文之間的半形標點轉回全形。
- Worker 從 `app://` 網址載入（`workerBlobURL:false`），所以 wasm 不受頁面 CSP 限制；辨識引擎第一次用時才載入，之後重複使用（`OCR.worker`）。
- 結果視窗 `#ocrPanel`：可修改、「複製文字」、橫書／直書切換（會重新做影像辨識）、PDF 文字時可改用影像辨識；可以拖標題列移動；Esc（任何焦點）關閉但保留工具。

### 3.9.1 字型辨識（v1.0.28）
- 結果視窗多了「文字｜字型」頁籤（`FONTID.tab`，新視窗沿用上次的頁籤）。切到「字型」才比對（`fontIdStart`）；已經在「字型」頁時，框選新範圍就直接比對。
- **PDF 本身的文字**：`pdfFontsIn(i, box)`（和 `pdfTextIn` 共用 `pickTextIn` 取框內的字）依 pdf.js 字型代號分組，字型資料從 `page.commonObjs` 拿（`name`、`missingFile`、`isType3Font`）。名稱去掉子集前綴與 pdf-lib 的數字尾巴；含 0x80 以上位元組的名稱（Word 在中文 Windows 用 Big5／GBK 寫的）用 `decodeFontName` 依序試 UTF-8、Big5、GBK、Shift_JIS。對本機字型用 `matchSystemFont`，再比對字型清單的中文名稱（`plainFontName` 先去掉 Word 加的 `,Bold` 這類樣式，粗體和一般合成一列）；字型清單還在背景讀中文名稱時，讀完會自動再對一次；PDF 標準字型用 `STD_FONT_ALIAS` 找同款（Helvetica → Arial／Liberation Sans／Arimo…）；都沒有就 `googleByName` 對 Google 清單。`GlyphLessFont`（OCR 軟體的隱形文字層）不列出，直接改做影像比對。〔用字形比對找相似字型〕對同一框做影像比對。
- **掃描檔**：Tesseract 用 `blocks` 輸出取得每個字的框（`ocrPasses` 兩次辨識共用，`OCR.glyphs` 留下較好那次的圖與字框；PDF 文字的框要比對字形時另跑 `ocrGlyphsOnly`）。Tesseract 的字框只大概對：中文常偏窄、偏移（民 32 px 寬，實際 48 px），直書時字框是壞的（x0 = x1 = 0），但每個「詞」的框是對的，`ocrSymbols` 會改用詞框等分。所以 `FontId.glyphsFromImage` 不信單字框，而是**從墨跡切字**：每行（Tesseract 的行框）找出筆畫（8 連通），在兩字中點附近找沒有墨跡的縫切開；中文字最多 1.1 個行高寬，多出來的外側筆畫給隔壁字（氵 這類部首貼著前一個字）；同一位置讀兩次只算一次。每行各自決定墨色與紙色（行內中位數偏暗就先反相：深色底的白字）。能比對的字太少時，換另一個書寫方向再讀一次（多欄直書框成寬的範圍時，第一次會被當成橫書）。
- **比對**（`FontId.identify`，`app/fontid.js`）：每個字放進 48×48 格子；候選字型的同一個字畫成和掃描字一樣高（上限 64 px）、加一樣的模糊，再比形狀（chamfer 距離 `exp(-d/1.5)`）× √墨量比 × 寬高一致 × 字級一致（同一字型的字應該用同一個字級，x 高度比例不同的字型因此被拉開）。第一階段所有字型只比 6 個字（一般字重、不模糊），前 24 名再用全部的字、一般與粗體各比一次，模糊程度用第一名估計（σ 0～2.5）。第一階段前 24 名都比不像的字當成認錯，不算。缺字超過 30% 的字型不列。字形完全相同（48×48 二值化後雜湊相同）的字型合併成一列（文泉驛正黑／等寬正黑）。每約 12 ms 用 MessageChannel 讓出一次主執行緒（`scheduler.yield()` 會搶在畫面重繪之前，實測只剩 10 fps）。750 個候選約 1.1 秒。
- **Google Fonts**：`FontId.GOOGLE`（`app/fontid.js` 的 `GOOGLE_LIST`，170 個：37 個中日文、133 個英文，`Noto Sans TC` 不列——它就是內建思源黑體）。`scripts/check-google-fonts.mjs`（會連網）檢查每個名稱與「有沒有粗體」都和 Google 一致，改清單後跑一次。`loadGoogle` 一次問 10 個家族（CSS2 API 的 `text=` 只下載要比對的字，去重複、依碼位排序，不送原文），整批回 400 就逐一重試；每個家族用自己的別名 `PDFE GF n` 載入（避免和本機同名字型混淆），同一批的字型檔一起載入；每個請求逾時 8 秒、整次最多 12 秒（`deadline`）；第一批就沒回應（沒有網路）就不再問後面的批次；同一批字這次執行快取。畫面上先列出每一組的本機結果，再做 Google；連不上時說明。CSP 的 `connect-src` 因此加了 `https://fonts.googleapis.com`（字型檔走 `font-src`，原本就允許 `fonts.gstatic.com`）。「也比對 Google Fonts」可關掉（`pdfeditor.fontid.v1`）。
- **結果**：每組（中文、英數字各一組，兩種都夠字才分組）最多 8 列：樣字、名稱、來源（本機／內建／Google Fonts、粗體）、相似度、〔套用〕或〔下載〕。〔套用〕＝文字方塊預設字型（`applyIdentifiedFont`）；字型選單在「預設」之後多一區「字型辨識結果」（`FONTID.recent`，最近一次找到的本機字型，PDF 本身的字型排前面、100%），編輯時反白文字就能一下套用。〔下載〕開 Google Fonts 的字型頁（`openFontPage`），並提示裝好後要重開程式（Chromium 的字型清單在程式啟動時建立）。
- 每次比對有自己的編號（`FONTID.run`）：〔重新比對〕、新框選會讓舊的那次安靜停下，不會兩次結果混在一起。

### 3.9.2 更新後顯示更新內容（v1.0.29）
- 版本記錄 `app/CHANGELOG.md`：每版一段（`## PDF 工作台 vX.Y.Z`，最新在最上面），從 git 歷史補回了 v1.0.10 起的內容。`loadChangelog`（`fetch('CHANGELOG.md')`，讀不到回空陣列）、`parseChangelog`、`notesHTML`（只轉 `###`、`- ` 清單、段落、`**粗體**`、`` `code` ``，其他都先跳脫）。
- 啟動時 `checkWhatsNew(version, usedBefore)`：比對 localStorage `pdfeditor.seenversion.v1`（每次啟動都記下目前版本）。比記錄新 → 視窗「已更新到 vX.Y.Z」列出之後的每一版，〔全部版本記錄〕改列全部；沒有記錄但用過（`PROFILE_USED`：模組一開始 localStorage 就有 `pdfeditor.` 的鍵；或主程序說 Chromium 的 `Preferences` 檔在啟動前就存在）→ 這版和前一版；新安裝、裝回舊版、同一版 → 不跳。別的對話框開著（`#mask.show`）時每 0.5 秒再試。
- 設定 → 軟體更新：〔更新內容〕在設定視窗裡展開全部版本（程式一次只開一個對話框）。
- 下載好、還沒重新啟動時：主程序 `pointFeed` 記下 Forgejo 最新發佈（`latestRelease`），electron-updater 沒給更新內容（`latest.yml` 沒有）時用它的 `body`，提示列〔查看更新內容〕和設定頁才有內容。開發模式沒有自動更新，這段沒有自動測試。

### 3.9.3 便利貼：人員名單、換作者、右鍵、複製貼上（v1.0.30）
- 人員名單（設定 → 人員）：localStorage `pdfeditor.people.v1` `{names, def}`。`PEOPLE` 在模組讀取時載入（存的不是名字清單就是 `null`），`seedPeople(user)` 在啟動拿到電腦帳號（`DESK.info().user`，瀏覽器是「使用者」）時建立。預設的名字就是 `AUTHOR`：所有新註解的 `/T`。`addPerson`／`removePerson`（至少留一個，刪掉預設時第一個接手）／`setDefaultPerson`。
- 便利貼視窗：標題的名字是按鈕（`.nau`），`showNoteAuthorMenu()` 在 `#ctx` 列出名單（目前作者在最上面打勾，不在名單裡也列）＋「其他名字…」（`#nauOther`，輸入的名字加進名單）。選的名字放在 `NP.author`，關閉時和文字一起存（`updateNote(..., author)` 只在作者改了才寫 `/T`；新便利貼 `createNote(..., {author})`）。點在 `#ctx` 裡不會關掉便利貼。垃圾桶（`.ndel`）每張都有：新的就不要，存過的刪除。
- 右鍵：`pagesEl` 的 contextmenu 先用 `noteAt(i, x, y)` 找滑鼠下的便利貼（任何工具，圖示至少 20×20 pt），有就 `showNoteMenu`（〔編輯〕〔複製〕〔刪除〕，開著的便利貼先存），沒有就回到選取（見 3.9.4）；點在打開的便利貼裡不跳選單。
- 複製貼上：`copyNote(i, a)` → `NOTE_CLIP`（文字、作者、位置、視窗大小），文字也放進系統剪貼簿；`LAST_CLIP`（`'pages'`／`'note'`）記最後複製的是什麼，Ctrl+V 照它貼（〔貼上頁〕永遠貼頁面）。`pasteNote()`：`PTR`（最後的滑鼠位置）下面是頁面就貼在那裡，否則貼在目前頁、原位置右下 16 pt；作者不變，一次復原。選取工具選到便利貼時（焦點不在縮圖區）Ctrl+C 複製、Ctrl+X 剪下它（`cutNote`）；點縮圖會取消頁面上的選取（`thumbClick`），之後的 Ctrl+C／Ctrl+X 就是頁面。

### 3.9.4 右鍵回到選取（v1.0.31）
- `viewer` 的 contextmenu（頁面和頁面之間的灰色處）：點在打開的便利貼、選取框旁的工具列（`.abar`）、擷取圖片框的工具列（`.xbar`）上 → 什麼都不做；便利貼 → 便利貼選單；其他 → `backToSelect()`，點在物件上再 `selectAnnot(i, annAt(...))`（最上面的那個；便利貼與簽章欄位除外）。文件上不再有頁面選單：頁面選單只在縮圖的右鍵（`showPageMenu`）。
- `backToSelect()`：開著的便利貼先存，正在畫的多邊形／多邊形線條（點數夠）、填色節點（3 個以上）畫完，不夠就安靜放棄；之後和〔完成 (Esc)〕一樣 `setTool('select')`（已經是選取就取消選取）。
- 文件上按下右鍵時，關便利貼的 pointerdown 不再處理（儲存會擋住輸入，右鍵事件會被吃掉），改由上面的處理先存。手形工具只用左鍵拖曳畫面。文字方塊工具按右鍵不再新增文字方塊。

### 3.9.5 設定檔（v1.0.32）
- 設定 → 設定檔：〔匯出設定…〕`exportSettings()` 把 `settingsSnapshot()` 存成「PDF工作台-設定-YYYYMMDD.json」（桌面版走另存新檔，瀏覽器版下載）：`{app:'PDF 工作台', kind:'settings', version, exported, settings:{鍵: localStorage 原文}}`，收所有 `pdfeditor.` 開頭的鍵，`SETTINGS_SKIP`（字型清單快取 `fontcat.v2`、版本記錄 `seenversion.v1`）除外。新增的設定鍵自動包含；只屬於這台電腦的新鍵要加進 `SETTINGS_SKIP`。
- 〔匯入設定…〕`chooseSettingsFile()` → `importSettings(file)`：`parseSettingsFile` 不是本程式的設定檔或沒有可用項目就提示「這不是 PDF 工作台的設定檔」；有還沒另存的修改（`anyDirty()`）就先擋下、什麼都不寫（重新載入時若在「不儲存並關閉」按取消，設定會只套用一半）；否則先關掉設定視窗（一次只開一個視窗），確認「匯入設定」後寫入檔案裡的項目（其他的不動），`location.reload()`。匯出的另存對話框帶 `avoid`（開著的 PDF 與它另存的檔），不會蓋掉原檔。

### 3.9.6 選到物件時工具列換成它的編輯功能（v1.0.33）
- 選取工具選到本程式畫的物件（有 `PDFE`）：`selectAnnot`／`deselectAnnot` 呼叫 `paintObjBar()`，`#hint.objbar` 顯示「已選取：<名稱>」＋`styleBar(kind, readObjStyle(dict), true)`（`objKind(dict)` 依 Subtype／`BE`／`LE`／主旨對到工具：rect、ellipse、cloud、line、arrow、polygon、polyline、pen、hlText、underline、strike、fill；填色只有顏色與透明度）。其他軟體的物件沒有樣式列；文字方塊、戳記、圖片、「點選區塊」的填色見 3.9.7。
- 改樣式：`#hint` 的物件模式點擊／變更 → `restyleSelected(patch)`（排隊一個接一個，對著改的當下選的那個物件）→ `restyleAnnot`：一次 `mutate('已變更樣式')` 寫 `C`、`IC`、`BS`、`CA`、`LE`（封閉箭頭的 `IC`＝線條顏色；填色的顏色與填色一起改）後 `regenAP` 重畫，然後重新選取。工具預設（`STYLES`）不變。
- `regenAP(doc, i, dict, st, map, nb)`：Line／Square／Circle／Polygon／PolyLine／Ink 依幾何重畫（調整大小 `commitAnnotBox` 也用它，傳 `map`、`nb`）；旋轉過的矩形類用 `boxTurn` 的 `baseRect` 重畫再 `setTurn` 同角度；Highlight／Underline／StrikeOut 從 `QuadPoints` 用 `markupGeom` 重畫（`createTextMark` 也用它）。區域螢光筆（`addHighlight`）從這版起有 `PDFE` 與主旨「區域螢光筆」。

### 3.9.7 文字方塊、戳記、圖片、區塊填色的樣式列（v1.0.34）
- `objKind` 再認得：`FreeText` 有 `PDFE_RT` → `textbox`；`Stamp` 主旨「戳記」→ `stamp`（沒有 `PDFE` 的舊戳記也算）；`Stamp` 主旨「圖片」→ `image`；`Stamp` 主旨「填色」（點選區塊）→ `fill`。提示列由 `objBarHTML(kind, dict)` 產生；`restyleAnnot` 依種類分派到 `restyleTextBox`／`restyleStamp`／`refillStamp`。物件的變更都經過 `objChange(ob, fn)`（排隊、只對還在畫面上的那個物件、改完重新選取）。
- **文字方塊**：`textBarHTML(tbObjStyle(rt), true)`（第一段的值；粗斜底線要每段都有才算開），字型選單 `openFontMenu(anchor, at, {cur, onPick})`。`restyleTextBox` 把改的那一項套到 `PDFE_RT` 的每一段（`'toggle'` 依套用當下的內容反轉），strut 用 `{size:最小字級, font:'', bold:false}`（同重新開啟編輯時），`textBoxFields`（建立、修改原文、改樣式共用）寫回，左上角不動。
- **戳記**：`placeStamp` 從這版起存 `PDFE`、`PDFE_Stamp`（`{t, c, kind, who, custom?, when}`）。顏色：同設定換 `c`、用原本的 `when`／`who` 重畫（`drawStamp`）；〔更換戳記…〕：`openStampPicker({spec, pickOnly:true})` 回傳選到的（不改 `STAMP_SEL`），`replaceStamp` 中心不動、縮放比例＝舊框寬／舊戳記原寬（舊戳記沒有設定時為 1）、時間現在、作者目前使用者。舊戳記沒有顏色鈕。
- **圖片**：〔更換圖片…〕：`pickImage()`（`chooseImage` 也用它）→ `replaceImage`：新圖等比例放進舊框置中（`pictureAP`，插入也用它），`Contents`＝檔名。
- **透明度（戳記、圖片）**：`CA`＋`fadeAP`：外觀外面包一層 `q /GS0 gs /B Do Q`（`PDFE_Fade` 指向裡面的外觀，BBox＝`formFrame`），再改時先拆掉舊的一層，100% 就不包。旋轉過的用 `uprightAP`／`uprightBox`／`setUpright`（`setTurn` 同角度）。
- **區塊填色**：`refillStamp` 從外觀圖 `/Im0` 的 SMask 取回遮罩重新上色（不重新偵測區域）；只換顏色時每個像素保留原本的 alpha。`fillAt` 透明度不是 100% 時寫 `CA`（給提示列顯示）。

### 3.10 其他
- 工具列（v1.0.23）：同一類的動作用 `ACTION_MENUS`（加頁、旋轉、簽署）做成分段按鈕：按鈕本體執行上次用過的那一項（`LAST_ACT`，存 `pdfeditor.lastact.v1`），▾ 列出全部。顯示模式、頁面色彩、按鍵、軟體更新都在 `openSettings(tab)` 的設定視窗裡（`actions.themeMenu／keySettings／checkUpdate` 都導到對應的頁）；按鍵頁是 `keyEditor()`，修改後立即存檔。「只顯示圖示」存在 `pdfeditor.ribbon.v1`，加上 `#ribbon.icons-only`。工具列超出寬度時滾輪會左右捲動。新增工具列按鈕時，盡量放進現有的分段按鈕，不要讓工具列再變長。
- 檢視列（v1.0.25）：`#viewbar` 的項目不會被壓縮（`flex-shrink:0`）。`fitViewbar()`（ResizeObserver）在放不下時依序加上 `c1`～`c5`：拿掉「縮放」「檢視」小標籤、縮放按鈕只留圖示、檢視模式只留圖示（「封面單獨」→「封面」）、輔助工具與圖層只留圖示、縮小間距；還是放不下就用滾輪左右捲動（`wheelSideways`，和上方工具列共用）。按鈕文字包在 `<span class="vt">` 裡，新增按鈕時也要這樣包。
- 排列頁面（v1.0.25）：縮圖右鍵「展開所有頁面（拖曳排序）…」→ `openArrange()`。格狀顯示全部頁面，拖曳換位置（`ord[p]` = 新位置 p 上是原本第幾頁），標示「第 N 頁（原 M）」。套用時在 `mutate` 裡把所有頁從頁面樹移除再依新順序 `addPage` 回去，頁面物件編號不變，所以註解跟著走、畫面不閃，復原也正常。
- 工具：`setTool(t)`，搭配 `HINTS[t]`（上方提示列）。繪圖工具的設定在 `DRAW_TOOLS`、`STYLES`（存 localStorage）、`PRESETS`。新增工具時，這些都要補上，ribbon 也要加按鈕。
- 圖示：`ICONS` 物件（SVG path）。所有工具列按鈕都是彩色，滑鼠移上去會變黃色，這是使用者的明確要求。
- 顏色選擇一律用 `openColorPicker({anchor, value, none, title, onPick})`；對話框裡的按鈕用 `bindColorButton`。
- 字型（v1.0.26）：
  - `FONTCAT`／`loadFontCatalog()`：`queryLocalFonts()` 取得系統字型，每個家族挑一個代表字面，在背景一次讀一個字型檔（`fontkit.create(bytes)` 不帶名稱；.ttc 字型集再用 postscriptName、找不到就用家族名挑出那一個——帶名稱呼叫 `create` 只對字型集有效，一般 .ttf 會出錯），得到顯示名稱（每種語言先看 nameID 16 再看 nameID 1，`zh-TW` 優先）和是不是中文字型（「中文字體」四個字都有）。讀成功的結果快取在 `pdfeditor.fontcat.v1`，讀不了的不快取、下次再試；`queryLocalFonts` 失敗時，下次打開選單會再試。
  - 文字方塊的 run 可以有 `font`（CSS 家族名，空的就是預設）。預設字型堆疊是 `TB_FONT`，最前面是內建的 `PDFE Sans`（思源黑體），所以有沒有網路都一樣。編輯器裡的 span 用 `fontStack(f)`（指定字型後面接預設堆疊），這台電腦沒有那個字型時自動退回思源黑體，但字型名稱照樣保留。
  - 字型選單 `openFontMenu()`（`#fontMenu`）：搜尋框、預設／最近用過（`pdfeditor.fonts.recent.v1`，只列這台電腦有的）／中文字型／其他字型。名稱捲到看得到時才套用它自己的字型（一次套用幾百個字型很慢）。字型還在背景讀取時，打開的選單只更新「正在讀取字型…（N／M）」，清單不重畫（避免點到一半項目被換掉），讀完才重畫一次（滑鼠按著時延到放開）。
  - 重新打開舊的文字方塊時，預設的字型、粗體、斜體、底線不會套到方塊本身（只給新方塊），否則按 Esc 就會把舊方塊整個改掉。
  - 目錄 v2（`pdfeditor.fontcat.v2`）多記 `embed`（OS/2 fsType：`ok`／`full`／`no`）、`vert`（`vhea`＋`vmtx`＋GSUB `vert`）、`bytes`，以及每個家族的所有字面 `faces`（`FONT_FACES` 存 `queryLocalFonts` 的原物件）。測試用 `registerTestFont` 把字型位元組當成已安裝字型（`TEST_FONTS`）。
  - 格式列與 `currentTBStyle` 讀游標旁邊那段文字的樣式（`caretStyleNode`）：游標在元素之間時（例如剛打開編輯器、游標在最後）取前一段文字。
- localStorage 的鍵：`pdfeditor.bindings.v1, colors.v1, export.v1, fontcat.v2, fontid.v1, fonts.recent.v1, lastact.v1, seenversion.v1, lasttool.v1, pagecolor, people.v1, ribbon.v1, stamp.v1, styles.v1, textbox.v1, theme, view.v1`。
- 測試用的鉤子：`window.__pdfapp = {S, setTool, renderForExport, renderRegion, setTheme, setPageColor, actions, scrollToPage, makeSample, pageChars, getAnns, TBE, sel, …}`，端對端測試會用到，不要刪。

---

## 4. 發布流程

1. 改 `package.json` 的 `version`（`npm version X.Y.Z --no-git-tag-version` 會一起改 `package-lock.json`），然後把這版的更新內容（繁體中文，寫給使用者看，標題 `## PDF 工作台 vX.Y.Z`）**加在 `app/CHANGELOG.md` 最上面**，`RELEASE_NOTES.md` 整份換成同一段。程式更新後會顯示 `app/CHANGELOG.md` 的內容；`npm run check` 會檢查最上面一段是不是這個版本、和 `RELEASE_NOTES.md` 是不是一樣，不一致就失敗。
2. 提交並推送到 **Forgejo** 的 `main`。Forgejo 的推送鏡像會同步到 GitHub，GitHub Actions 就會開始打包。只有 `package.json` 或 workflow 檔有變動時，才會觸發打包。
3. `release.yml` 的流程：
   1. 讀出版本號，查 Forgejo 上這個版本有沒有 `latest.yml`。有的話就跳過。
   2. 執行 `electron-builder --win --publish never`。
   3. 用 Forgejo API 先建立**草稿**版本，再依序上傳 `.exe`、`.blockmap`，最後上傳 `latest.yml`，全部傳完才正式發布。
   4. 版本說明寫成 UTF-8 檔案再上傳。在 Windows 上用命令列參數傳中文會變成亂碼。
4. 需要 GitHub secret **`FORGEJO_TOKEN`**（Forgejo 權杖，repository 讀寫權限），使用者已經設定好了。
5. `PUBLISH_GITHUB: 'false'`。GitHub Releases 只用來發布交接版本 v1.0.16，往後不要再發到 GitHub。
6. 推送後可以用 `gh run list -R Tsukiinuhibi/PDFEditor` 追蹤（需要 `gh auth login`），或直接看 Forgejo 的 Releases 頁面，大約 4 分鐘完成。

### 程式碼同步（Forgejo ⇄ GitHub）
- **Forgejo → GitHub**：在 Forgejo 儲存庫的「設定 → 鏡像設定 → 推送鏡像」，設定成推送到 `https://github.com/Tsukiinuhibi/PDFEditor.git`，並勾選「推送 commit 時同步」。這要用一個 GitHub 權杖：classic 權杖要有 `repo` 和 `workflow` 權限；fine-grained 權杖要有這個儲存庫的 Contents 與 Workflows 讀寫權限。沒有 `workflow` 權限的話，改到 `.github/workflows/` 的 commit 會同步失敗。
- **GitHub → Forgejo**：`.github/workflows/sync-forgejo.yml`。萬一有 commit 先進了 GitHub，會自動補推到 Forgejo。它不會覆蓋只存在於 Forgejo 的 commit；兩邊分歧時會直接報錯，交給人工合併。
- 推送鏡像是強制覆蓋的，所以**不要直接推送到 GitHub**；一律推送到 Forgejo。

### 自動更新怎麼運作
- `package.json` 的 `updateServer: {host, repo}` → `main.js` 的 `pointFeed()` 會先呼叫 Forgejo API `/releases/latest` 取得最新版本號，再把 electron-updater 的來源指到 `{host}/{repo}/releases/download/{tag}`（generic provider）。
- 啟動 4 秒後檢查一次，之後每 4 小時檢查一次。安裝檔沒有程式碼簽章。
- Forgejo 伺服器前面有 openresty。之前上傳曾經出現 413（檔案太大），使用者已經放寬上限。安裝檔約 134 MB。

---

## 5. 測試

```bash
npm run check                         # 語法檢查（main.js、preload.js、app/fontid.js、index.html 的 module script）＋版本記錄與 RELEASE_NOTES.md 一致
npm run test:e2e                      # 執行 tests/e2e/ 下全部腳本
node tests/e2e/run.mjs layers         # 只跑檔名包含 layers 的腳本
```

- 端對端腳本會用 `playwright-core` 實際啟動 Electron，在 `tests/e2e/fixtures/sample.pdf` 的副本上操作。設定檔放在暫存資料夾（環境變數 `PDFE_USER_DATA`），**不會動到使用者已安裝程式的設定**。
- 在 Linux 沒有螢幕時，會自動改用 `xvfb-run` 執行；在 Windows 上會直接跳出視窗。
- Linux 沒有設定 `LANG` 時（C 語系），Chromium 認不得中文路徑：測試裡用 `setFiles` 選中文檔名的檔案會沒有反應。測試請用英文檔名，或用 `LANG=C.UTF-8` 執行（Windows 不受影響）。
- 腳本主要是**印出結果給人看**（例如註解清單、像素值），大部分不是自動斷言。`run.mjs` 只會標出當掉、逾時或印出錯誤的腳本。改完程式後，要看輸出內容合不合理。
- 寫測試常踩的坑：
  - 切換工具時上方提示列會出現，頁面會往下移，所以**要在切換工具之後才量頁面位置**。
  - 文件有未儲存的修改時，`app.close()` 會被「尚未儲存」對話框卡住，所以結束一律用 `app.evaluate(({app}) => app.exit(0))`。
  - 拖曳的處理函式要在 pointerdown 時**同步**註冊，不能先 `await` 再註冊；這個錯誤以前出現過。
- 每次發布前都要把全部測試跑一遍。使用者重視「發布前有測過」。

| 腳本 | 涵蓋內容 |
|---|---|
| textbox-basic / textbox-image-drop | 文字方塊、格式化、右鍵選單、拖入圖片 |
| textbox-font | 字型目錄（.ttc 的繁中名稱、中文／其他分組、快取）、只改反白的字、外觀用該字型、再次編輯保留、怪字型名稱、游標處換字型、預設字型、修改原文不記字型、字型選單（分組、搜尋、最近用過只列已安裝、Esc、缺字型提示、右鍵「字型…」）、600 個字型的開啟與搜尋速度、讀不到系統字型 |
| edit-page-text | 修改與刪除 PDF 原文、再次編輯 |
| whats-new | 版本記錄（讀取、排序、轉 HTML、跳脫、讀不到）；同一個使用者資料夾重開：新安裝不跳、從 1.0.26 更新列出之後每一版、知道了後不再跳、沒記錄但用過列兩版、全部版本記錄、裝回舊版不跳、別的視窗開著時等它關掉；設定的〔更新內容〕；`npm run check` 對版本記錄的檢查 |
| sticky-notes | 人員名單（新增、重複、空白、改預設、刪預設、至少一個、重開還在、壞掉的資料重建、名字含 `<>`）；新註解的作者＝預設；便利貼換作者（名單、其他名字、名單外的作者、復原）；刪除鈕；右鍵選單（選取與畫筆工具、編輯、開著的便利貼先存、刪除）；複製（系統剪貼簿、狀態列）；Ctrl+V 貼在滑鼠位置／頁角／目前頁；文字框裡 Ctrl+V 貼文字；選取後 Ctrl+C；貼到另一個檔案；最後複製的是頁面就貼頁面、〔貼上頁〕只貼頁面 |
| right-click | 選取工具右鍵空白處（沒有選單、取消選取）；每種工具右鍵空白處回到選取；文字方塊不再右鍵新增；打字中的文字方塊、新便利貼、畫筆、多邊形（3 點／1 點）、填色節點都先收好；文字辨識結果關閉；頁面之間的灰色處；縮圖仍有頁面選單；便利貼仍有便利貼選單；右鍵物件就選到它；右鍵選取工具列不變 |
| settings-file | 匯出（格式、版本、原樣的設定、不含字型快取與版本記錄、檔名、取消另存）；匯入（一般 JSON／壞檔／沒有可用項目都拒絕、只取可用項目、先確認、取消不變、匯入後重新載入並生效、檔案裡沒有的設定保留、版本記錄不動） |
| object-style | 其他軟體的物件沒有樣式列、文字方塊有自己的樣式列；選到矩形顯示它的顏色粗細；改粗細／顏色／填色／無填色／虛線／透明度、復原、工具預設不變、外框不跑、連改兩次、改完按 Delete；箭頭樣式、線條、多邊形、畫筆、節點填色、預設樣式；旋轉過的矩形改色角度不變；高亮文字、底線文字、區域螢光筆 |
| object-style-2 | 文字方塊（顯示的值、字級變大左上角不動、顏色、粗體開關與連按兩下、方塊背景、框線、字型、復原、工具預設不變、大小不一的兩段改顏色）；戳記（存設定、改顏色時間不變、透明度 50→70→100% 只包一層、更換戳記中心不動且工具戳記不變、旋轉後改色與換戳記角度不變、舊版戳記沒有顏色）；圖片（更換圖片在原框內置中不變形、透明度保留）；區塊填色（顏色、透明度、換色保留透明度，看畫面像素） |
| ocr | 文字辨識：PDF 文字一字不差、剪貼簿內容、乾淨掃描（橫書、直書）與低品質掃描的辨識率、強制影像辨識、Esc 關閉 |
| font-identify-engine | 字型辨識引擎（不連網）：空白字型與缺字判斷（含 Type 1 字型）、取字（信心度、標點、`ilI1|`、只留一次、偏好字母、太小、白紙、鄰字筆畫、鬆的字框、直書粗略字框）、比對排名（DejaVu Serif、Liberation Sans 粗體、文泉驛正黑與等寬版合併、內建思源黑體、超大字、沒有字型有這些字、stop）、本機與 Google 同字形合併、750 個候選的時間與畫面不卡、Google 載入（分批、`text=`、粗體字重、快取、錯名逐一重試、沒網路、逾時）、Google 清單 |
| font-identify | 「字型」頁（假的 Google 來源）：各種掃描（英文、粗體、中文、內建思源黑體、中英混排分組、直書、不是字）、Google 字型排第一與〔下載〕、關掉 Google、連不上 Google、比對中換框、長名稱不擋來源標籤；PDF 記錄的字型（已內嵌 DejaVu Serif、Big5 名稱、Helvetica 用同款代替、Google 名稱、沒有名稱、隱形文字層）、〔用字形比對找相似字型〕；〔套用〕、〔下載〕開的網址、字型選單「字型辨識結果」 |
| viewbar-narrow | 1500／1100／900 px 的檢視列沒有按鈕被壓扁或重疊、窄時只留圖示、900 px 不出現捲軸、只剩圖示的按鈕可用、更窄時滾輪捲動 |
| arrange-pages | 24 頁的格狀排列（多排）、拖曳後的「第 N 頁（原 M）」、跨排拖曳、還原原本順序、取消不改文件、套用後頁面順序與註解跟著頁面、縮圖重新編號、復原 |
| toolbar-settings | 工具列各區寬度、旋轉 ▾（記住上次）、加頁 ▾／簽署 ▾ 選單、小的復原／重做、設定視窗四頁（主題、頁面色彩、只顯示圖示、按鍵立即儲存、軟體更新）、狀態列版本號開啟更新頁、窄視窗用滾輪捲動工具列 |
| rotated-text | 轉 90°／180°、直書、假直書、旋轉頁面上的文字，原位編輯後方向不變、pdftotext 讀得到；編輯器與頁面上字的位置一致（`_rotated_fixture.mjs` 產生測試檔） |
| edit-page-text-fonts | 字型目錄 v2（授權、直書資料、大小、字面）、測試字型、.ttc／粗體字面／CFF 嵌入、奇數長度字形修正、修改原文用 DejaVu Serif（文字讀得到、粗體字面、字形完整、寬度一致、再次編輯、字型不累積、復原）、假粗體、一個區塊多種字型各嵌一次、刪掉的字型不嵌入、讀不到的字型、壞子集改整個嵌入、灰掉的字型與原因、整個嵌入提醒、缺字提醒（回去修改／改用思源黑體）、自動對應原文字型、直書系統字型（位置與 W2） |
| edit-page-text-real | 修改後是頁面文字（pdftotext 讀得到）、嵌入的字型子集每個字形都完整、編輯器與頁面寬度一致、帶格式再次編輯、粗體紅字、emoji 退回圖片、復原、框選跨區塊合併 |
| select-move / rotate-arrow | 選取、移動、旋轉、端點 |
| rotate-box | 矩形與圖片旋轉、沿旋轉後的方向調整大小、移動、填色、復原、旋轉頁面後角度不變 |
| fill-nodes | 填色（節點模式） |
| notes / multi-tab | 便利貼、多分頁 |
| layers / layers-drag-undo | 圖層所有操作、拖曳、復原 |
| layers-nested | 巢狀圖層：樹狀顯示、群組／父圖層顯示隱藏、拖進拖出群組、▲ 移出群組、在群組裡新增、改群組名稱、刪除父圖層、解散群組，每一步都檢查寫回的 /Order |
| no-flicker | 逐格檢查畫面，確認沒有空白頁或遮罩閃爍 |
| page-add-delete-flicker | 貼上、剪下、旋轉頁面與復原時逐格檢查畫面不空白，且每頁的畫面屬於正確的頁 |
| export-images | 轉存圖片包含新增的物件 |
| save-as-only | 原檔不被覆蓋、選到原檔會被擋下 |

---

## 6. 版本歷程（重點）

| 版本 | 內容 |
|---|---|
| ≤1.0.9 | 閱讀與編輯基礎、分頁、加頁減頁、插入 PDF、轉存圖片、簽章、便利貼、圖形、戳記、畫筆、選取移動、顯示模式、自訂按鍵、中鍵自動捲動 |
| 1.0.10 | 插入圖片；文字方塊改成點一下直接輸入，反白文字即可改格式 |
| 1.0.11 | 填色（點選區塊、矩形、套索、節點）；色環顏色選擇器、滴管、我的最愛、常用顏色 |
| 1.0.12 | 圖層系統 |
| 1.0.13 | 修改 PDF 原文；箭頭與線條旋轉、端點拖曳；一律另存新檔 |
| 1.0.14 | 修改時不閃爍 |
| 1.0.15 | 轉存圖片與擷取圖片會包含新增的物件 |
| 1.0.16 | 更新來源改為 Forgejo（交接版本） |
| 1.0.17 | 新增、刪除、旋轉頁面時不閃爍 |
| 1.0.18 | 矩形、橢圓、雲形、戳記、圖片可以旋轉 |
| 1.0.19 | 巢狀圖層：保留並顯示群組與子圖層，整組顯示／隱藏、鎖定，拖曳進出群組 |
| 1.0.20 | 修改原文時寫成真正的文字（內嵌 Noto Sans TC 子集），其他軟體可搜尋、複製 |
| 1.0.21 | 直書、轉向（90°／180°／270°）、旋轉頁面上的文字都能修改；逐字排成一欄的假直書也能辨識；新圖示（塗鴉鴨子＋手寫 PDF，`build/icon.png` 1024 px 透明背景） |
| 1.0.22 | 文字辨識工具（框選 → PDF 文字直接取出，掃描／圖片用離線 OCR → 可修改後複製）；工具列與歡迎畫面的標誌換成新圖示（`app/img/logo.png`） |
| 1.0.23 | 工具列精簡：顯示模式／按鍵設定／檢查更新合併成「設定」視窗；加頁 ▾、旋轉 ▾、簽署 ▾；復原／重做改小按鈕；「只顯示圖示」選項；滾輪左右捲動工具列 |
| 1.0.24 | 文字辨識加強：原圖與去雜點（3×3 中值濾波）各辨識一次，取信心度高的；雜點多的掃描從 46% 提升到 97% |
| 1.0.25 | 檢視列在窄視窗不再擠成一團（逐步只留圖示，最後才捲動）；縮圖右鍵「展開所有頁面（拖曳排序）」 |
| 1.0.26 | 文字方塊選字型：讀取系統字型（中文名稱、分組、搜尋、最近用過）；文字方塊預設改用內建思源黑體 |
| 1.0.27 | 修改原文也能選系統字型（子集嵌入、粗體字面或假粗體、直書）；授權禁止嵌入的灰掉、整個嵌入先提醒、缺字先提醒；原文字型已安裝就自動用它 |
| 1.0.28 | 字型辨識：文字辨識視窗多「字型」頁，PDF 文字列出檔案記錄的字型（100%），掃描檔逐字比對本機字型、內建思源黑體與 Google Fonts，列相似度 %；〔套用〕設為文字方塊預設字型、字型選單多「字型辨識結果」，〔下載〕開 Google Fonts 字型頁 |
| 1.0.29 | 更新後第一次開啟顯示「已更新到 vX.Y.Z」與這幾版的更新內容（`app/CHANGELOG.md`，〔全部版本記錄〕）；設定 → 軟體更新〔更新內容〕；下載好的新版在重新啟動前顯示發佈頁的內容；`npm run check` 檢查版本記錄與 `RELEASE_NOTES.md` 一致 |
| 1.0.30 | 便利貼：設定 → 人員（人員名單，預設名字＝所有新註解的作者）；便利貼標題點名字換作者（名單或其他名字）；明顯的刪除鈕；右鍵便利貼〔編輯〕〔複製〕〔刪除〕（任何工具）；複製後 Ctrl+V 貼在滑鼠位置（可跨檔案）；選到便利貼時 Ctrl+C／Ctrl+X；點縮圖取消頁面上的選取 |
| 1.0.31 | 右鍵回到選取：文件上不再有頁面選單（改在縮圖右鍵）；空白處右鍵在任何工具下回到選取（先存好文字方塊、便利貼、筆跡，完成多邊形／填色節點）；右鍵物件就選到它；文字方塊工具右鍵不再新增；手形只用左鍵拖曳 |
| 1.0.32 | 設定檔：設定 → 設定檔〔匯出設定…〕存成 `.json`（所有 `pdfeditor.` 設定，字型快取與版本記錄除外）、〔匯入設定…〕確認後寫回並重新載入；有未另存的修改時先擋下；匯出不會蓋掉開著的 PDF |
| 1.0.33 | 選到本程式畫的圖形類物件時，上方工具列顯示它的樣式（`#hint.objbar`），改了就套用到它（`restyleAnnot` → `regenAP`，一次復原）；圖形改粗時保留原本畫的形狀；文字標記、區域螢光筆（新畫的）也能改；文字方塊、戳記、圖片留到下一版 |

---

## 7. 已知限制與可以接著做的事

- 修改原文時，連思源黑體都沒有的字（emoji、罕用字）那一段仍是圖片，搜尋不到。
- 修改原文用系統字型：CJK 的 CFF（.otf）字型、有 VORG 的直書字型沒有實測過（測試環境沒有這類字型，只用 Inter 驗證過 CFF 的路徑）。
- 修改原文不支援斜放（不是 90° 倍數）或鏡像的文字。直書字型如果用的不是 Identity-V 編碼（例如 `ETen-B5-V`），寬度對不上，原文會改用隱藏的方式（3 Tr）拿掉。Form XObject 裡的文字只能用底色蓋住。
- 轉向或直書的文字裡如果有字型沒有的字（emoji 等），不能修改（橫書會退回圖片做法，轉向／直書沒有）。
- 文字方塊（FreeText）還不能旋轉。旋轉過的矩形、橢圓是靠外觀串流呈現，如果其他軟體重新產生外觀（例如在 Acrobat 裡改它的樣式），會變回不旋轉的樣子。
- pdf.js 解析文字方塊的 `RC` 時，會印出「XFA rich text」警告。不影響顯示，但 RC 的 XHTML 格式可以再調整。
- 還不能在程式裡「建立」新的圖層群組（只能使用 PDF 原本就有的群組，或把圖層拖進有子圖層的圖層裡）。
- 字型辨識：新安裝的字型要重開程式才讀得到。幾乎一樣的字型（Arial 與 Helvetica 系、新細明體與細明體）分數會非常接近，排序可能互換。Google 清單會過時（改名、下架的家族請求失敗會跳過，`scripts/check-google-fonts.mjs` 找得出來）。送到 Google 的是要比對的那幾個字（去重複、依碼位排序），不是原文。比對只用測試機上的字型與合成掃描驗證過，Windows 上幾百個字型的速度要實測；很緊的英文排版、離本字很遠的部首仍可能切錯（那個字會比不像而被排除）。
- 文字辨識：一次只用一種書寫方向；整頁混有直書時，直書部分要另外框選並切到「直書」。直書的辨識率比橫書低一些（測試範例 9 個字錯 1 個）。
- 安裝檔沒有程式碼簽章，Windows 會顯示 SmartScreen 警告。**使用者已決定不做程式碼簽章**（2026-11-12，看過 SignPath、Certum 開源憑證、Microsoft Store、商業 OV 憑證的比較後），不用再提。
- `app/index.html` 是單一大檔。如果要拆成多個模組，app:// 協定和 CSP 已經支援 ES module。

### 使用者排定的待辦（依順序，一版一項）

使用者會陸續加需求，用「→」區分下一版。每版先給預覽、同意才發佈。

使用者說「簡單的先提前做」：小修正和簡單的功能可以插隊先做（v1.0.25 就是檢視列修正＋排列頁面）。

0. **修正：從其他 PDF 插入頁面**：使用者的「承攬商施工前必備檢核資料.pdf」在插入對話框只讀到 1 頁、預覽全白（一般 PDF 正常）。懷疑是 PDF 包（Portfolio：`/Collection` ＋內嵌的 PDF）或 XFA 表單。已請使用者提供檔案或回報左側「附件」分頁內容，確認原因後再修。
1. ~~選到物件時工具列換成它的編輯功能~~：圖形類 v1.0.33、文字方塊／戳記／圖片／區塊填色 v1.0.34 已做（見 3.9.6、3.9.7）。
2. **→ 擷取圖片：點選圖片後可刪除或更換**：「擷取圖片」工具點選某張圖片後，除了擷取，還能刪除檔案中的這張圖片，或「更換圖片」換成另一張。
3. **→ 列印功能**（程式目前完全沒有列印）：使用者要求「非常完善的設定去配合印表機」，答覆如下——印到辦公室多功能事務機（A4／A3、雙面、紙匣、裝訂）、家用噴墨／雷射、也會印成 PDF（Microsoft Print to PDF）。要有：印表機、份數與自動分頁、頁面範圍、紙張、直橫向、縮放、彩色／黑白、是否印註解，加上雙面（長邊／短邊翻頁）、多頁印在一張（2／4／6／9／16）、手冊列印、大圖分割列印（海報）。介面選「程式內建列印視窗」：即時預覽每張紙、記住每台印表機上次的設定；紙匣、裝訂等驅動程式專屬設定一鍵轉到 Windows 列印對話框。Electron 可用 `webContents.getPrintersAsync()`、`webContents.print({deviceName, copies, collate, duplexMode, color, pageSize, landscape, margins, dpi, pageRanges, silent})`；版面（多頁合一、手冊、海報）由程式自己把頁面畫成紙張再送印。輪到時走完整設計流程（有不確定的細節使用者說可以問）。
4. **→ 尋找與取代**（程式目前沒有）：Ctrl+F 尋找列，全部符合處標示、顯示「第 N／M 筆」、Enter／Shift+Enter 上下筆；左側加「搜尋」分頁列出頁碼與前後文；選項：區分大小寫、全字相符、全形半形視為相同。使用者要「也搜尋掃描頁」：沒有文字的頁先用文字辨識讀一次（記住結果），掃描頁只能找、不能取代。取代：逐筆確認或全部取代，用修改原文的機制（`removePageText`＋`writePageText`），取代後是真正的文字、可復原；字型沿用 v1.0.27（修改原文選字型）的能力。兩個一起做，排在列印之後。
5. **→ 開啟檔案：可以直接從網頁開啟**（使用者 2026-11-13：「之後再新增開啟檔案的來源可以直接從網頁」）：輪到時先問清楚是哪一種——貼上網址下載後開啟、從瀏覽器把 PDF 連結或檔案拖進程式，還是在瀏覽器裡選「用 PDF 工作台開啟」。
6. **→ 連結工具**（使用者 2026-11-13：「之後再新增連結工具的功能／有不知道的再詢問我」）：在 PDF 上建立連結。輪到時先問：連到網址還是文件的某一頁（或兩者）、怎麼建立（框選範圍再設定目標？）、已有的連結要不要能編輯／刪除。
7. **→ Claude 增益集（排在最後）**：使用者想在 Claude 裡用自己的帳號下指令，由 Claude 用 PDF 工作台的功能修改 PDF。選了做法 A：Claude 桌面版擴充功能（`.mcpb`，MCP Bundle；Claude 桌面版內建 Node，使用者雙擊安裝或「設定 → 擴充功能 → 進階設定 → 安裝擴充功能…」）。PDF 工作台在設定裡開一個只限本機的連線埠＋配對碼，擴充功能（stdio MCP server）把工具呼叫轉給它；工具全部走 `mutate()`，可復原、不覆蓋原檔。第三方程式不能用 Claude 訂閱帳號登入（Anthropic 2026 年起禁止），所以「程式內建對話面板」（做法 B）只能用 API 金鑰，使用者暫時不要。做好後要給使用者一步一步的安裝說明。

---

## 8. 和使用者合作的方式

- 使用者用繁體中文溝通，訊息通常很短，例如「直接做」「再幫我新增…」。需求清楚就直接做，做完附上截圖說明。
- 每個功能完成後，都會**發布一個新版本**：改版本號、寫版本說明、推送、確認 Actions 成功，再附上下載連結。
- 介面上的按鈕要是彩色的，滑鼠移上去要變黃色；暗色模式也要看得清楚。
- **絕對不要覆蓋使用者的原檔**，一律另存新檔。
- Git 提交訊息用英文，結尾加上 Co-Authored-By 等標記。
