# PDF 工作台（PDFEditor）交接文件

這份文件寫給接手開發的人或 Claude，讓你不必翻過去的對話就能繼續做。最後更新：2026-11-14，最新發布版本是 **v1.0.49**。

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
- **重畫都照物件自己的框**：外觀的 `/Matrix` 是「畫的當時」的頁面方向，頁面之後再旋轉，物件會跟著頁面轉（側躺），所以重畫不能用目前的頁面方向。`ownFrame(doc, dict)` 取出那張圖（拆掉透明度層）的 BBox、`/Matrix`、沿它自己方向在頁面上的寬高與中心；換像素用 `samePicture`（框與方向完全不變），換成別張用 `ownPicture`（同方向、新大小、中心不動）。文字方塊例外：和雙擊編輯一樣，重新排版成目前畫面的正向。
- **戳記**：`placeStamp` 從這版起存 `PDFE`、`PDFE_Stamp`（`{t, c, kind, who, custom?, when}`）。顏色：同設定換 `c`、用原本的 `when`／`who` 重畫（`drawStamp` → `samePicture`）；〔更換戳記…〕：`openStampPicker({spec, pickOnly:true})` 回傳選到的（不改 `STAMP_SEL`），`replaceStamp` 中心與方向不動、縮放比例＝舊戳記沿自己方向的寬／它的原寬（舊戳記沒有設定時：和原本一樣高）、時間現在、作者目前使用者。舊戳記沒有顏色鈕。
- **圖片**：〔更換圖片…〕：`pickImage()`（`chooseImage` 也用它）→ `replaceImage`：新圖等比例放進舊圖自己的框裡置中（`ownPicture`，方向不變），`Contents`＝檔名。
- **透明度（戳記、圖片）**：`CA`＋`fadeAP`：外觀外面包一層 `q /GS0 gs /B Do Q`（`PDFE_Fade` 指向裡面的外觀，BBox＝`formFrame`），再改時先拆掉舊的一層，100% 就不包。旋轉過的用 `uprightAP`／`uprightBox`／`setUpright`（`setTurn` 同角度）。
- **區塊填色**：`refillStamp` 從外觀圖 `/Im0` 的 SMask 取回遮罩重新上色（不重新偵測區域；整塊都不透明時 pdf-lib 不寫 SMask，當作全部 255），用 `samePicture` 換上去；只換顏色時每個像素保留原本的 alpha。`fillAt` 透明度不是 100% 時寫 `CA`（給提示列顯示）。

### 3.9.8 擷取圖片：刪除、更換；另存時清掉用不到的資料（v1.0.35）
- **紅框**（`detectImages`）：框住圖片**看得到的部分**（跟著裁切路徑與表單的 BBox；pdf.js 的 `constructPath` 的 `minMax` 不含曲線，所以自己從路徑運算子算外框），另外記 `full`（整張圖、不裁切）。`nativeScale` 用 `full` 算像素密度。
- **對到內容**：`imageDrawsIn(doc, i)` 用 pdf-lib 走頁面內容與它畫的表單（`csTokens`：內嵌圖片 `BI…EI` 現在是自己的運算子 `{op:'BI', s, e}`），列出每個畫圖指令：所在的內容（`holder`：頁面或表單）、位元組範圍、圖片單位正方形到頁面的矩陣 `M`、裁切、`full`／`box`（畫面座標）、像素大小。紅框與指令用 `full` 對（四邊差 ≤ 1.5 pt）。`imageKey`：同一物件或內容相同的副本＝同一張圖。
- **刪除**（`deletePageImage`）：`findImageGroup` 找出點的那個紅框下的指令（疊在一起的都算）與全文件同一張圖的各處；多處先問〔只刪這一張〕〔全部 N 處都刪〕，看得到的範圍 ≥ 頁面 90% 先確認。指令換成空白（`editHolder`，頁面合併成一段串流）；「只這一張」而指令在被畫在多處的表單裡時，`cloneChain` 先複製表單再改。圖上看不見的文字（`removePageText(…, {invisibleOnly:true})`，繪製模式 3、7）一起刪；改過的頁面拿掉 `/Thumb`、`/PieceInfo`。`purgeImages`：沒有指令再畫的圖片，從走過的資源拿掉名稱，`reachableRefs` 確定沒人指到後才刪物件（含 `SMask`／`Mask`）。
- **更換**（`replacePageImage`）：`pickImage()` → `openReplaceDialog`（預覽、保持比例／填滿、〔↺〕〔↻〕、只這一張／全部 N 處）→ 指令換成 `q T cm /PDFE_Im<n> Do Q`。`replaceArea`／`replacePlacement`：新圖在畫面上是正的，舊圖刻意的斜角（不是 90° 倍數）保留，90° 轉向與翻轉不帶過去；`T = M_new · M⁻¹`，所以新圖仍在舊圖的裁切裡。疊在一起的只換第一張、其他刪掉。
- **另存時清理**：`saveAsNew(bytes, suffix, {clean = true})` 先 `pruneUnused`（從 trailer 的 `Root`、`Info`、`Encrypt` 標記找得到的物件，其他刪掉；沒東西可刪就原封不動）。照原樣存、不清的：加密的檔案（trailer 有 `/Encrypt`：pdf-lib 會把仍是密文的字串放進新的物件串流）、有數位簽章的（`hasSignature`：簽章欄位有 `/V`，或有 `/Perms`）、有 pdf-lib 讀不懂的物件的（`hasUnreadable`：`PDFInvalidObject`，它指到的東西看不到）；`S.signed` 時也不清。數位簽章在簽之前先清、簽好的不再動。`purgeImages` 在有讀不懂的物件時不刪任何物件。
- 表單物件沒有自己的 `/Resources`（用畫它那一層的）：`addXObject` 先複製一份當時有效的資源（指令記在 `draw.res`，表單鏈記在 `chain[k].pres`）再加名稱。
- v1.0.50 的修正：
  - 整個被裁掉的圖片：看得到的範圍是「沒有」，不是整頁（`boxMeet` 的 null 當參數是「沒有限制」、當結果是「沒有交集」，兩處都分開判斷）。以前它的紅框蓋住整頁，更換時新圖也放滿整頁。
  - 疊在同一個紅框下的圖片：新圖放在看得到最多的那張的範圍（`mainOf`），其他的拿掉。
  - 「同一張圖」：`imageKey`（32 位元雜湊）只用來縮小範圍，最後比對位元組（`sameImage`）。
  - 註解外觀、圖樣（pattern）、Type3 字型畫到的圖片與表單（`usedElsewhere`）：`purgeImages` 不拿掉它們的名稱與資料；`cloneChain` 遇到它們用到的表單先複製再改（「全部 N 處」也一樣：N 只算頁面內容畫的地方），頁面上的刪除或更換不會改到註解外觀。
  - 〔刪除圖片〕／〔更換圖片…〕進行中再按一次不會再做一次（`IMG_JOB`）；選的圖片的預覽（object URL）在更換對話框關掉後釋放。
  - `reachableRefs` 也走 trailer 的 /ID（有的檔案把它存成獨立物件，以前另存時會被清掉）。

### 3.9.9 多選與對齊（v1.0.36）
- **多選**（`MS = {i, items, els}`，只在同一頁、只有能移動的物件 `movableAnn`）：「選取」工具 Shift＋點物件 `toggleMulti`（Shift 按在選取物件的把手上仍是轉 15°／調整比例，不改選取）；在空白處拖曳 `startMarquee`：完全在框內的物件（`getAnns`，隱藏、鎖定圖層的不算）。`setMulti` 畫 `.asel.multi` 外框、`#hint.objbar.multi` 顯示 `multiBarHTML`。點空白、Esc、換工具、`mountDoc` 都清除。
- **一起移動／刪除**：`dragMulti` 拖其中一個，全部平移（不吸附參考線）；Delete／〔刪除〕`deleteMulti`。`commitAnnotBox` 的移動與調整大小抽成 `moveAnnotInDoc(doc, i, id, ob, nb)`，`moveObjects(i, moves, label)` 在一次 `mutate` 裡逐一呼叫，完成後重新選取同一批。
- **對齊**（`alignSelected(kind, to)`）：以 `getAnns` 的外框（旋轉過的是轉後外框）為準，對齊到整體外框或頁面（`ALIGN_TO`）；**平均分配**（`distributeSelected(axis)`，3 個以上）：依中心排序，頭尾不動，相鄰空隙相等。
- PDF 原本的文字與圖片不能移動，所以不能多選對齊（之後要做得先讓它們成為可移動的物件）。
- v1.0.50 的修正：
  - 群組拖曳中按 Esc：回到原位，仍然選取，不寫入（`dragMulti` 拖曳時在 window 的 capture 階段聽 keydown，不讓它再清掉選取）。
  - 框選：部分在頁面外的物件以頁面內的部分判斷（框本身只到頁緣）。
  - 有東西選取時在空白處框選：框從按下的那一點開始。放掉選取時頁面上方的列（`#hint`，物件列）會收起來，頁面跟著往上移它的高度（約 36 px），所以起點在放掉選取「之前」就先算好（`startMarquee(i, e, add, at)`）。頁面跟著列移動這件事本身照舊：試過用捲動補回去，但列出現時視窗最上面那一條會被擠出畫面（選取框上方的旋轉把手就看不到了）。
  - Shift＋點選取外框：加入或拿掉「一般點一下會選到的那個」（`pickUnder`：`elementsFromPoint` 找最上面的 `.annhit`，`HIT_ANN` 記著它的物件），所以選取外框裡面的物件也能加入。
  - 方向鍵微調還沒寫入時按 Shift＋點：先寫入（`flushNudge`），群組從物件現在的位置開始。
  - `deleteMulti`：刪除成功才放掉選取（有簽章的文件按〔取消〕時仍然選著）。
  - 關掉最後一個分頁：`showWelcome` 先放掉選取，物件列跟著收起來。
  - 「對齊到」選單打開又關掉、沒有改的時候焦點還在選單上：Delete、Esc 照樣作用在選取的物件上（keydown 先把焦點拿掉）。

### 3.9.10 物件的上下層級（v1.0.37）
- **順序就是每一頁 `/Annots` 的順序**：後面的蓋在上面（pdf.js 依序畫；感應區 `.annhit` 也依序疊，點到的是最上面那個）。有圖層時 `restack` 先依圖層排（未分層在最下面），同一個圖層裡維持先後。新物件加在最後（`addAnnot`）。
- `stackPlace(doc, i, id, how)`：只在同一頁、同一個圖層的物件之間移動（`how`：`front`／`forward`／`backward`／`back`，或 `{rel, above}`：放到另一個物件的上面或下面，並換到它的圖層）；便利貼的彈出視窗（`/Parent` 指向它）跟著走；別的物件的彈出視窗離它很遠時（有些程式把彈出視窗全放在最後），位置以那個物件本身為準，一步不會變長；連結、表單欄位等不算一層，相對位置不動；最後 `restack`。`stackObj(i, id, how, label)`：一次 `mutate`，選取保留；同時只做一個（`STACKING`：按住快速鍵或連點時，進行中的那次做完才接下一次）；已經在最上／最下：只提示、不產生復原步驟（先用 `layerModel` 判斷，已簽署的文件不會先跳出確認）；鎖定圖層：提示。
- 入口：選取物件旁小工具列的四個鈕（`Z_BTNS`，簽章欄位以外都有）、Ctrl+Shift+] ／ Ctrl+] ／ Ctrl+[ ／ Ctrl+Shift+[（看 `e.code`，已加進 `RESERVED`，打字時不作用）、圖層面板物件的右鍵選單、在面板裡拖曳物件列（只能放在同一頁的物件上；鎖定圖層的不能拖也不能放）。
- 圖層面板：物件清單預設展開（`LY_FOLD` 記住收合的），依頁分段（`.ly-pgh`「第 N 頁」），同一頁最上面的排第一；選到的物件反白（`markLayerSel`，由 `paintObjBar` 呼叫，多選時每個都反白）。物件換圖層（拖到圖層列、右鍵「移到圖層」、選取列的圖層選單）會放在那個圖層該頁的最上面；「把未分層的物件放進目前圖層」維持原本的相對位置（`moveObjToLayer(..., {front:false})`）。
- 把物件拿掉再加回去的修改用 `keepPlace(doc, i, oldRef, fn)`：換色重填（填色工具點在原本的填色上）、橡皮擦擦掉筆跡的一部分，新物件放回舊物件的位置與圖層，不會跑到最上面或目前圖層。之後新增這類修改也要用它。

- v1.0.50 的修正：
  - 鎖定的圖層（`PDFE_Lock`）：物件拖到它那一列（或它的物件上）會提示「這個圖層已鎖定」；物件選單的「移到圖層」不列鎖定的圖層，鎖定圖層上的物件不能移動或調整前後（`moveObjToLayer` 也擋）。注意：別的程式用 /D /Locked 鎖的圖層，這個程式不當成鎖定。
  - 沒有圖層的物件在有圖層的文件裡已經在最上（下）面：提示「已經是不屬於任何圖層的物件裡最上面的」。
  - 拖到原本的位置：先在副本上試（`stackPlace` 不是 'moved' 就不做），有簽章的文件不會白問。
  - 調整前後之後，頁面上原本選取的物件（不一定是被移動的那個）保持選取。
  - 收合的清單依文件分開記（`lyFold()`，WeakMap）。
  - `keepPlace` 依原本的順序找位置，/Annots 裡的 null 或重複的參照不會把新的物件往下拉。

### 3.9.11 列印（v1.0.38）
- 入口：Ctrl+P（已加進 `RESERVED`）、工具列「檔案」的分段按鈕「輸出」（`ACTION_MENUS.output`：列印、轉存圖片；原本的〔轉存圖片〕按鈕併進來）。
- **排版是純計算** `printPlan(st)` → `{paper:{w, h}, sides:[{items:[{i（null＝空白頁）, x, y, w, h, rot, clip?, border?}], label, poster?}], duplex, sheets}`（點為單位，紙的左上角為原點）：
  - 一般：每面一頁，方向和紙不同時轉 90°（`fitIn`），縮放 `fit`／`shrink`／`actual`／`custom`，置中；邊界 0／5／10 mm。
  - 多頁合一：`NUP_GRID`（2、4、6、9、16），順序 `h`／`hr`／`v`／`vr`，框線；方向「自動」＝第一頁放得比較大的那個（格子裡的頁不轉向）。
  - 手冊：補成 4 的倍數，第 t 張正面＝[N−1−2t, 2t]、背面＝[2t+1, N−2−2t]（右翻左右對調），紙橫放；雙面時固定短邊翻頁（`duplex` 選單停用），也可以只印正面或只印背面。
  - 海報：放大 %、重疊 mm、方向自動＝第一頁需要的張數少的那個，海報置中在所有紙上；每張的 `clip` 是紙上能印的範圍；超出不到 1 mm 不多用一排紙（595 × 842 的「A4」頁）；裁切記號與標籤畫在邊界裡。
  - 反向列印把面倒過來（手冊雙面時以整張為單位）。
- `drawSide(plan, side, k, st)`：白底，每個項目只畫紙上（`clip` 裡）看得到的那一塊（`printPiece`：pdf.js `render`，`intent:'print'`、列印用的選擇性內容設定，所以隱藏的圖層與標成不列印的註解不會印；「只有文件」不畫註解與表單）；黑白時轉灰階。預覽（`previewPrint`，快取 `PR_CACHE`）和列印用同一套。
- **送印** `runPrint({dialog})`：每一面畫成 品質/72 倍的 JPEG，放進 `#printRoot`（body 最後一個子元素；`@media print` 時只顯示它，`@page` 設成紙張大小、邊界 0），主程式 `print:run` 用 `webContents.print`（`silent:true`；〔印表機內容…〕是 `silent:false` 的系統列印對話框，給紙匣、裝訂等驅動程式設定），帶 `deviceName`、`copies`、`collate`、`duplexMode`、`color`、`landscape`、`pageSize`（微米）。準備中可以按〔取消〕；Esc 和點遮罩在準備時無效（`S.exporting`）。印完 `#printRoot` 清空。
- 印表機清單（`print:printers`）第一項是「系統預設印表機」（不帶 `deviceName`；Electron 的 PrinterInfo 沒有「預設」欄位）。設定依印表機存在 `pdfeditor.print.v1`（`{last, by:{印表機: PRINT_DEF 的項目}}`；範圍、份數、奇偶、反向每次重來）。
- 沒有印表機（清單是空的或讀不到）：印表機選單下有提示、〔列印〕停用，〔印表機內容…〕還能用。超過 100 張紙（張數 × 份數）時，第一次按〔列印〕只把按鈕改成「確定印 N 張」，再按一次才開始。換到沒用過的印表機時畫面上的設定不變，用過的才帶入它的設定。共用的 `parseRange` 把「1 - 3」當成一個範圍，只有一個「-」算格式錯。
- 列印視窗的 `@page` 與每一面用公釐（紙張本身的大小），每一面比紙短 0.3 mm，避免多出空白頁；每一面的圖只載入不先解碼（大文件不一次佔用全部記憶體）。
- **還沒在真的印表機上試過**（開發環境沒有印表機，測試用 `printToPDF` 代替）：要在 Windows 上用 Microsoft Print to PDF 和一台實體印表機各印一次 A4 直式、手冊、每面 2 頁、雙面，看張數、方向、縮放對不對。
- 測試接口：主程式的 `global.__pdfePrinters`（印表機清單）、`global.__pdfePrintHook(wc, opts, cb)`（送印）；`print.mjs` 用 `printToPDF({preferCSSPageSize:true})` 檢查印出的張數與紙張大小。`__pdfapp.printState()`、`printPlanNow()`、`printPlan(st)`、`parseRange`。
- v1.0.49 的修正：
  - 頁碼：超出範圍說「頁碼要在 1～N 之間」，剛選「自訂」還沒輸入時不顯示紅字。
  - 數字欄位：`printNum` 在 change 時把空白、太小、太大改成實際使用的值並顯示在欄位上（份數 1～999、比例 1～1000、放大 10～1000、重疊 0～50）。讀回存著的設定時也一樣，選項只收視窗有的值（品質 150／300、邊界 0／5／10、多頁合一 2／4／6／9／16）。
  - 頁面畫在紙上的位置取整數像素，不重新取樣。
  - 一般與多頁合一的雙面列印，每一面標「第 K 張正面／背面」。
  - `PRINTOPEN`：尋找印表機時顯示忙碌，再按 Ctrl+P 不會開第二個視窗；印表機清單 8 秒還沒來就照「找不到印表機」開視窗。`printWindow` 的 `finally` 一定把 `PR` 放掉。
  - 印表機一直沒回應：〔取消〕和 Esc 結束等待（`job.wake`），並提示已送出的頁面可能仍會印出。列印中（準備或送出）按 Esc 都等於〔取消〕。
  - 列印視窗開著時，從檔案總管開啟的 PDF 等視窗關掉才開（`openFile` 等 `PR`，並提示「關閉列印視窗後會開啟…」；畫面上已經沒有視窗時不再等），列印的仍是原本的文件。
  - 存著的設定裡視窗沒有的選項（例如雙面 `zzz`）改回預設（`printChoices` 從表單讀出每個選單的值）。
  - 瀏覽器版的列印按鈕用 `title` 說明為什麼不能用。

### 3.9.12 尋找與取代（v1.0.39）
- 入口：Ctrl+F（打字中不搶；已加進 `RESERVED`，連同 F3、Shift+F3）。尋找列 `#findBar` 浮在 `#vwrap` 右上角；Enter／Shift+Enter、F3、〔▲〕〔▼〕上下筆，Esc 關閉（輸入框裡的按鍵不會觸發程式的快速鍵）。選項 `FIND.opts`（`case`、`word`、`width`、`scans`）存在 `pdfeditor.find.v1`。
- **一頁的行** `findLines(i)`：`pageTextItems` → `lineOf` → `joinRowPieces`，和「修改原文」編輯的行一樣；每段（`at`）記得它的字在行文字裡的位置。不跨行比對。比對用 `normFind`（全形英數→半形、小寫；長度不變，所以位置對得上），全字相符用 `wordCh`（中文字不算字元邊界）。標示框 `pieceBox`：依字在 sans-serif 裡的寬度比例（`textFrac`）放在那段文字的框裡，依閱讀方向（直書、轉向）。
- `searchDoc()`：先找有文字的頁，再（勾「掃描頁」時）逐頁辨識沒有文字的頁（`ocrLines`：整頁 `ocrImage`＋`ocrWorker('eng+chi_tra')`＋`ocrSymbols`，每個字有自己的框；依文件與頁面物件記住，修改別處不用重讀）。每次修改、換分頁（`mountDoc`）後重找；目前那筆盡量維持，否則從目前頁往後第一筆。標示畫在每頁的 `.ovl`（`paintFindPage`，`ensureOverlay` 也會畫）。
- 「搜尋」分頁（`#p-find`，`buildFindPanel`）：依頁列出每一筆與它的那一行，點一下就是目前那筆。
- **取代**（`replaceHits(list, repl)`）：依行分組（本程式的文字區塊以整塊分組），原本的文字整行照修改原文重寫（`pageTextEdit` 是從 `editPageText` 抽出的「行→runs、U、錨點、顏色」，`commitPageTextEdit` 拆成 `preparePageText`（字型、檢查，在 `mutate` 外）與 `applyPageText`（拿掉、寫回，在 `mutate` 裡）），本程式的區塊改 `rt.lines` 後整塊重寫（格式保留）；符合處用 `placesIn` 對到 runs 的位置（文字不同時依第幾個符合處對），`replaceInLine` 從後面往前換，新字用符合處開頭那段的樣式。全部在一次 `mutate` 裡，一個復原步驟；掃描頁的跳過並提示。〔取代〕後到取代後文字之後的下一筆（`FIND.after`：同一條基線上 `s` 之後，否則下一行；取代的字裡又有要找的字也會往下走）；Enter 取代時焦點留在取代框，按按鈕時焦點在按鈕上（Ctrl+Z 復原的是文件；在輸入框裡 Ctrl+Z 是輸入框自己的復原）。
- 結果只屬於找到它們的那一版文件：`mountDoc`（每次修改、換分頁）一進來就清掉結果與標示（記住目前那筆的位置 `FIND.keep`）再重找；`showWelcome` 關掉尋找列。取代只在 `FIND.done === findKey()`（這一版已找完）時做，同時只做一個（`REPLACING`）。
- 取代前用 `pageSample(i)` 取得那一頁的畫面（畫面外的頁先畫一張），讀顏色、讓 pdf.js 載入字型（`commonObjs` 要畫過才有），所以畫面外的頁換完仍是原本的顏色與粗斜體。
- 本程式的區塊裡有一樣的兩行：先看行的位置（略過空行），再找還沒用過、文字相同的行。
- 掃描檔上看不見的文字層（render mode 3／7，`textRunsOf`＋`runBox`／`boxShare`，`removePageText` 也改用這兩個）：找得到、標「辨識」，不取代。
- 掃描頁的辨識用自己的 Tesseract worker（`findWorker`，關掉尋找列時結束），和「文字辨識」工具互不干擾。
- v1.0.49 的修正：
  - 取代：`mutate` 的函式可以回傳 `{label}`，復原步驟用真正改了的處數。改不了的（例如在表單物件裡、整行變空而拿不掉的字）不算，並說是第幾頁幾處；一處都沒改就不留復原步驟。
  - 按鍵：尋找框與取代框不攔 Ctrl+S／O／P（`progKey`），有視窗開著時不處理按鍵；取代框裡 F3、Shift+F3、Ctrl+F 照常有用；其他輸入框（不是文字方塊、便利貼）裡按 Ctrl+F、F3 也有用。
  - 全形＝半形＋全字相符：全形英數字算字母（`wordCh`）。
  - 尋找列關掉時，「搜尋」分頁顯示怎麼搜尋，不留舊清單。
  - 同一個提示同時只顯示一次（`toast`：新的取代舊的，時間重新算）。
  - 從尋找框開出的視窗（例如 Ctrl+P）拿走焦點，打字不會進到底下的尋找框（`openModal`）。
  - `replaceNow(…, {report})` 回報真正改了的頁與改不了的處數，Claude 的 `pdf_replace` 只列改了的頁並說哪一頁有幾處無法取代；`applyPageText(…, {quiet})` 讓呼叫的地方自己說明。
  - 掃描頁辨識：
    - 快取鍵含旋轉與大小，轉過的頁會重新辨識。
    - 空白頁不送辨識（`blankImage`）。
    - 辨識中的進度留在標籤上（`FIND.scanNote`），〔停止辨識〕（`data-fa="stopocr"`，按下後顯示「停止中…」）做完手上那一頁就停，標籤說「還有 N 頁掃描頁沒辨識」。停止後，同一個搜尋（修改文件後重新搜尋也算）只用已經辨識好的頁，改了搜尋的字或選項才再辨識（`FIND.ocrStopped`、`ocrLines(i, {cachedOnly})`）。
    - 空白頁的判斷用四分之一大小、高品質縮小的圖，只有一個小頁碼的掃描頁也會辨識。
    - 快取只看頁面、旋轉與大小：掃描頁上加了註解或換了圖片，要重新開啟文件才會重新辨識。
  - 行快取：上限是頁數的兩倍（至少 400），超過時先丟舊版本的，長文件搜尋到一半不會整個清掉。

### 3.9.13 從網址開啟（v1.0.40）
- 入口：工具列「開啟」是分段按鈕 `ACTION_MENUS.openm`（〔開啟檔案…〕〔從網址開啟…〕；`FIXED_MENUS`：按鈕本體永遠是開啟檔案，不記上次用的）、Ctrl+Shift+O（`RESERVED`）、歡迎畫面的〔從網址開啟〕、把瀏覽器裡的連結（`text/uri-list`，沒有檔案時）拖進視窗。
- `openUrlDialog(url?, {auto})`：輸入框（剪貼簿裡是 http／https 網址就先填好，經主程式 `app:clipboard-text` 讀；主程式只把網址交給畫面，別的文字一律回空字串）、進度（`url:progress`）、〔取消〕停止下載；關掉視窗（Esc、點遮罩）也會停（`alive`，之後不會開出分頁），而且立刻清掉 `URLJOB`：馬上再開的視窗不用等舊的下載收尾（舊的下載結束時只清自己的 `URLJOB`）。成功就在忙碌提示下 `openInNewTab(bytes, name, null)`（沒有原檔，存檔時選位置；要密碼的 PDF 說要密碼）。錯誤訊息 `urlWhy` 都是中文：401／403 說要先在瀏覽器登入並下載、404 說找不到、網路錯誤依 `ERR_…` 代碼對照（找不到網站、沒有網路、網路剛改變、被系統管理員或防火牆擋住、憑證、Proxy、轉址太多、連不上；其他是「下載失敗（代碼：…）」），不顯示 Chromium 的原文（裡面可能有網址）。進度 `urlProgressText`：壓縮傳送時（收到的比 Content-Length 多）只顯示已收到的量。
- 主程式 `url:fetch(id, url)`：`net.fetch`（Chromium 網路：轉址、Proxy、憑證），只收 http／https（轉址後的網址也要是），網址裡有帳號密碼就不下載（`why:'creds'`），上限 500 MB，60 秒沒有資料就停，開頭 1 KB 要有 `%PDF`。提早結束（狀態不是 2xx、太大）時 `ctl.abort` 立刻關掉連線。知道大小又沒有壓縮時，預先配置一塊記憶體邊收邊放，不再最後合併一次。錯誤只回 `ERR_…` 代碼（`code`）。檔名 `urlFileName`：`filename*=UTF-8''…`、`filename="…"`（`headerName`：Chromium 給的是 UTF-8 位元組、一個字元一個位元組，轉回 UTF-8；不是 UTF-8 的位元組（Latin-1、Big5 的檔名）在路上已經變成 U+FFFD、原本的位元組拿不回來，這種名稱當作沒有；`%E4…` 與 RFC 2047 的 `=?UTF-8?B?…?=`／`Q` 照瀏覽器的方式解開）、否則網址最後一段；清理後是空的（例如 `...`）或只剩 `.pdf` 也當作沒有。一律 `.pdf`、`safeName`。`url:cancel(id)` 中止。
- 一次只會有一個「從網址開啟」：`URLOPEN`（視窗開著或正在開）或已有其他視窗開著（`#mask` 有 `show`，例如列印、設定、匯出）時，拖進來的連結不處理，提示「請先關掉目前的視窗，再拖入連結」；再按一次 Ctrl+Shift+O 也不會開第二個（`openUrlDialog` 包住 `urlDialog`）。Ctrl+Shift+O 是 v1.0.40 才保留的快捷鍵：以前自訂在這個鍵上的動作，啟動時會被取消並提示一次（`isReserved`）。
- 測試 `open-url.mjs` 在測試裡開本機 HTTP 伺服器（轉址、中文檔名（`filename*` 與原始 UTF-8 的 `filename="…"`）、非法字元、網址裡的 %E5…、沒有副檔名、HTML、404、慢慢送、超過 500 MB、下載中或其他視窗開著時拖入連結）；第 4 部分（v1.0.48）：Latin-1／Big5 與只有點的檔名、401、連不上、網址有密碼、提早結束時立刻關連線、壓縮時的進度、剪貼簿只交網址、開啟時的忙碌提示、要密碼的 PDF、Esc 後馬上再開、連按兩次 Ctrl+Shift+O、跟內建重複的自訂快捷鍵。測試結束時把剪貼簿還原。

### 3.9.14 連結工具（v1.0.41）
- 入口：「註解」群組的〔插入圖片〕改成分段按鈕 `ACTION_MENUS.insert`（〔插入圖片…〕`{tool:'image'}`、〔連結〕`{tool:'link'}`）；工具名 `link`，`HINTS.link`。
- 建立：`startLinkDraw(i, e)` 拖曳一個框（小於 4 pt 不算）→ `openLinkDialog(i, {box})`。修改：連結工具下點一下 `.lnk` → `openLinkDialog(i, {link})`（多〔刪除連結〕）；在 `.lnk` 裡按下後拖曳超過 4 px，就從那裡畫一個新的連結（`startLinkDraw`），不會打開舊的。找連結用 `linkRef`：先用物件編號，直接寫在 /Annots 裡的字典（沒有編號）用框找到（同一個框有好幾個時，選目的地相符的，否則選上面那個），再登記成間接物件放回原位，所以也能修改、刪除；找不到就提示。都是一次 `mutate`：「已建立連結」「已修改連結」「已刪除連結」。網址沒有 `scheme:` 就補 `https://`，只收 http、https；頁碼 1～N；郵件寫成 `mailto:`。寫進 PDF 的網址只有可列印的 ASCII（中文、空白等由 `new URL().href`／`pctNonAscii` 轉成 %XX），而且 `\ ( )` 要跳脫（`uriString`）：pdf-lib 的 `PDFString.of` 不會跳脫，不成對的 `)` 會弄壞整個註解。
- 別的程式做的其他種類連結（連到別的檔案 GoToR、Launch、JavaScript、Named、相對網址、ftp…）：視窗的「連到」多一個「其他（保持原樣）」並顯示原本的目的地，〔儲存〕要等使用者改了東西才能按；只改外觀時目的地不動。提示「其他連結：…」，Ctrl＋點提示「這個連結不能開啟」（沒有網址的是「這種連結不支援」）。
- 寫法：標準的 `/Subtype /Link`。`linkTarget`：網址與郵件 `/A <</S /URI /URI (…)>>`，本文件的頁面 `/Dest [頁 /Fit]`。`linkLook`：不顯示框 `/Border [0 0 0]`；細藍框 `/Border [0 0 1]`、`/C [0 0 1]`，再畫一個 1 pt 藍框的 `/AP`（`formAP`，旋轉頁也對），因為 pdf.js（本程式）和 Edge／Chrome 只畫有外觀的連結。連結不設 `/F 4`（列印旗標），所以框跟 Acrobat 一樣只在螢幕上，不會印出來。修改時外觀沒有改就不動 `/Border`、`/BS`、`/C`、`/AP`（別的程式做的紅框連結改了目的地還是紅框）；改了外觀就連 `/BS` 一起換掉（pdf.js 和 Acrobat 都以 `/BS` 為準）。目的地一律換成上面的寫法（命名目的地也是）。
- 讀取：`pageLinks(i)`（每份文件一個 `S.linkCache`（在 `DOC_KEYS` 裡，跟 `annCache` 一樣文件一換就清空）：頁 → `{p: promise, now: 結果}`；不要改成有上限、會整個清掉的快取，否則已經畫好的頁面 Ctrl＋點會失效）：pdf.js `getAnnotations` 的 Link → 框（畫面座標，`vp1`）、`url`（檔案裡寫的原文 `unsafeUrl`，顯示與修改用）、`href`（pdf.js 檢查過的 `url`，開啟用）、目的頁（命名目的地用 `getDestination`，再 `getPageIndex`）、外觀（框寬 > 0、`/C` 是藍色而且有外觀 `hasAppearance` 才是本程式畫的「細藍框」；別的框是 `other`，視窗顯示「維持原樣」，不改外觀就不動它）。換目的地時連 `/PA`（舊的網址）一起刪掉。`linkText(l)`：「開啟網址：…」「跳到第 N 頁」「寄信給：…」。
- 顯示：`ensureOverlay` 每一頁都讀 `pageLinks`（這樣 Ctrl＋點才知道哪裡有連結），並為每個連結放一個 `.lnk`（`title` 是 `linkText`），CSS 只在 `.tool-link` 時顯示，其他工具下不擋任何東西。
- Ctrl＋點（Mac 是 ⌘）：`pagesEl` 的 capture `pointerdown`，點在 `S.linkCache` 裡某個連結的框內（重疊時取面積最小的）→ `followLink`：頁面連結 `scrollToPage`；網址只開 http、https、mailto（主程式 `app:open-external` 也只放行這三種，其他提示「這個連結不能開啟」）；http、https 先問「要在瀏覽器開啟這個網址嗎？」（`#lnkOpen`）。這次按下產生的 click 會被吃掉，底下的物件不會反應；下一次按下、按了別的鍵或 2 秒後就不再吃（按住 Ctrl 時重複送出的 keydown 和修飾鍵不算；按下後拖走沒有 click 時，不會吃掉之後真正的點擊）。修改後頁面的連結還沒重新讀好時，Ctrl＋點先等 `pageLinks(i)` 再決定；讀不到連結的頁面算是沒有連結。問題視窗裡太長的網址只顯示前 500 字並加「…」。點在文字編輯區、輸入框、按鈕上不處理。
- 測試 `links.mjs`：3 頁（第 2 頁 /Rotate 90；第 3 頁有別的程式做的命名目的地連結，壓在一個矩形上）：建立網址／頁面／郵件連結、頁碼超出範圍、旋轉頁的位置、細藍框畫得出來而且框內不變；`.lnk` 與提示、修改（換網址、改外觀）、刪除與復原、修改命名目的地的連結（外觀不動）、連結工具與選取工具下 Ctrl＋點（攔下主程式的 `shell.openExternal`）、選取工具下點到連結底下的矩形；審查後補的：網址含不成對的 `)`、中文電子郵件、別的程式用 `/BS` 畫的紅框（改目的地保留、改成不顯示框就拿掉）、連到別的檔案的連結（其他種類、保持原樣）、210 頁的文件每頁都看過之後 Ctrl＋點第 1 頁。
  - 第 4 部分（v1.0.48）：直接寫在 /Annots 的連結可以修改、刪除；別的程式的框（沒有外觀）是「維持原樣」；換目的地拿掉 /PA；從連結裡拖曳畫新的連結；JavaScript 連結不執行並說明；網址先問、〔取消〕不開；Ctrl＋按下後拖走，下一次點擊照常；修改後馬上 Ctrl＋點仍然跟隨連結。

### 3.9.15 轉存 Word（v1.0.42）
- 入口：「輸出」分段按鈕 `ACTION_MENUS.output` 的〔轉存 Word〕（選單上顯示「轉存成可編輯的 Word 檔（.docx）…」），`openWordDialog()`。視窗：頁面（全部／指定範圍，`parseRange`）、轉換方式（`#wdHow`：用 Microsoft Word 轉換／程式內建轉換；`word:detect` 找不到 Word 時第一項停用）、掃描頁先做文字辨識（`#wdOcr`，只有內建轉換用）。〔轉存〕→ 先 `file:choose-save` 選位置（不能選原本的 PDF）→ 才轉換，進度在 `#wdSt`；轉換中設 `S.exporting`，按 Esc 或點視窗外面都不會關閉視窗。〔取消〕立刻顯示「取消中…」，在頁與頁之間停（Word 轉換時結束 PowerShell 和它開的 Word）；Word 已經轉好才收到取消，就照實說「按取消時 Word 已經轉好了」；內建轉換寫檔時顯示「存檔中…」，這時按取消也照實說「按取消時已經轉好了」。完成後按鈕變〔開啟〕（`app:open-path`）〔關閉〕；有沒轉進去的註解（沒有外觀），完成訊息會說有幾個。Word 失敗時自動改選內建轉換，再按一次〔轉存〕。但 .docx 被 Word 開著或不能寫入時，只說明原因，不改轉換方式：Word 轉換回 `why:'locked'`，內建轉換寫檔遇到 EBUSY／EPERM／EACCES／EISDIR／EROFS 也一樣（`lockedDocx`；`file:write` 失敗時也刪掉 `.pdfeditor-tmp`）。轉換用過掃描頁辨識、尋找列又沒開著，就放掉辨識程式（`dropFindWorker`，`closeFind` 也用它）。
- `flattenForExport(pages, {realText})`：在 `S.bytes` 的副本上，先拿掉隱藏圖層上的頁面內容（`stripHiddenContent`：`BDC /OC /名稱 … EMC`，圖層關閉以 `/OCProperties /D` 為準，`ocgsOff`；OCMD 要全部關閉才算），Word 用時再拿掉修改原文藏起來的舊字（`dropHiddenOriginals`：`/PDFE_Hide` 裡的字用 `removePageText` 的 `pick` 換成只留寬度的 TJ，因為 Word 會讀看不見的字）；然後依 /Annots 的疊放順序，把看得見的註解依 PDF 規格 12.5.5（外觀的 BBox 經 /Matrix 對到 /Rect）畫進頁面內容（`/PDFEFlat<頁>_<序>`，頁面可能共用資源所以名字要不同；`appendPageOps` 不管 /Contents 是一個串流還是陣列都接得上——修改原文的 `writePageText` 會把它變成一個串流），刪掉 /Annots；便利貼、連結、Popup、隱藏的（/F 2、32）、隱藏圖層上的不轉。**文字方塊在這個程式裡是「文字的圖片」**（/AP 是影像，文字在 `PDFE_RT`），所以不畫圖片：內建轉換時把文字交給轉換器（`boxes`，每頁一組 {rect, lines}；別的程式做的用 /Contents、/DA 的字級）；Word 轉換時（`realText`）用修改原文的 `writePageText` 寫成真正的文字（`realTextBox`；轉向、直書、字型裡沒有的字就退回畫圖片）。沒有外觀（沒有 /AP /N）又有面積的註解不轉，算進 `skipped`，例如其他程式的螢光筆、等 NeedAppearances 的表單欄位。回傳 `{bytes, boxes, skipped}`；文件本身不動、不進復原。只轉部分頁面時，`trimCopy` 會整理副本，大檔案的一頁不會做出很大的副本：
  - 拿掉目錄、表單、結構樹、Names、Dests、OpenAction、AA、Threads；留下的頁面也拿掉 /B（文章串）和 /AA（頁面動作）。
  - 再刪掉 `reachableRefs` 找不到的物件。
  - 加密或有讀不懂的物件時不整理。
- 內建轉換（`builtinDocx` → 每頁 `wordSection`）：pdf.js 讀副本。`wordItems`（`getTextContent` 含標記內容，`PDFE_Hide` 裡的字不要；先 `getOperatorList` 讓 `commonObjs` 有字型名稱與粗斜體）→ `wordCut`（在**組成行之前**用字塊做 XY 切割：一區至少三行高、往下整區都空 0.9 em 以上就是欄間，先切欄、左欄先；不然切最寬的上下空隙；每塊記住所在的區 `reg`（一欄一區）和欄的左邊 `col`）→ `wordLines`（同一區、高度重疊一半以上的字塊是一行，由左到右；字之間有空隙加空白，中文之間不加；比本行小又往上提的字塊是上標 `vertAlign`）→ `wordParagraphs`（字級、行距、左邊對齊（或首行縮排）、粗細相同，而且上一行寫到同區同字級各行的右邊界（4 em 內）才接成一段——清單、標題、地址這種短行不會被接起來；行尾連字號接小寫字母就拿掉）→ 對齊（單行置中／靠右）、段前距（跟上一段的距離）、縮排（從所在欄的左邊算）、首行縮排 `w:firstLine`、行距（atLeast 基線距離）。字型 `wordFonts(name)`：細明體、標楷體、正黑體、Times New Roman、Arial…，認不得就交給 Word 的預設（Calibri／新細明體）。
- 圖片：`imageBoxesOf(ops, vt, W, H)`（從 `detectImages` 拆出來，兩邊共用）→ 把副本那一頁畫成 144 dpi（`wordRender`）裁切成 PNG（`wordCrop`），依位置插在段落之間，太大就縮到版面內。佔頁面 60% 以上的圖片，看頁面畫出來的字（`textGlyphs`；繪製模式 3、7 是看不見的字）：看不見的字比看得見的多 → 已經做過辨識的掃描檔，用那層字、底圖不放（不然字出現兩次）；看得見的字不到 30 個（頁碼、戳記）→ 掃描頁，那幾個字不另外轉（都在圖裡），勾文字辨識就 `wordOcrLines`（跟尋找的掃描頁辨識一樣：300 dpi、留白邊、Tesseract `findWorker`），辨識不到 5 個字（照片）就保留整頁圖片，不勾就整頁一張圖；字很多 → 一般頁面上的大圖，圖和字都留。
- .docx：`docxBytes(sections)` 寫 OOXML（每頁一個分節，頁面大小與方向、邊界從內容位置算，夾在 18～72 pt），用 `makeZip`（現在可以 `deflate`，pako 1.0.11 改成直接相依）打包；`DOCX_MIME`。
- Word 轉換（`word.js`，`main.js` 用它；打包清單 `build.files` 要有 `word.js`，`npm run check` 也檢查它）：`word:detect` → `wordVersion`（讀 `HKCR\Word.Application\CurVer`，15 以上才有 PDF 轉換）。`word:convert(id, pdf, out)`（`out` 必須是這次用 `file:choose-save` 選的）→ `convertWithWord`：先看是不是已經取消。目標檔不能寫（`targetLocked`：被 Word 開著、唯讀、是資料夾）就回 `why:'locked'`，不叫 Word。清掉一小時以前留下的 `pdfe-word-*` 暫存資料夾（`sweepTemp`；Word 沒能關掉時，資料夾會刪不掉）。記下 `HKCU\Software\Microsoft\Office\<版本>.0\Word\Options\DisableConvertPdfWarning` 原本的值、設成 1；副本寫到暫存資料夾，`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File convert.ps1`（`WORD_PS`），路徑用環境變數 `PDFE_IN`／`PDFE_OUT` 傳；腳本 `Documents.Open($in, $false, $true, $false)`、`SaveAs2($out, 16)`、`finally` 一定 `Quit`；成功印 `PDFE_OK`，失敗印 `PDFE_ERR:訊息`（UTF-8）。Word 寫到暫存資料夾，成功才複製到使用者選的位置（這時檔案被鎖也回 `locked`）。不管成功、失敗、取消、逾時，主程式的 `finally` 都會把那個設定還原（PowerShell 被結束時它自己的 finally 不會跑）並刪掉暫存資料夾。10 分鐘逾時；取消或逾時用 `stopWord` 結束這次開的 Word（命令列有 Automation、開始時間在這次之後的 WINWORD.EXE）。所有要執行的程式都經過 `run(file, args, opts)`，所以 `tests/e2e/word-main.mjs` 能在 Linux 上用假的 `run` 測這些步驟。`app:open-path` 只開這次用 `file:choose-save` 選的 .docx。
- **真正的 Word 轉換還沒有在 Windows 實機上確認過**（開發環境是 Linux、沒有 Word，測試把 `word:*` 換成假的）。要確認：有 Word 的電腦上預設選 Word、轉換時不跳出 Word 視窗或詢問、中文路徑、取消後工作管理員裡沒有殘留的 WINWORD.EXE、Word 的「將 PDF 轉換成 Word」提示設定轉完後跟原本一樣。
- 測試 `word.mjs`：第 1 部分（標題、寫滿整行的英文與中文段落、拖進來的圖片、橫向頁、轉向頁上紅色加底線的文字方塊、OOXML 子元素順序、文件不變、`openPath` 不開其他檔案）；第 2 部分（圖片位置、掃描頁辨識與不辨識、已有文字層的掃描頁、只有頁碼的掃描頁、沒有字的照片、字型對應、200 頁轉換中取消、雙欄（欄間 12 pt、同一條基線格）與註腳上標、清單、單行段落與首行縮排的段落、隱藏圖層上的字）；第 3 部分（主程式的 `word:detect`／`word:convert`／`app:open-path` 換成假的：選 Word、送出的 PDF 只有選的頁面、沒有註解、兩個文字方塊（一個跟圖片同頁）是真正的文字、取代過的字只剩新的、〔開啟〕、Word 失敗改用內建、`WORD_PS` 的內容）。`word-main.mjs`：`word.js` 的成功、取消、逾時、失敗、開始前取消，設定都還原、暫存資料夾刪掉、打包清單有 `word.js`。
  - 第 4 部分（v1.0.47）：
    - 轉換中按 Esc 或點視窗外面不會關閉；〔取消〕立刻顯示「取消中」。
    - 晚到的取消。
    - .docx 被鎖；內建轉換寫不進去（不留暫存檔）。
    - 沒有外觀的註解數。
    - 只轉一頁時，副本不帶別頁的大圖。
  - 第 2 部分也檢查轉換後辨識程式已經放掉。
  - `word-main.mjs` 也測：
    - 目標被鎖：轉換前、轉換中。
    - 一小時以前的暫存資料夾。
  - `window.__pdfapp.flatten`、`wordFonts`、`findWorker`、`wordJob` 是測試用的鉤子。

### 3.9.16 Claude 增益集（v1.0.43）
- 做法：Claude 桌面版的擴充功能（`.mcpb`，MCP Bundle，manifest 0.3）。PDF 工作台「設定 → Claude」打開〔允許 Claude 使用 PDF 工作台〕後，主程式開一個本機連線（`claude.js` 的 `createBridge`：只聽 127.0.0.1，從 47613 起找空的連接埠，`POST /v1/call {tool, args}`、`X-PDFE-Key` 標頭帶金鑰（`timingSafeEqual`），有 `Origin` 標頭（網頁發的）或 Host 不是本機就拒絕，關閉時金鑰當作空的、一律拒絕）。設定存在 `userData/claude.json`（權限 600，只有自己讀得到；enabled、48 個十六進位字的金鑰、port；平常的連接埠被占用時改用下一個並記下來，裝好的擴充功能重開後還連得到）。設定頁顯示金鑰（〔複製〕）；〔重新產生金鑰〕要按第二次才會換，換了以後裝好的擴充功能要把新金鑰貼到它的設定裡，或移除後重新儲存安裝。打包清單 `build.files` 要有 `claude.js`；`npm run check` 也檢查它和 `app/claude/server/index.js`。
- 擴充功能：〔儲存 Claude 擴充功能…〕（`saveClaudeMcpb`）用 `makeZip` 打包 `manifest.json`、`server/index.js`、`server/tools.json`（都從 `app/claude/server/` 讀）。manifest 的 `mcp_config` 是 `node ${__dirname}/server/index.js`，環境變數 `PDFE_PORT`／`PDFE_KEY` 來自 `${user_config.port}`／`${user_config.key}`，兩個 user_config 的預設值就是現在的連接埠和金鑰（金鑰 `sensitive`），所以安裝時不用打字。
- MCP 伺服器（`app/claude/server/index.js`，Claude 桌面版用自己內建的 Node 執行，沒有相依套件）：stdio、JSON-RPC 2.0 一行一則；`initialize`（protocolVersion 2025-06-18／2025-03-26／2024-11-05，對方要哪個就回哪個）、`tools/list`（`tools.json` 的 14 個工具；每個工具有 `annotations`：讀取的是 `readOnlyHint`，`pdf_replace`、`pdf_delete_pages` 是 `destructiveHint`，給 Claude 桌面版的權限詢問用）、`tools/call`（轉給本機連線，結果變成 `content` 文字，錯誤時 `isError`）、`ping`；JSON-RPC batch（陣列）回 -32600。連不上、金鑰錯、逾時都回清楚的中文說明。
- 呼叫的路線：主程式收到 → `claude:call`（id、工具、參數）送到畫面 → `runClaudeTool` → `CLAUDE_TOOLS[工具]` → `claude:result` 回主程式（170 秒沒回就回「太久沒有完成」；畫面重新載入（`did-start-loading`）或當掉（`render-process-gone`）時，`dropClaudeCalls` 立刻回覆所有等著的呼叫。畫面還在載入（`pageLoading`，到 `did-stop-loading` 或 `renderer-ready`）或已經當掉（`pageGone`）時，新的呼叫立刻回說明，不會送到沒有在聽的畫面）。呼叫一個一個照順序做（`CL_QUEUE`；同時兩個會從同一份文件開始改，其中一個的修改會不見）。會修改的工具（`CL_EDIT`）在 `clBusy()`——有視窗開著、另存新檔視窗還開著（`CL_SAVING`）、程式正在處理（`#busy`）、正在編輯文字方塊或便利貼、正在畫筆畫或多邊形——時回「PDF 工作台正在忙」（`pdf_go_to_page` 也算，單頁檢視時跳頁會讓正在編輯的方塊跑掉）。`mutate()` 沒有完成（例如數位簽署過的文件使用者按了取消）時回錯誤（`clDone`），不會說已經改好。頁碼範圍裡每個數字都要在 1～N（`clPages` 先檢查再交給 `parseRange`，不會悄悄截掉，也不會把巨大的範圍逐頁跑）。`pdf_open` 只收這台電腦上的完整路徑（不收網路位置與相對路徑），讀檔時不把資料夾加進可寫入的清單（`file:read` 的 `quiet`）。頁碼從 1 開始（`clPage`／`clPages` 用 `parseRange`），位置從頁面左上角算、單位 pt（`clCoord` 讓放上去的東西留在頁面內）。
- 工具：`pdf_status`（每個分頁的名稱、頁數、有沒有未存的修改，目前文件每頁的大小與目前的頁；沒有文件時說要先開）、`pdf_open`（.pdf 路徑，用 `DESK.readFile` 讀、`openFile(…, {rethrow:true})` 開在新分頁；成功與否用 `samePath` 比對完整路徑（Windows 路徑不分大小寫、`/` 等於 `\`，所以 `C:/a.pdf` 和 `C:\a.pdf` 不會開兩次）；要密碼的檔案說要密碼）、`pdf_read_text`（`findLines`，最多 50 頁、10 萬字）、`pdf_find`／`pdf_replace`／`pdf_highlight`（`clSearch`：跟尋找一樣的比對，取代用 `replaceNow(list, repl, o, q, {prefix:'Claude：'})`，回覆只列真的取代了的頁，掃描頁上不能取代的幾處另外說；`pdf_replace`、`pdf_highlight` 搜尋完會再看一次 `clBusy()`，使用者在搜尋時開始編輯，就回「正在忙」，不會把使用者正在打的文字方塊收掉，標示用 `highlightAnnot` 一次 `mutate`）、`pdf_add_text`（`renderTextBox` + `textBoxFields`，跟文字方塊工具做的一樣；太長的行用 `wrapText` 換行，寬度是到頁面右邊 12 pt（`width` 比較小就用 `width`）；x 在頁面最右邊時，用十個字寬換行再往左移，方塊不超出頁面）、`pdf_add_note`（`createNote`）、`pdf_rotate_pages`、`pdf_delete_pages`（至少留一頁）、`pdf_insert_blank_page`（跟前一頁一樣大、一樣轉向）、`pdf_go_to_page`、`pdf_undo`（只復原 Claude 做的修改：Claude 的工具改文件都用 `clMutate`（`mutate(…, {by:'claude'})`；`createNote`、`replaceNow` 也把 `by` 傳下去），復原步驟記 `by:'claude'`。Claude 的呼叫進行中，使用者自己做的修改仍然是使用者的。上一步是使用者做的就不復原，並說明）、`pdf_save_as`（`saveAsNew`，跳出另存新檔視窗；150 秒還沒選好就先回覆）。每個修改一個復原步驟，提示文字以「Claude：」開頭，畫面跳到改的那一頁。
- 安裝步驟（設定頁裡也有）：1. 安裝並登入 Claude 桌面版。2. PDF 工作台「設定 → Claude」打開允許。3. 按〔儲存 Claude 擴充功能…〕存出「PDF 工作台.mcpb」。4. 雙擊這個檔案（或在 Claude 的「設定 → 擴充功能 → 進階設定 → 安裝擴充功能…」選它）→〔安裝〕。5. 在 Claude 的對話裡說要做的事；用的時候 PDF 工作台要開著。
- **還沒有在真正的 Claude 桌面版上安裝過**（開發環境沒有 Claude 桌面版）：測試用 Node 執行擴充功能的伺服器、透過 stdio 對真正的程式說 MCP。要在使用者的電腦上確認：雙擊 .mcpb 能安裝、擴充功能設定頁顯示連接埠與金鑰、Claude 能列出 14 個工具並呼叫成功。
- 設定頁開著時每 2 秒更新狀態（`CL_POLL`）；最後一次呼叫在 10 分鐘內就顯示「Claude 已連線」。
- 測試 `claude.mjs`：第 1 部分（設定頁、.mcpb 內容、MCP 交握與工具清單、狀態、讀文字、跳頁、本機連線拒絕沒有金鑰／錯的金鑰／網頁、重新產生金鑰、關閉）；第 2 部分（找、取代、螢光筆、文字方塊、便利貼、復原、忙碌時拒絕、頁碼超出）；第 3 部分（旋轉、加空白頁、刪除頁、不能刪光、另存新檔、沒有文件、開檔（中文與空白的路徑）、不是 PDF、找不到檔案）；第 5 部分（v1.0.47：claude.json 權限、Host 檢查、batch、annotations、設定頁顯示已連線、取代跳過掃描頁與「Claude：」提示、只復原 Claude 的修改、長行換行、負座標與空字串、編輯文字方塊時跳頁、要密碼與壞掉的同名檔、重新載入時等著的呼叫）。測試出錯時 `process.on('exit')` 會結束 Electron。

### 3.9.17 插入其他 PDF：PDF 包、XFA、「限制編輯」的加密檔（v1.0.44）
- 使用者回報（2026-11-12）：插入「承攬商施工前必備檢核資料.pdf」時只有「共 1 頁」，預覽是一張空白的 Letter 頁。檔案沒拿到（使用者說「可以不用測試」），用自己做的檔案重現了兩種會這樣的情況：
  - **PDF 包**（目錄有 `/Collection`，真正的文件都是內嵌檔案，外面只有一張封面）。
  - **XFA 動態表單**（`/NeedsRendering true`，只有一張預留頁）。

  另外也查到：「限制編輯」的加密檔（只有權限密碼，不用密碼就能開）插入後頁面是白的或亂掉，直接開啟後每一個修改都失敗（「No password given」）。
- **`pdfcrypt.js`（主程式）**：`decryptPdf(bytes)` 用空白的開啟密碼解密，規則跟 pdf.js 4.10 的 `CipherTransformFactory` 一樣。
  - 支援：標準加密 V1/V2/V4/V5、R2–R6（RC4 40–128 位元、AES-128、AES-256）、StmF/StrF/EFF 加密篩選、Identity、`EncryptMetadata false`、物件串流（整個串流加密，所以先解密再讀出裡面的物件）。
  - 簽章字典的 `/Contents` 不解密（規格規定它沒有加密）。
  - 回傳下列其中一種：`plain`、`decrypted`（另外附上 `signed` 表示有沒有簽章）、`password`（需要開啟密碼）、`unsupported`（附原因）。
  - `signed` 的判斷（`isSigned`，v1.0.45）：解密完成後，所有物件（包括物件串流裡的，也找巢狀的字典）中有沒有簽章字典（有 `/ByteRange`，或 `/Type /Sig`、`/DocTimeStamp`）。欄位怎麼寫都認得出來，例如 `/FT` 寫在上層欄位、欄位直接寫在 `/Fields`、`/FT` 是參照、沒有 `/FT`。Reader 擴充功能的使用權限（`/Perms /UR3`、`/UR` 指到的簽章字典）不算，所以這種加密表單會解除限制編輯。
  - 輸入可以是 Uint8Array、Buffer、DataView、ArrayBuffer，都直接用（不複製）；其他東西回 `unsupported`。
  - 用 Node 的 crypto 計算 MD5、SHA-2、AES；RC4 是自己寫的。讀檔用 pdf-lib 的 `PDFParser`，但改寫 `parseIndirectObject`：照檔案順序記下每個物件，物件串流先留著；解密時也照同樣的順序，讓後面的版本蓋過前面的。
  - 「快速網頁檢視」（linearized）的檔：最後一個 xref 串流只有 `/Size`，`/Root /Encrypt /Info /ID` 在第一個 xref 串流裡。pdf-lib 會用後面的整個蓋掉前面的，所以要保留前面有、後面沒有的項目（不然整份會被當成沒加密）。
  - `/Length` 是另一個物件（`/Length 12 0 R`，Ghostscript、qpdf 的 QDF 都會這樣寫）：pdf-lib 找 `endstream` 決定結尾時，會把結尾的 CR 當成換行吃掉，但加密後的資料最後一個位元組可能剛好就是 CR（約 1/256），這樣 AES 會少一整塊、RC4 會少一個位元組。所以也改寫 `parseDictOrStream`：先跟 pdf.js 一樣保留到 `endstream` 為止，讀完全部物件後再套用真正的長度。長度物件在物件串流裡時，等解密完再截（AES 本來就會丟掉不滿一塊的尾巴）。
  - 解密在主程式裡，大檔不能卡住程式：讀取每 1000 個物件、解密每 300 個物件（物件串流以裡面的物件數計算）會讓出一次；存檔時不用物件串流（pdf-lib 判斷「每 N 個物件讓出一次」是看總數剛好是 N 的倍數，物件串流一次加好幾十，可能永遠碰不到）。3000 頁、1.8 萬個物件的檔，最久只卡約 30 ms。
  - pdf-lib 用 `pdf-lib/dist/pdf-lib.min.js`：安裝檔的 `build.files` 排除了 `node_modules/pdf-lib/cjs`。`pdf-decrypt.mjs` 會檢查 pdfcrypt.js 載入的檔案都有被打包。
  - IPC：`pdf:decrypt`，第一次用到時才 `require`。preload：`decryptPdf`。
- **畫面**：
  - `readablePdf(bytes)`：位元組裡沒有 `/Encrypt` 就直接當成一般檔案，不走 IPC。解密後用 `readsAlike` 跟原檔比對（pdf.js 讀到的頁數、前 20 頁的大小與轉向、第 1 頁的文字），不一樣就不用解密的版本，當作「不支援」。
  - `openInNewTab`：開檔、網址、Claude 的 `pdf_open`、附件〔開啟〕都走這裡，解密成功就用解密後的內容，並提示「這份 PDF 有「限制編輯」的保護：PDF 工作台已解除，修改後另存的新檔不會再有這個保護」。有簽章的不解密（開啟時不要悄悄讓簽章失效）。開啟 PDF 包時提示「這是 PDF 包：裡面的檔案在左側「附件」分頁」。
  - 附件分頁的 PDF（開頭有 `%PDF-`）多一個〔開啟〕（`openAttachment`）。
  - `mutate`：修改的結果打不開（`loadDoc` 失敗）時，退回去，不留復原步驟、不標成有修改、目前頁不變，並重新畫頁面（`loadDoc` 一開始會停掉正在畫的頁面）。文件真的還是加密的時候（pdf.js 的 `EncryptFilterName`；只看位元組裡有沒有 "/Encrypt" 會誤判）提示「這份 PDF 有加密保護，PDF 工作台無法修改它」。問的是修改開始時那份文件（分頁在處理中被關掉或切換也一樣），最多等 2 秒。
- **插入視窗**（`insertFromPdf`）：
  - 來源檔和它內嵌的 PDF 都用 `insertSource` 讀（先解密；無法解密的加密檔不能插入）。依序列出：先是本身的頁面，再來是附件（依檔名排序）。所有來源共用一個 pdf.js worker（`PDFWorker`；PDF 包裡有幾十個檔時才不會開幾十個 worker），視窗關掉後一起結束。
  - `pagePicker` 的 `groups` 為每個來源加一個段落標題（`.pp-group`，「檔名 · 第 a–b 頁」），頁碼接續編號。
  - 預設勾選：PDF 包勾選內嵌 PDF 的頁面（不含封面）；其他檔案勾選本身的頁面。
  - 不是 PDF、需要密碼、讀不到的附件寫在說明裡（「不能插入：…」）。
  - XFA 動態表單（pdf.js `IsXFAPresent` 加上 pdf-lib 讀到 `/NeedsRendering true`）：黃色的 `warn` 說明怎麼轉成一般 PDF（Adobe Reader →「列印」→「Microsoft Print to PDF」），預設不勾選。
  - 插入時從各自的來源 `copyPages`，依頁碼順序放進文件。
- 測試檔：`tests/e2e/fixtures/encrypted/*.pdf` 由同資料夾的 `make.py`（pikepdf／qpdf）產生，內容是兩頁文字、中文標題、便利貼、附件、XMP、表單欄位；只有 `r6-userpw` 需要密碼（secret）。要改測試檔時：`python3 -m pip install pikepdf`，然後執行 `make.py`。

### 3.9.18 開啟有數位簽章的 PDF、處理中的快捷鍵（v1.0.46）
- 開啟別人簽過的 PDF：`S.signed` 只在程式內簽署後才設定（之後修改前會先確認「此文件已數位簽署」），開啟的檔案沒有設定。所以 `mutate` 第一次成功修改這種文件後，會提示「這份文件有數位簽章，修改後簽章會失效。原檔不會被修改；按「復原」可以回到簽署時的內容。」（`'long'` 提示，6.5 秒）。
  - 每個分頁只提示一次：分頁狀態 `sigChecked`，放在 `DOC_KEYS`。
  - 判斷用 `signedDoc(doc)`，規則跟 `pdfcrypt.js` 的 `isSigned` 一樣：找到任何簽章字典就算，但排除 `/Perms /UR3`、`/UR`。
  - 另存前的清理（`pruneUnused`）兩個都看：`hasSignature`（只要有 `/Perms` 就算，因為重寫檔案也會讓 Reader 擴充功能失效）或 `signedDoc`（各種寫法的簽章欄位）。有任何一個，檔案就原樣另存，簽章不會被清理弄壞。
  - 在程式內簽署（`openDigiSign`）時，`S.signed` 或 `signedDoc` 任一成立，就先問「再次簽署」：簽署會重寫整份檔案，別人的簽章會失效（例如對方簽好的合約要再加簽）。
  - 用提示而不是確認視窗：原檔不會被改、可以復原，而且有人簽過的 PDF 常常只是拿來加註解。測試用的 `sample.pdf` 本身就是用程式簽署過的（第 24 號物件是 `/Sig`），改成確認視窗的話，所有修改它的測試都會被擋住。
- 還是加密的文件（有簽章所以開啟時沒有解密的「限制編輯」檔，或無法解密的檔）：`mutate` 讀進來看到 `doc.isEncrypted` 就停，提示「這份 PDF 有加密保護，PDF 工作台無法修改它」，不做白工。
- 程式正在處理時（`#busy` 顯示中，`isBusy()`）：
  - 快捷鍵處理（keydown）一律不處理，並取消 Ctrl／Alt 組合鍵、Tab、Delete 的預設動作。以前處理中按 Ctrl+W 會把正在修改的分頁關掉。
  - `switchTab`、`closeTab` 不做事。滑鼠按鍵設定與側鍵（app-command）、拖進視窗的檔案也一樣（拖進來的會提示稍後再拖）。
  - `openFile` 先 `whenIdle()`：從檔案總管開啟、第二個執行個體送來的檔案，會等目前的修改完成後再開。以前會在修改中途換分頁，修改就落到新開的分頁上。

### 3.10 其他
- 工具列（v1.0.23）：同一類的動作用 `ACTION_MENUS`（輸出、加頁、旋轉、簽署）做成分段按鈕：按鈕本體執行上次用過的那一項（`LAST_ACT`，存 `pdfeditor.lastact.v1`），▾ 列出全部。顯示模式、頁面色彩、按鍵、軟體更新都在 `openSettings(tab)` 的設定視窗裡（`actions.themeMenu／keySettings／checkUpdate` 都導到對應的頁）；按鍵頁是 `keyEditor()`，修改後立即存檔。「只顯示圖示」存在 `pdfeditor.ribbon.v1`，加上 `#ribbon.icons-only`。工具列超出寬度時滾輪會左右捲動。新增工具列按鈕時，盡量放進現有的分段按鈕，不要讓工具列再變長。
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
- localStorage 的鍵：`pdfeditor.bindings.v1, colors.v1, export.v1, find.v1, fontcat.v2, fontid.v1, fonts.recent.v1, lastact.v1, seenversion.v1, lasttool.v1, pagecolor, people.v1, print.v1, ribbon.v1, stamp.v1, styles.v1, textbox.v1, theme, view.v1`。
- 測試用的鉤子：`window.__pdfapp = {S, setTool, renderForExport, renderRegion, setTheme, setPageColor, actions, scrollToPage, makeSample, pageChars, getAnns, TBE, sel, links, flatten, wordFonts, …}`，端對端測試會用到，不要刪。

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
| object-style-2 | 文字方塊（顯示的值、字級變大左上角不動、顏色、粗體開關與連按兩下、方塊背景、框線、字型、復原、工具預設不變、大小不一的兩段改顏色）；戳記（存設定、改顏色時間不變、透明度 50→70→100% 只包一層、更換戳記中心不動且工具戳記不變、旋轉後改色與換戳記角度不變、舊版戳記沒有顏色）；圖片（更換圖片在原框內置中不變形、透明度保留）；區塊填色（顏色、透明度、換色保留透明度，看畫面像素）；頁面在物件畫好後才旋轉：戳記換色、更換戳記、橢圓填色換色、更換圖片都保持原本的方向與大小 |
| image-edit | 擷取圖片：裁切過的圖紅框是看得到的部分、內嵌圖片與表單裡的圖也找得到、內容相同的副本算同一張；刪除（工具列的鈕、只這一張／全部、共用資源與多段內容的頁面、疊在一起的圖、共用表單只刪這一處、副本算多處、整頁圖先確認並刪掉看不見的文字與縮圖、復原、內嵌圖片）；更換（視窗、保持比例置中、/Rotate 頁面上新圖是正的、斜放的角度保留、填滿與全部 N 處、表單裡的圖按〔↻〕、裁切過的圖放進看得到的部分） |
| save-clean | 另存時清掉用不到的資料：沒修改也完整（頁數、書籤、表單欄位、圖層、便利貼、圖片）、原檔裡沒用到的資料不見、刪掉的便利貼文字不在檔案裡、刪掉的圖片不在檔案裡、已數位簽署的文件原封不動 |
| align | 多選與對齊：拖曳選取框（隱藏的物件不選）、Shift＋點加入移出、Esc、拖其中一個全部移動、復原、Delete 全部刪除、換工具清除、Shift 按在旋轉把手上仍轉 15°；靠左（最左不動）、水平置中、靠下、對齊到頁面、水平平均分配、旋轉過的戳記以外框對齊且角度不變、線條＋文字方塊＋矩形靠上 |
| stacking | 上下層級：彈出視窗放在別處（全放在最後或最前）的便利貼旁邊上下移一層只移一格、同時按兩次只算一次；選取列的四個鈕（重疊處的顏色跟著變、連結位置不動、選取保留、一次復原）、Ctrl+] ／ Ctrl+[ ／加 Shift、到頂只提示不產生復原步驟、打字時不作用、便利貼的彈出視窗跟著走、橡皮擦後留在原位；圖層面板依頁列出（最上面的先）、選到的反白、右鍵移到最下層、拖曳到最上面、拖到別頁不動、收合後保持收合、有圖層時只在自己的圖層裡移動與拖到別的圖層、鎖定圖層不能拖、換色重填留在原位與原圖層 |
| print | 列印：Ctrl+P、印表機清單（系統預設在最前）、5 頁各一色的文件（第 5 頁是 /Rotate 90）；範圍「1 - 3」「8 -」「-」；印表機失敗、沒有印表機、讀不到清單、超過 100 張先確認、沒用過的印表機保留畫面設定；共用的範圍讀法（全形、倒過來、字母）、自訂範圍與錯誤、奇數頁、反向、橫向頁轉 90°、不列印的註解與隱藏圖層不印、只有文件、黑白；送出的選項與印出的 PDF（張數、A4）、關閉與提示、依印表機記住設定、準備時取消、〔印表機內容…〕；多頁合一 4／2（順序、橫向紙）與框線；手冊（補空白頁、左翻右翻、只印正面背面、短邊雙面、842×595）；海報（2×2、自動方向 8 張、重疊、標籤、裁切記號、100%） |
| find | 尋找與取代：Ctrl+F、hello 4 筆（大小寫、全形）與標示、Enter／Shift+Enter 換筆並捲動、區分大小寫／全形＝半形／全字相符的筆數、換分頁重找、Esc；「搜尋」分頁依頁列出並點選；掃描頁用文字辨識（標「辨識」、關掉再開用記住的）；取代一筆（只改那一行、一個復原步驟、到下一筆）、全部取代（3 處、提示、一個復原步驟、worldwide 不動）、本程式的文字區塊再取代（不重複）、同一行兩處、取代成空白、掃描頁的不取代並提示；畫面外的頁取代後仍是藍色粗體、本程式的區塊兩行一樣都換對、取代的字含要找的字仍往下走、看不見的文字層只找不換、換文件時舊結果立刻清掉、文字方塊打字中 Ctrl+F 不搶 |
| pdf-decrypt | （只用 Node）解密：RC4 40／128、V4 RC4、AES-128（物件串流、metadata 不加密）、AES-256、快速網頁檢視（AES-128／256＋物件串流）的文字、中文標題、便利貼、欄位值、附件、metadata 都和原本一樣；`/Length` 是另一個物件、資料以 CR 結尾（AES、RC4）的 300 頁每頁都完整；有簽章的 `/Contents` 沒動；簽章欄位在物件串流裡、`/FT` 在上層欄位、欄位直接寫在 `/Fields`、`/FT` 是參照、沒有 `/FT`、真正簽章加上 UR3 都認得出來，只有 `/Perms /UR3` 不算簽章；null 與 DataView；100 頁小於 5 秒；3000 頁 1.8 萬個物件最久卡不到 120 ms；需要密碼、沒加密、別的加密方式、不是 PDF；載入的檔案都有被打包 |
| encrypted-open | 「限制編輯」檔開啟：提示、畫面跟原檔一樣、畫矩形、復原、另存（新檔沒加密、原檔沒變）、RC4 40 與 AES-256（畫面也比對）；一般 PDF 裡剛好有 "/Encrypt" 字樣時，修改失敗的提示不會說「有加密保護」；有簽章的不解密、修改時說明且不留復原步驟；需要密碼；不解密時修改失敗也不留狀態；PDF 包的提示、附件〔開啟〕；解密結果跟原檔讀起來不一樣時不使用 |
| signed-edit | 開啟別人簽過的 PDF：第一次修改後提示會讓簽章失效、之後（包括復原後）不再提示、每個分頁各自提示、修改失敗不算；只有 UR3 的不提示；有簽章的加密檔只說有加密保護；處理中按 Ctrl+W／Ctrl+Tab、切換分頁都沒有作用，送來開啟的檔案等修改完成才開、修改留在原分頁；在程式內簽署別人簽過的檔先問「再次簽署」；`/FT` 在上層欄位的簽章檔另存時原樣保留 |
| insert-pdf | 插入其他 PDF：一般 PDF、PDF 包（封面＋兩個 PDF＋文字檔：分段、預設勾選、依頁碼順序從各自的來源插入）、附有 PDF 的一般檔、XFA 警告、AES／RC4／AES-256 加密來源的文字、需要密碼、PDF 包裡的加密 PDF、壞掉的 .pdf 與需要密碼的 PDF；PDF 包的所有來源只用一個 pdf.js worker |
| open-url | 從網址開啟：Ctrl+Shift+O 與剪貼簿、a.pdf 新分頁與頁數、轉址＋中文檔名、沒有副檔名、HTML／404／ftp:// 的提示、慢的下載取消與關視窗停止；拖進連結開啟、拖進網頁連結提示 |
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
| 1.0.34 | 選到文字方塊（字型、字級、顏色、底色、粗斜底線、方塊背景、框線套用到整個方塊並重新排版）、戳記（換色、透明度、〔更換戳記…〕）、圖片（〔更換圖片…〕、透明度）、點選區塊的填色（換色、透明度）時，工具列也換成它的設定（見 3.9.7）；頁面之後才旋轉的物件重畫時維持原本方向；自訂戳記帶入上次的內容 |
| 1.0.35 | 擷取圖片：點選紅框的圖片可〔刪除圖片〕〔更換圖片…〕（只這一張或全部 N 處；整頁先確認，看不見的辨識文字一起刪；更換可保持比例或填滿、〔↺〕〔↻〕轉向，新圖在畫面上是正的）；紅框只框看得到的部分；每次另存先清掉用不到的資料（加密、已簽署、有讀不懂物件的檔案照原樣存）（見 3.9.8） |
| 1.0.36 | 多選與對齊：選取工具拖曳選取框或 Shift＋點多選（同一頁、能移動的物件）；選了 2 個以上可靠左／水平置中／靠右／靠上／垂直置中／靠下（對齊選取範圍或頁面）、3 個以上平均分配；拖曳一起移動、Delete 一起刪除（見 3.9.9） |
| 1.0.37 | 物件的上下層級：每頁的物件依 `/Annots` 的順序前後疊放；選取列四個鈕、Ctrl+] ／ Ctrl+[（加 Shift 到最上／最下）、圖層面板依頁列出（最上面的先、預設展開、選到的反白、拖曳調整、右鍵）；換色重填與橡皮擦後留在原位與原圖層（見 3.9.10） |
| 1.0.38 | 列印：Ctrl+P／輸出 ▾ 列印；預覽每一面；印表機、份數、頁面（範圍、奇偶、反向）、紙張、方向、縮放、邊界、雙面、彩色／黑白、內容、品質；多頁合一、手冊、海報；依印表機記住設定；〔印表機內容…〕轉到系統列印視窗（見 3.9.11） |
| 1.0.39 | 尋找與取代：Ctrl+F 尋找列（區分大小寫、全字相符、全形＝半形、標示全部、上下筆）、「搜尋」分頁、掃描頁用文字辨識找；取代與全部取代用修改原文的方式重寫整行（本程式的文字區塊整塊重寫），一個復原步驟（見 3.9.12） |
| 1.0.40 | 從網址開啟：開啟 ▾ 從網址開啟（Ctrl+Shift+O，剪貼簿的網址先填好）、拖進瀏覽器的連結；主程式下載（轉址、500 MB、60 秒、檢查 %PDF）、進度與取消，新分頁（見 3.9.13） |
| 1.0.41 | 連結工具：插入 ▾ 連結，拖曳框建立連到網址、本文件頁面、電子郵件的連結（標準 /Link），細藍框畫成 /AP、不印；連結工具時顯示並可修改、刪除；任何工具下 Ctrl＋點開啟（見 3.9.14）|
| 1.0.42 | 轉存 Word：輸出 ▾ 轉存 Word；有 Word 時用 Word 本身轉換（PowerShell＋COM，背景執行），沒有就用內建轉換（文字段落、字級粗斜體、圖片、掃描頁文字辨識）；文字方塊用 PDFE_RT 的文字；Word 轉換還要在 Windows 實機確認（見 3.9.15）|
| 1.0.43 | Claude 增益集：設定 → Claude 開本機連線（127.0.0.1、金鑰、拒絕網頁）、存出 .mcpb（manifest 0.3、MCP stdio 伺服器、14 個工具）；工具都走 mutate；真正的 Claude 桌面版安裝還要在使用者電腦確認（見 3.9.16）|
| 1.0.44 | 插入其他 PDF：PDF 包與附件裡的 PDF 分段列出、XFA 動態表單的說明、「限制編輯」加密檔先解密（`pdfcrypt.js`）；「限制編輯」的檔案開啟後可以修改；修改失敗不留復原步驟；附件〔開啟〕（見 3.9.17）|
| 1.0.45 | v1.0.44 留下的小問題：簽章判斷（`isSigned`）不把 Reader 擴充功能的 UR3／UR 算成簽章（這種加密表單也能解除限制編輯），各種簽章欄位寫法都認得出來；修改失敗的「有加密保護」改看 pdf.js 的 EncryptFilterName；失敗後重畫頁面；主程式不再複製三份檔案（見 3.9.17）|
| 1.0.46 | 開啟別人簽過的 PDF：第一次修改後提示會讓簽章失效（`signedDoc`、分頁的 `sigChecked`）；還是加密的文件修改時立刻說明；處理中（`#busy`）不處理快捷鍵（見 3.9.18）|
| 1.0.47 | v1.0.42、v1.0.43 留下的小問題：Claude 只復原自己的修改、「Claude：」提示、文字方塊換行、重新載入時等著的呼叫立刻回覆、batch 與工具的 annotations、claude.json 600；轉存 Word 轉換中 Esc 不關視窗、取消中、晚到的取消、.docx 被鎖、只轉部分頁面時整理副本（`trimCopy`）、沒有外觀的註解數、放掉辨識程式、清掉舊的暫存資料夾（見 3.9.15、3.9.16）|
| 1.0.48 | v1.0.40、v1.0.41、v1.0.47 留下的小問題：從網址開啟的檔名（%XX、RFC 2047；讀不出來的或只有 .pdf 用網址名稱）、中文錯誤訊息、Esc 後馬上再開、剪貼簿只交網址、跟內建重複的自訂快捷鍵；連結 Ctrl＋點網址先問、直接寫在 /Annots 的連結可改可刪、別的程式的框「維持原樣」、從連結裡拖曳畫新連結、修改後的 Ctrl＋點、按住 Ctrl 時點擊仍被攔下（見 3.9.13、3.9.14）|
| 1.0.49 | v1.0.38、v1.0.39、v1.0.48 留下的小問題：取代只算真的改了的處數（`mutate` 可回傳 `{label}`）、尋找框不攔 Ctrl+S／O／P、全形字的全字相符、掃描頁辨識（旋轉重讀、空白頁不送、〔停止辨識〕）、長文件的行快取、同一提示只顯示一次；列印的頁碼訊息、數字欄位與存著的設定的範圍、整數像素、雙面標示、只開一個列印視窗、印表機沒回應可取消、列印時開檔等待；同一個框的連結（見 3.9.11、3.9.12、3.9.14）|

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
- 加密（只有擁有者密碼、不用密碼就能開）的 PDF，**修改後**另存時，pdf-lib 會把仍是密文的字串寫進新的物件串流，存出的檔案可能打不開（v1.0.35 審查發現，早就存在；另存時的清理已避開，修改的情形還沒處理，可改成這類檔案存檔時不用物件串流）。
- `app/index.html` 是單一大檔。如果要拆成多個模組，app:// 協定和 CSP 已經支援 ES module。

### 使用者排定的待辦（依順序，一版一項）

使用者會陸續加需求，用「→」區分下一版。**從 v1.0.36 起（使用者 2026-11-13）：待辦做好就直接發佈，不用先給預覽、不用等使用者說「發佈」；有不確定的地方以自己的判斷先做，出問題再回頭修。**發佈前仍跑 `npm run check`、`npm run test:e2e` 與一次全分支審查（都是自動的）。

使用者說「簡單的先提前做」：小修正和簡單的功能可以插隊先做（v1.0.25 就是檢視列修正＋排列頁面）。

接著（使用者 2026-11-14「接著修正再發佈」）：把各版最後檢查留下的小問題依功能分批修正，每批一版：
1. v1.0.50：上下層級（v1.0.37）、多選與對齊（v1.0.36）、圖片刪除與更換（v1.0.35）。
2. v1.0.51：樣式列（v1.0.33～34）、設定檔（v1.0.32）、右鍵（v1.0.31）、便利貼（v1.0.30）、更新內容（v1.0.29）。
3. v1.0.52：字型（v1.0.26～28）。

每批的清單在 `docs/superpowers/deferred-minors.md`（依版本列出；一批發佈後，把那幾版的段落刪掉）。只跟測試或文件有關、或已經不成立的項目，記成判斷（Ruling），不改程式。

---

## 8. 和使用者合作的方式

- 使用者用繁體中文溝通，訊息通常很短，例如「直接做」「再幫我新增…」。需求清楚就直接做，做完附上截圖說明。
- 每個功能完成後，都會**發布一個新版本**：改版本號、寫版本說明、推送、確認 Actions 成功，再附上下載連結。
- **使用者 2026-11-13：「之後的代辦做好都先直接發佈／不用先問我，有問題可以先以你的判斷先做／之後有出現問題我們再回頭來修」。** 待辦依序做完就發佈、接著做下一項；回報精簡（做了什麼＋下載連結）。
- 介面上的按鈕要是彩色的，滑鼠移上去要變黃色；暗色模式也要看得清楚。
- **絕對不要覆蓋使用者的原檔**，一律另存新檔。
- Git 提交訊息用英文，結尾加上 Co-Authored-By 等標記。
