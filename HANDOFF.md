# PDF 工作台（PDFEditor）交接文件

這份文件寫給接手開發的人或 Claude，讓你不必翻過去的對話就能繼續做。最後更新：2026-11-12，最新發布版本是 **v1.0.21**。

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

- **Electron 45**（`main.js` 主程序、`preload.js` 橋接），渲染端是**一個檔案**：`app/index.html`，約 6,800 行，裡面有 CSS 和一個 `<script type="module">`。沒有打包工具，也沒有框架。
- 函式庫都直接從 `node_modules` 載入：
  - `pdfjs-dist` 4.10.38：顯示、文字擷取、抓頁面上的圖片。含 cMaps 和標準字型，有啟用 worker，`isEvalSupported:false`。
  - `pdf-lib` 1.17.1：所有寫入，用全域 `PDFLib`。
  - `@pdf-lib/fontkit` 1.1.1（全域 `fontkit`）：嵌入字型子集，以及檢查字型有沒有某個字、量字寬。
  - `app/fonts/NotoSansTC-Regular.ttf`、`NotoSansTC-Bold.ttf`：思源黑體（Noto Sans TC，OFL 授權，`OFL.txt`），由 Google Fonts 的可變字型用 fontTools `varLib.instancer --static --update-name-table` 產生 400／700 兩個字重。**每個字形都補齊到 4 位元組（`glyf.padding = 4`）**：fontkit 做子集時會用短格式 `loca`（位移 ÷2），字形長度是奇數的話，子集裡後面的字形會壞掉。換字型時一定要再做一次。
  - `node-forge` 1.4.3：數位簽章（PKCS#7 detached）。
  - `gifenc`：輸出 GIF。
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
- `realTextOK` 檢查字型有沒有每個字，沒有就退回 FreeText 圖片做法。
- 這種文字是頁面本身的一部分：不能用選取工具移動，不屬於圖層。
- 方向（v1.0.21）：`pageTextItems` 替每段文字算出它在畫面上的方向 `rot`（0／90／180／270，順時針）和是否直書 `vert`（直書字型，或 `findStackedText` 找到的「一字一行」的假直書），並換算到「閱讀座標」（把畫面轉回 `rot`）：`base` 是基線（直書是欄的中線），`a0..a1` 是沿閱讀方向的範圍，`u` 是 PDF 座標的範圍（給 `removePageText`）。`lineOf`／`groupLines` 都在閱讀座標裡分行（直書的欄從右到左）。
- 編輯器（`openTextEditor` 的 `rot`、`vert`）用 CSS 轉向；直書用 `writing-mode:vertical-rl; text-orientation:upright`，錨點是右上角（`translateX(-100%)`）。`writePageText` 用同一個方向寫回：直書用 `layoutRealV` 排版、字型加 `vert` 特性（直書標點）並在嵌入後把 Encoding 改成 `/Identity-V`（Noto 的直書原點 880、前進 1000，和 PDF 預設 `DW2 [880 -1000]` 一樣，所以和瀏覽器排出來的位置一致）。區塊的 `PDFE_RT` 會記 `vert`，方向從 `PDFE_M` 算回來。
- `locateTextOps`／`fontMetrics` 認得直書字型（`-V` 編碼、`W2`／`DW2`），`removePageText` 用每段的方向算範圍；只有 Identity 編碼的 CID 字型才當作寬度可靠。

### 3.9 其他
- 工具：`setTool(t)`，搭配 `HINTS[t]`（上方提示列）。繪圖工具的設定在 `DRAW_TOOLS`、`STYLES`（存 localStorage）、`PRESETS`。新增工具時，這些都要補上，ribbon 也要加按鈕。
- 圖示：`ICONS` 物件（SVG path）。所有工具列按鈕都是彩色，滑鼠移上去會變黃色，這是使用者的明確要求。
- 顏色選擇一律用 `openColorPicker({anchor, value, none, title, onPick})`；對話框裡的按鈕用 `bindColorButton`。
- localStorage 的鍵：`pdfeditor.bindings.v1, colors.v1, export.v1, lasttool.v1, pagecolor, stamp.v1, styles.v1, textbox.v1, theme, view.v1`。
- 測試用的鉤子：`window.__pdfapp = {S, setTool, renderForExport, renderRegion, setTheme, setPageColor, actions, scrollToPage, makeSample, pageChars, getAnns, TBE, sel, …}`，端對端測試會用到，不要刪。

---

## 4. 發布流程

1. 改 `package.json` 的 `version`，然後**改寫** `RELEASE_NOTES.md`。每版都整份覆蓋，用繁體中文寫給使用者看。
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
npm run check                         # 語法檢查：main.js、preload.js、index.html 的 module script
npm run test:e2e                      # 執行 tests/e2e/ 下全部腳本
node tests/e2e/run.mjs layers         # 只跑檔名包含 layers 的腳本
```

- 端對端腳本會用 `playwright-core` 實際啟動 Electron，在 `tests/e2e/fixtures/sample.pdf` 的副本上操作。設定檔放在暫存資料夾（環境變數 `PDFE_USER_DATA`），**不會動到使用者已安裝程式的設定**。
- 在 Linux 沒有螢幕時，會自動改用 `xvfb-run` 執行；在 Windows 上會直接跳出視窗。
- 腳本主要是**印出結果給人看**（例如註解清單、像素值），大部分不是自動斷言。`run.mjs` 只會標出當掉、逾時或印出錯誤的腳本。改完程式後，要看輸出內容合不合理。
- 寫測試常踩的坑：
  - 切換工具時上方提示列會出現，頁面會往下移，所以**要在切換工具之後才量頁面位置**。
  - 文件有未儲存的修改時，`app.close()` 會被「尚未儲存」對話框卡住，所以結束一律用 `app.evaluate(({app}) => app.exit(0))`。
  - 拖曳的處理函式要在 pointerdown 時**同步**註冊，不能先 `await` 再註冊；這個錯誤以前出現過。
- 每次發布前都要把全部測試跑一遍。使用者重視「發布前有測過」。

| 腳本 | 涵蓋內容 |
|---|---|
| textbox-basic / textbox-image-drop | 文字方塊、格式化、右鍵選單、拖入圖片 |
| edit-page-text | 修改與刪除 PDF 原文、再次編輯 |
| rotated-text | 轉 90°／180°、直書、假直書、旋轉頁面上的文字，原位編輯後方向不變、pdftotext 讀得到；編輯器與頁面上字的位置一致（`_rotated_fixture.mjs` 產生測試檔） |
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

---

## 7. 已知限制與可以接著做的事

- 修改原文時，字型（Noto Sans TC）沒有的字（emoji、罕用字）那一段仍是圖片，搜尋不到。
- 修改原文不支援斜放（不是 90° 倍數）或鏡像的文字。直書字型如果用的不是 Identity-V 編碼（例如 `ETen-B5-V`），寬度對不上，原文會改用隱藏的方式（3 Tr）拿掉。Form XObject 裡的文字只能用底色蓋住。
- 轉向或直書的文字裡如果有字型沒有的字（emoji 等），不能修改（橫書會退回圖片做法，轉向／直書沒有）。
- 文字方塊（FreeText）還不能旋轉。旋轉過的矩形、橢圓是靠外觀串流呈現，如果其他軟體重新產生外觀（例如在 Acrobat 裡改它的樣式），會變回不旋轉的樣子。
- pdf.js 解析文字方塊的 `RC` 時，會印出「XFA rich text」警告。不影響顯示，但 RC 的 XHTML 格式可以再調整。
- 還不能在程式裡「建立」新的圖層群組（只能使用 PDF 原本就有的群組，或把圖層拖進有子圖層的圖層裡）。
- 安裝檔沒有程式碼簽章，Windows 會顯示 SmartScreen 警告。
- `app/index.html` 是單一大檔。如果要拆成多個模組，app:// 協定和 CSP 已經支援 ES module。

---

## 8. 和使用者合作的方式

- 使用者用繁體中文溝通，訊息通常很短，例如「直接做」「再幫我新增…」。需求清楚就直接做，做完附上截圖說明。
- 每個功能完成後，都會**發布一個新版本**：改版本號、寫版本說明、推送、確認 Actions 成功，再附上下載連結。
- 介面上的按鈕要是彩色的，滑鼠移上去要變黃色；暗色模式也要看得清楚。
- **絕對不要覆蓋使用者的原檔**，一律另存新檔。
- Git 提交訊息用英文，結尾加上 Co-Authored-By 等標記。
