# 字型辨識（v1.0.28）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 文字辨識的結果視窗多一個「字型」頁：PDF 本身的文字列出檔案記錄的字型（100%）；掃描檔逐字比對本機字型與 Google Fonts，列出相似度 %，可以套用或下載。

**Architecture:** 比對引擎、空白字型、Google Fonts 清單與載入放在新檔 `app/fontid.js`（一般 `<script>`，對外 `window.FontId`，只用 canvas 與數學，不碰文件）。介面、辨識引擎的逐字框、PDF 字型讀取、套用、下載、字型選單一區留在 `app/index.html`。缺字靠內建空白字型 `PDFE Blank` 判斷。

**Tech Stack:** Electron 45 canvas（`measureText` 的 `actualBoundingBox*`、`ctx.filter` 模糊、`FontFace`）、tesseract.js 7（`blocks` 輸出）、pdf.js 4.10（`page.commonObjs` 字型資料）、Google Fonts CSS2 API（`text=` 子集）、playwright-core e2e、fonttools（只在開發時產生字型檔）。

**Spec:** `docs/superpowers/specs/2026-11-12-font-identify-design.md`

## Global Constraints

- 介面文字繁體中文（台灣）；commit 訊息英文，結尾加專案規定的 Co-Authored-By／Claude-Session 兩行。
- 工作在 `wip/fontid`。使用者已授權「有問題照建議選項直接做」：全部測試與最後檢查通過後即合併 main 發佈。
- 字型辨識不改文件：不呼叫 `mutate()`、不碰 `S.bytes`。
- CSP 只改一處：`connect-src` 加 `https://fonts.googleapis.com`。
- 送到 Google 的字：只有參與比對的字，去重複、依碼位排序（`FontId.requestChars`），不送原文。
- 「也比對 Google Fonts」預設打勾，存 localStorage `pdfeditor.fontid.v1` = `{"google":true|false}`。
- 比對常數（照抄，實驗驗證過）：
  - 格子 48×48，外框留 2 格（縮放 `(48-4)/max(w,h)`）；形狀分數 `exp(-d/1.5)`。
  - 取字：信心度 ≥ 75；清理後外框高 ≥ 10 px；略過 `ilI1|`；每種文字最多 16 個；英數字優先順序 `agekyRGQ235`，之後依墨量；中文依墨量。
  - 成組門檻：中文 ≥ 3 個、英數字 ≥ 5 個。
  - 繪字高度上限 64 px（σ 依同比例縮小）。
  - 第一階段：6 個字、一般字重、σ = 0，取前 24 名。σ 候選 `[0, .5, 1, 1.5, 2, 2.5]`。第二階段：一般與 700 各比一次。
  - 缺字 > 30% 的字型不列；粗體分數多 0.02 以上才標「粗體」。
  - 每組最多 8 列；樣字最多 12 個；字型選單「字型辨識結果」最多 5 個。
  - Google：一次 10 個家族、同時最多 6 個請求、逾時 8000 ms。
  - 每約 12 ms 讓出主執行緒一次（有 `scheduler.yield` 用它，否則 `setTimeout 0`）。
- 逐字文案：
  - 頁籤「文字」「字型」；區段「PDF 記錄的字型」「中文」「英數字」。
  - 來源「本機」「內建」「Google Fonts」，另加「粗體」；PDF 標籤「已內嵌」「未內嵌」。
  - 「〔原名〕，以 〔字型〕 代替」；「這台電腦沒有」；「PDF 沒有記錄字型名稱」。
  - 按鈕〔套用〕〔下載〕〔用字形比對找相似字型〕〔重新比對〕。
  - 勾選框「也比對 Google Fonts」，title「需要網路。只會把要比對的幾個字（打散順序、不重複）送到 Google Fonts 下載字形，不會送出整段文字。」
  - 狀態：「讀取中…」「比對本機字型… N／M」「比對 Google Fonts…」「連不上 Google Fonts，只比對了這台電腦的字型」「這個範圍能比對的字太少，請框大一點或框清楚的字」「這台電腦沒有可以比對的字型」「辨識失敗：〔訊息〕」。
  - 說明行「相似度是逐字比對字形的結果，掃描越清楚越準。」
  - 套用 toast「已設為文字方塊的預設字型：〔名稱〕」；下載後提示「安裝後重新開啟 PDF 工作台，再比對一次就能套用」。
  - 字型選單區段「字型辨識結果」，項目「〔名稱〕　N%」；內建字型名稱「思源黑體（內建）」。
- 按鈕沿用 `.ocr-ft button` 樣式（黃色 hover），暗色模式可讀。
- 測試依賴這台機器的字型：DejaVu Serif／Sans、Liberation Sans／Serif、文泉驛正黑（含等寬）、Bitstream Charter（Type 1，Chromium 不能用）。

## Review Focus

1. **使用者有幾百個字型**：比對要在數秒內完成，期間畫面不能卡。→ Task 3 測試：候選重複成 500 個以上，總時間 < 8 s，主執行緒最長停頓 < 150 ms。
2. **直書的掃描字**（`chi_tra_vert` 辨識）：一樣要能比對。→ Task 5 測試：直書文泉驛欄位，第一名正確。
3. **框到圖案或線條（不是字）**：不能列出亂七八糟的結果，要說字太少。→ Task 5 測試。
4. **網路很慢或卡住**：不能一直轉，逾時後照列本機結果。→ Task 4 測試（假來源永不回應，逾時 300 ms）＋ Task 5 測試（狀態列文案）。
5. **很大的字**（72 pt 以上的標題）：一樣能比對。→ Task 3 測試：字高 150 px 的掃描。

---

### Task 1: 空白字型與 `FontId` 骨架

**Files:**
- Create: `scripts/make-blank-font.py`、`app/fonts/blank.ttf`、`app/fontid.js`
- Modify: `app/index.html`（第一個 `<script type="module">` 之前加 `<script src="fontid.js"></script>`）、`scripts/check.mjs`（也 `node --check app/fontid.js`）
- Test: `tests/e2e/font-identify-engine.mjs`（新檔，第 1 部分）

**Interfaces:**
- Produces:
  - `FontId.ready(): Promise<void>`：只載一次 `new FontFace('PDFE Blank', 'url(fonts/blank.ttf)')` 並加進 `document.fonts`。
  - `FontId.fontString(css: string, px: number, weight = 400): string` → `` `${weight} ${px}px ${css}, "PDFE Blank"` ``。`css` 是單一家族、已加引號的 CSS 名稱（`"DejaVu Serif"`、`"PDFE GF 3"`）。
  - `FontId.hasGlyph(css: string, ch: string, weight = 400): boolean`：100 px 時 `actualBoundingBoxAscent + actualBoundingBoxDescent > 1`。
- `blank.ttf`：fonttools `FontBuilder`，字形 `.notdef` 與 `blank` 都是空的、寬 0；cmap 只有一個 (3,10) format 13 子表，把 U+0020–U+D7FF、U+E000–U+FFFF、U+10000–U+3FFFF 全對到 `blank`；家族名「PDFE Blank」（約 616 bytes）。

- [ ] **Step 1: 寫失敗的測試**（`font-identify-engine.mjs`，沿用 `textbox-font.mjs` 的 `check`／`open` 寫法）

```js
await A(() => FontId.ready());
const hg = (css, ch) => A(([c, h]) => FontId.hasGlyph(c, h), [css, ch]);
check('blank font loaded', await A(() => document.fonts.check('16px "PDFE Blank"')));
check('latin font has A', await hg('"DejaVu Serif"', 'A'));
check('latin font lacks 中', !(await hg('"DejaVu Serif"', '中')));
check('cjk font has 中', await hg('"WenQuanYi Zen Hei"', '中'));
check('type 1 font unusable', !(await hg('"Bitstream Charter"', 'A')));
check('missing font', !(await hg('"No Such Font 123"', 'A')));
check('bundled font', await A(async () => { await document.fonts.load('16px "PDFE Sans"', '中'); return FontId.hasGlyph('"PDFE Sans"', '中'); }));
```

- [ ] **Step 2: 跑測試，確認失敗**：`node tests/e2e/font-identify-engine.mjs` → `FontId is not defined`。
- [ ] **Step 3: 產生 `blank.ttf`（`scripts/make-blank-font.py app/fonts/blank.ttf`，用 scratchpad 的 venv），寫 `fontid.js` 骨架，加 script 標籤與 check。**
- [ ] **Step 4: 跑測試通過；`npm run check` 多印一行 `ok  app/fontid.js`。**
- [ ] **Step 5: Commit**（`Font identification: blank fallback font and FontId skeleton`）

### Task 2: 從掃描圖取出要比對的字

**Files:**
- Modify: `app/fontid.js`
- Test: `tests/e2e/font-identify-engine.mjs`（第 2 部分）

**Interfaces:**
- Produces:
  - `Sym = {text: string, confidence: number, bbox: {x0, y0, x1, y1}}`（Tesseract 的 symbol，圖片像素座標）。
  - `Glyph = {ch: string, w: number, h: number, ink: number, grid: Float32Array /* 48*48，0 紙 … 1 墨 */}`。
  - `FontId.glyphsFromImage(img: HTMLCanvasElement, symbols: Sym[], {max = 16} = {}): {cjk: Glyph[], latin: Glyph[], order: string}`：`order` 是通過篩選的字依 `symbols` 原順序（樣字用）。
  - `FontId.N = 48`；內部 `gridOf(gray, W, box, bg, fg)` 給 Task 3 共用。
- 規則（spec §3、§4）：
  - 灰階 `(r*77 + g*150 + b*29) >> 8`；整張圖的墨色 fg = 第 0.2 百分位、紙色 bg = 第 60 百分位、門檻 T = 兩者中點；`bg - fg < 40` 視為沒有字，回傳空的。
  - 字的種類：`/\p{Script=Han}/u` → 中文；`/[A-Za-z0-9]/` → 英數字；其他略過。
  - 清理外框：在框外擴 2 px 的範圍內二值化（v < T），8 連通；留下「超過一半像素在框內、且 ≥ 3 px」的區塊，取它們的最小外框；沒有就略過。
  - 格子：外框依長寬比放進格子置中；縮小時平均、放大時取最近像素；值 = `clamp((bg - v)/(bg - fg), 0, 1)`；`ink` = 格子總和。
  - 同一個字只留信心度最高的一個。

- [ ] **Step 1: 寫失敗的測試。** 測試在 app 視窗裡注入 `__scan({css, text, px, blur, noise, seed, weight})`：在 canvas 畫一行字（`ctx.filter = blur(σ)`、固定種子的均勻雜點 ±noise）。它回傳 `{canvas, symbols}`，symbols 的框取自逐字乾淨繪製的墨跡外框，信心度 95。

```js
const r = await A(() => { const s = __scan({css:'"DejaVu Serif"', text:'Quick brown fox Rag 2025 il1', px:46, blur:.8, noise:20, seed:1});
  s.symbols.push({text:'Z', confidence:40, bbox:s.symbols[0].bbox}, {text:',', confidence:99, bbox:s.symbols[1].bbox}, {text:'Q', confidence:96, bbox:s.symbols[0].bbox});
  const g = FontId.glyphsFromImage(s.canvas, s.symbols); return {latin:g.latin.map(x => x.ch), cjk:g.cjk.length, ok:g.latin.every(x => x.ink > 20 && x.grid.length === 2304)}; });
check('filters low confidence, punctuation, ilI1|', !r.latin.some(c => 'Z,il1|'.includes(c)), r.latin);
check('unique, capped at 16', new Set(r.latin).size === r.latin.length && r.latin.length === 16, r.latin);
check('preferred order first', r.latin.slice(0, 7).join('') === 'agkRQ25', r.latin);
check('grids filled', r.ok && r.cjk === 0);
// 中文：21 個不同的字 → 16 個，墨量由多到少
// 字太小（px 10）→ 0 個；整張白紙 → 兩組都是空的
// 鄰字擠進來：把 'R' 的框左右各擴 6 px，清理後寬度和原本差 ≤ 2 px
```

- [ ] **Step 2: 跑測試，確認失敗**（`glyphsFromImage is not a function`）。
- [ ] **Step 3: 實作 `glyphsFromImage`。**
- [ ] **Step 4: 跑測試通過。**
- [ ] **Step 5: Commit**（`Font identification: glyphs from OCR symbol boxes`）

### Task 3: 逐字比對引擎

**Files:**
- Modify: `app/fontid.js`
- Test: `tests/e2e/font-identify-engine.mjs`（第 3 部分）

**Interfaces:**
- Consumes: Task 1 `fontString`／`hasGlyph`／`ready`；Task 2 `Glyph`、`gridOf`。
- Produces:
  - `Cand = {key: string, css: string, label: string, source: 'local'|'builtin'|'google', family?: string, entry?: GoogleEntry}`（其他欄位原樣帶著）。
  - `Result = {cand: Cand, score: number /*0..1*/, pct: number /*Math.round(score*100)*/, bold: boolean, hash: string, twins: Cand[]}`。
  - `FontId.identify(glyphs: Glyph[], cands: Cand[], {sigma = null, onProgress = null, stop = null} = {}): Promise<{results: Result[], sigma: number} | null>`：`results` 依分數由高到低、字形相同的已合併；`stop()` 為真時回傳 `null`；給了 `sigma` 就不估計；`onProgress(done, total)`。
  - `FontId.mergeResults(...lists: Result[][]): Result[]`：跨清單用 `hash` 合併同字形；主項取分數高者，同分時本機／內建優先於 Google；依分數排序。
- 比對細節（逐字照做）：
  - 候選的字：先用 100 px 的 `measureText` 量墨跡高度（≤ 1 視為缺字）；字級 P 讓墨跡高度 = `min(glyph.h, 64)`；`ctx.filter = blur(σ × min(h,64)/h)`；白底黑字；墨色 fg = 最深像素、紙色 255、門檻取中點，取最小外框，用 `gridOf` 正規化。記下 P。
  - 形狀：兩邊格子 ≥ 0.5 當墨跡，做 3-4 chamfer 距離轉換（單位：格）；d = 兩個方向平均距離的平均；`shape = exp(-d/1.5)`。
  - 墨量比 `wgt` = 兩邊墨跡格數的小比大。
  - 大小：k = 各字 `glyph.h / 候選外框高` 的中位數；`sz` = 寬的小比大 × 高的小比大（候選寬高乘上 k）。
  - 字級一致：Pm = 各字 P 的中位數；`fs = min(P, Pm)/max(P, Pm)`。同一個字型的字應該用同一個字級，x 高度、大寫高度比例不同的字型在這裡被拉開。
  - 單字分數 `shape × √wgt × sz × fs`；字型分數＝各字平均。實驗：50 種情況全對，正確字型平均領先 10.7 分。
  - 兩階段與 σ 估計照 Global Constraints；第二階段每個候選取一般與粗體中較高者，粗體多 0.02 以上 `bold = true`。
  - `hash`：第二階段一般字重各字格子以 0.5 二值化後串起來的字串雜湊。
  - 非本機字型（`source !== 'local'`）先 `await document.fonts.load(fontString(css, 50, w), 要比對的字)`。

- [ ] **Step 1: 寫失敗的測試**（掃描用 Task 2 的 `__scan`；候選＝測試機的字型家族清單，由 Node 以 `fc-list : family` 取得後傳入，加上 `{key:'builtin', css:'"PDFE Sans"', label:'思源黑體（內建）', source:'builtin'}`）

```js
const top = async (scan, cands) => A(async ([s, c]) => { const sc = __scan(s), set = FontId.glyphsFromImage(sc.canvas, sc.symbols);
  const r = await FontId.identify(set.cjk.length >= 3 ? set.cjk : set.latin, c); return r.results.map(x => ({k:x.cand.key, pct:x.pct, bold:x.bold, twins:x.twins.map(t => t.key)})); }, [scan, cands]);
let r = await top({css:'"DejaVu Serif"', text:L, px:42, blur:.8, noise:20, seed:2}, C);
check('DejaVu Serif first, ≥ 70%, ahead of others', r[0].k === 'DejaVu Serif' && r[0].pct >= 70 && r[0].pct > r[1].pct, r.slice(0, 3));
// Liberation Sans 粗體 → 第一名 Liberation Sans 且 bold
// 文泉驛正黑 → 第一名是它，twins 含「WenQuanYi Zen Hei Mono」
// PDFE Sans 中文 → 第一名 builtin
// 大字 px 150 → DejaVu Serif 第一
// Bitstream Charter 不在結果裡
// 候選全都沒有這些字（中文掃描、只給 DejaVu Serif）→ results 是空陣列
// stop() 一開始就回 true → 回傳 null
// mergeResults：本機 Liberation Serif 與當成 Google 的同一字型（同 hash）合併成一列，主項是本機
// 500+ 候選（本機清單重複 25 次、key 不同）：總時間 < 8000 ms；期間 setInterval(…, 16) 量到的最長間隔 < 150 ms
```

- [ ] **Step 2: 跑測試，確認失敗**（`identify is not a function`）。
- [ ] **Step 3: 實作 `identify`、`mergeResults`。**
- [ ] **Step 4: 跑測試通過；記下 500 候選的時間（commit 訊息寫進去）。**
- [ ] **Step 5: Commit**（`Font identification: two-stage glyph matching engine`）

### Task 4: Google Fonts 清單與載入

**Files:**
- Modify: `app/fontid.js`、`app/index.html`（第 6 行 CSP 的 `connect-src` 加 `https://fonts.googleapis.com`）、`tests/e2e/fixtures/make-test-fonts.py`
- Create: `scripts/check-google-fonts.mjs`（會連網，不放進 e2e）、`tests/e2e/fixtures/gf-test.ttf`
- Test: `tests/e2e/font-identify-engine.mjs`（第 4 部分）

**Interfaces:**
- Produces:
  - `GoogleEntry = {family: string, zh: string /* 沒有就 '' */, script: 'cjk'|'latin', bold: boolean}`；`FontId.GOOGLE: GoogleEntry[]`。
  - `FontId.requestChars(glyphs: Glyph[]): string`：去重複、依碼位排序。
  - `FontId.loadGoogle(entries: GoogleEntry[], chars: string, {fetchCss = url => fetch(url), timeout = 8000, stop = null} = {}): Promise<{cands: Cand[], failed: string[], offline: boolean}>`
    - URL：`https://fonts.googleapis.com/css2?` + 每個家族 `family=` + 名稱（空白換 `+`，其餘 `encodeURIComponent`）+（`bold` 時 `:wght@400;700`），以 `&` 串起，最後 `&text=` + `encodeURIComponent(chars)`。
    - 一批 10 個；同時最多 6 批；整批回 400 改成一個家族一個請求；仍失敗的進 `failed`。
    - `offline`：沒有任何一個請求得到回應（網路錯誤、逾時、5xx）。
    - 每個 `@font-face`（`font-family`、`font-weight`、`src: url(…)`）→ `new FontFace('PDFE GF ' + n, 'url(' + src + ')', {weight})`，`load()` 受同一逾時限制，`document.fonts.add`。同家族的兩個字重共用別名。
    - `Cand`：`{key:'google:' + family, css:'"PDFE GF n"', label: zh ? `${zh}（${family}）` : family, source:'google', entry}`。
    - 同一 `family|chars` 在這次執行快取。
  - `FontId.specimenUrl(family): string` → `'https://fonts.google.com/specimen/' + family.replace(/ /g, '+')`。
- 清單內容：
  - 中文（`script:'cjk'`）：Noto Serif TC 思源宋體、Noto Sans HK 思源黑體 香港、Noto Serif HK 思源宋體 香港、LXGW WenKai TC 霞鶩文楷 TC、LXGW WenKai Mono TC 霞鶩文楷等寬 TC、Cactus Classical Serif 仙人掌明體、Chiron Hei HK 昭源黑體、Chiron Sung HK 昭源宋體、Chiron GoRound TC 昭源甜圓體、Huninn 粉圓、Iansui 芫荽、Noto Sans JP 思源黑體 日文、Noto Serif JP 思源宋體 日文，以及漢字涵蓋繁體常用字的日文字型（Zen Maru Gothic、Zen Kaku Gothic New、Zen Old Mincho、Shippori Mincho、Kaisei Decol、Kaisei Opti、Kaisei Tokumin、Klee One、Kosugi、Kosugi Maru、M PLUS 1p、M PLUS Rounded 1c、Murecho、Sawarabi Mincho、Sawarabi Gothic、BIZ UDGothic、BIZ UDPGothic、BIZ UDMincho、BIZ UDPMincho、Yuji Syuku、Hina Mincho、Kiwi Maru、Dela Gothic One、Yomogi）。不含 Noto Sans TC（等於內建思源黑體）。
  - 英文（`script:'latin'`）：約 120 個常用家族，必含 Roboto、Open Sans、Lato、Montserrat、Poppins、Noto Sans、Noto Serif、Merriweather、Playfair Display、EB Garamond、Lora、PT Sans、PT Serif、Source Sans 3、Source Serif 4、Roboto Slab、Roboto Mono、Oswald、Raleway、Nunito、Inter、IBM Plex Sans／Serif／Mono、Libre Baskerville、Crimson Text、Courier Prime，以及和 Office 字型同尺寸的 Arimo、Tinos、Cousine、Carlito、Caladea、Gelasio。
  - `bold` 由 `scripts/check-google-fonts.mjs` 判定：它對每個家族請求 `family=F&text=Aa` 與 `family=F:wght@700&text=Aa`，名稱失敗就報錯（exit 1），`bold` 和實際不符就印出正確值。
- `gf-test.ttf`：DejaVu Serif 只留 ASCII、水平壓縮成 80%、改名「PDFE GF Test」（這台電腦沒裝的字形，給 Task 5 的假 Google 用）。

- [ ] **Step 1: 寫失敗的測試**（假 `fetchCss` 記下 URL，用 `data:font/ttf;base64,…` 回 CSS。Tinos 用 Liberation Serif 的 Regular／Bold，Arimo 用 Liberation Sans，另加 10 個假家族）

```js
check('2 batched requests', urls.length === 2, urls);
check('text= is sorted unique chars', urls.every(u => decodeURIComponent(new URL(u).searchParams.get('text')) === FontIdChars), urls[0]);
check('bold entries ask for 400;700', urls[0].includes('family=Tinos:wght@400;700') && !/Fake\+Latin\+0:wght/.test(urls[0]));
check('12 candidates usable', res.cands.length === 12 && res.cands.every(c => /^"PDFE GF \d+"$/.test(c.css) && c.hasR), res.cands.length);
// 一批裡有 'Bad Family'（假來源對含它的 URL 回 400）→ 逐一重試，failed = ['Bad Family']，其他照載
// fetchCss 丟錯 → offline: true、cands 空
// fetchCss 永不回應、timeout 300 → 2 秒內回 offline: true
// requestChars(…'Rag Rag 2025'…) === '025Rag'
// specimenUrl('Noto Serif TC') === 'https://fonts.google.com/specimen/Noto+Serif+TC'
// Liberation Serif 掃描，候選只給這兩個 Google 字型 → 第一名 google:Tinos
```

- [ ] **Step 2: 跑測試，確認失敗。**
- [ ] **Step 3: 實作；產生 `gf-test.ttf`；寫清單；`node scripts/check-google-fonts.mjs` 全部 OK（依它的輸出修正 `bold`）。**
- [ ] **Step 4: 跑測試通過。**
- [ ] **Step 5: Commit**（`Font identification: Google Fonts list and subset loader`）

### Task 5: 「字型」頁：掃描檔

**Files:**
- Modify: `app/index.html`：
  - CSS（`.ocr-ft …` 之後，約 469 行）：`.ocr-tabs`、`.ocr-fonts`、`.fi-*`，暗色模式。
  - 提示文字（約 1727 行）句尾加「結果視窗的「字型」頁會比對出可能的字型。」
  - `readRegion`（約 7189–7221 行）：兩次辨識改 `w.recognize(img, {}, {text:true, blocks:true})`。把兩次辨識的迴圈抽成 `ocrPasses(img, vert, job, onProgress)`，回傳 `{text, conf, note, img, symbols}`。影像辨識期間設 `OCR.glyphsP`，完成時寫 `OCR.glyphs`。
  - `ocrPanel`（約 7223–7255 行）：標題列頁籤、字型頁、字型頁底部列、點擊處理。
  - `closeOcr`：停掉比對（`OCR.job++` 已涵蓋），清 `OCR.glyphs`。
  - 新段落（`closeOcr` 之後）：`FONTID` 與下列函式。
  - `__pdfapp`：`fontIdState`、`fontIdGoogle`。
- Test: `tests/e2e/font-identify.mjs`（新檔，第 1 部分）

**Interfaces:**
- Consumes: `FontId.ready`、`glyphsFromImage`、`identify`、`mergeResults`、`GOOGLE`、`requestChars`、`loadGoogle`；`loadFontCatalog`、`FONTCAT`、`cssFamily`、`fontInstalled`。
- Produces:
  - `OCR.glyphs: {job, img: HTMLCanvasElement, symbols: Sym[]} | null`；`OCR.glyphsP: Promise<OCR.glyphs | null> | null`；`ocrSymbols(data): Sym[]`（攤平 `blocks → paragraphs → lines → words → symbols`）。
  - `FONTID = {tab: 'text'|'font', job: -1, recent: [{family, pct}], google: boolean, fetchCss: null|Function, timeout: 8000}`。
  - `showOcrTab(t: 'text'|'font'): void`：切到字型頁且 `FONTID.job !== OCR.job` 時呼叫 `fontIdStart()`。
  - `fontIdStart(): Promise<void>`：設 `FONTID.job = OCR.job`，清空字型頁，呼叫 `fontIdImage(job)`。Task 6 會在前面加 PDF 字型。
  - `fontIdImage(job: number): Promise<void>`：取字形（`OCR.glyphs`，否則等 `OCR.glyphsP`，否則只為取字框跑一次 `ocrPasses`）→ `glyphsFromImage` → 分組 → 每組先本機（`localCands()`）再 Google（`identify(…, {sigma: 本機那次的 sigma})`，再 `mergeResults(本機, Google)`），結果畫進 `.fi-img`，最後更新 `FONTID.recent`（本機／內建前 5 名）。`stop = () => job !== OCR.job`。
  - `localCands(): Cand[]`：先 `{key:'builtin', css:'"PDFE Sans"', label:'思源黑體（內建）', source:'builtin', family:''}`，再 `FONTCAT.fams` → `{key:'local:' + family, css:cssFamily(family), label:name || family, source:'local', family}`。
  - Google 候選＝`FontId.GOOGLE` 中同文字種類、本機沒裝（`fontInstalled`）的家族。
  - DOM：
    - 標題列 `.ocr-tabs > button[data-ot="text"|"font"]`（`.on` 表目前頁籤）。
    - 字型頁 `.ocr-fonts`：狀態列 `.fi-st`（`.fi-msg`、`.fi-bar > i`）、`.fi-pdf`（Task 6）、`.fi-img`、說明行 `.fi-note`。
    - 底部列 `.ocr-ft2`：`input[data-o="gf"]`、`button[data-o="refont"]`。
    - 組 `.fi-grp`（兩組時有 `.fi-h` 標題）。
    - 列 `.fi-row[data-key]`：內含 `.fi-sample`、`.fi-name`、`.fi-src`、`.fi-pct`，以及 `button[data-fa="apply"][data-family]` 或 `button[data-fa="download"][data-gf]`。
  - 兩組都夠字時才顯示「中文」「英數字」標題；只有一組就不顯示標題。
  - 列名：主項 `label`，加上 twins 的 `label`，以「／」連接，最多 3 個。
  - 樣字：`order` 中屬於這組的字，最多 12 個，`font-family: css, "PDFE Blank"`；粗體時 `font-weight:700`。
  - 字型頁已開時框選新範圍：`readRegion` 開始時就呼叫 `fontIdStart()`（它會等影像辨識）。
  - 頁籤記在 `FONTID.tab`，新開的結果視窗沿用。
  - `fontIdState(): {tab, busy, msg, pdf: [{name, pct, tags, action}], groups: [{title, rows: [{key, label, src, bold, pct, action}]}]}`：從 DOM 讀，`action` 是 `'apply'|'download'|''`。
  - `fontIdGoogle(fn|null, {timeout} = {})`：測試用，換掉 `FONTID.fetchCss`／`timeout`。

- [ ] **Step 1: 寫失敗的測試。** 掃描圖在 app 視窗用 canvas 畫（同 `ocr.mjs`；模糊 0.8、固定種子雜點），由 Node 放進 PDF。測試時拖框、點 `[data-ot="font"]`，等 `fontIdState().busy === false`。

```js
check('DejaVu Serif scan', s.groups[0].rows[0].label === 'DejaVu Serif' && s.groups[0].rows[0].src.includes('本機') && s.groups[0].rows[0].pct >= 70, s.groups[0].rows.slice(0, 3));
// Liberation Sans 粗體 → 第一列 Liberation Sans、bold
// 文泉驛正黑 → 第一列名稱含「文泉驛正黑」（與等寬版合併）
// 內建思源黑體 → 第一列「思源黑體（內建）」
// 中英混排一行 → 兩組標題 ['中文','英數字']，第一列各是文泉驛正黑、DejaVu Serif
// 直書文泉驛欄位（框高 > 寬 × 1.8）→ 第一列含「文泉驛正黑」
// 框到線條圖形 → msg === '這個範圍能比對的字太少，請框大一點或框清楚的字'
// gf-test 字型畫的掃描 + 假 Google（把 gf-test.ttf 當成 Gelasio）→ 有 Gelasio 列、src 含 Google Fonts、action 'download'；送出的 text 已排序且不重複
// 取消勾選「也比對 Google Fonts」再〔重新比對〕→ 假 Google 沒被呼叫；localStorage pdfeditor.fontid.v1 = {"google":false}
// 假 Google 丟錯 → msg === '連不上 Google Fonts，只比對了這台電腦的字型'，本機列照常
// Esc 後再框 → 視窗直接開在字型頁並開始比對
// 比對中立刻框另一個範圍 → 最後只有新範圍的結果，沒有 PAGEERR
```

- [ ] **Step 2: 跑測試，確認失敗。**
- [ ] **Step 3: 實作（CSS、`ocrPasses`、頁籤、`FONTID` 流程、繪製、hooks）。**
- [ ] **Step 4: 跑 `font-identify.mjs` 與 `ocr.mjs`（文字頁不能壞）都通過；看截圖確認亮／暗色模式的字型頁。**
- [ ] **Step 5: Commit**（`Font identification: 字型 tab for scans`）

### Task 6: PDF 記錄的字型

**Files:**
- Modify: `app/index.html`。`pdfTextIn` 的逐字取字邏輯抽成 `pickTextIn(i, box)`，`pdfTextIn` 與新的 `pdfFontsIn` 共用。新函式放在 `matchSystemFont` 之後。`fontIdStart` 先處理 PDF 字型。
- Test: `tests/e2e/font-identify.mjs`（第 2 部分）

**Interfaces:**
- Consumes: `pageTextItems`、`boxHit`、`matchSystemFont`、`FONTCAT`、`fontLabel`、`fontInstalled`、`FontId.GOOGLE`、`fontIdImage`（Task 5）。
- Produces:
  - `pickTextIn(i, box): Promise<TextItem[]>`（只留框內的字，`str`、`a0`、`a1` 已裁切，和現在 `pdfTextIn` 的規則相同）。
  - `pdfFontsIn(i, box): Promise<{fonts: PdfFont[], hidden: number}>`
    - `PdfFont = {key, name, chars: number, embedded: boolean, generic: boolean, local: {family, label, alias: boolean} | null, google: GoogleEntry | null}`。
    - 依 `chars` 由多到少排序。
    - 字型名稱（去掉子集前綴後）為 `GlyphLessFont` 的項目只算進 `hidden`，不列出。
  - `decodeFontName(raw: string): string[]`：全部 < 0x80 時只回 `[raw]`；否則依序用 `TextDecoder(…, {fatal:true})` 試 `utf-8`、`big5`、`gbk`、`shift_jis`，回傳成功的結果。
  - `STD_FONT_ALIAS = {Helvetica: ['Arial', 'Liberation Sans', 'Arimo'], Times: ['Times New Roman', 'Liberation Serif', 'Tinos'], Courier: ['Courier New', 'Liberation Mono', 'Cousine']}`。查表用名稱在 `-`、`,` 之前的部分，第一個有裝的就用。
  - `googleByName(name: string): GoogleEntry | null`：去掉空白、`-`、`_` 與字重尾巴（同 `matchSystemFont` 的 regex）後比對。
- 規則：
  - 字型資料來自 `pg.page.commonObjs.get(t.font)`：`name`、`missingFile`（→ `embedded = !missingFile`）、`isType3Font`。
  - 名稱整理：去掉 `^[A-Z]{6}\+` 與 `(.)-\d+$`。
  - `generic`：Type 3、空名稱，或符合 `/^(?:[A-Z]{1,3}\d+|Font\d*|CIDFont\+F\d+)$/i`。
  - 本機對應：每個解碼結果依序試 `matchSystemFont(name)`，再試 `FONTCAT.fams.find(f => f.name === name)`。第一個對到的解碼結果就是顯示名稱；都沒對到時用第一個解碼結果。之後才查 `STD_FONT_ALIAS`（`alias: true`），再查 Google。
  - 繪製（`.fi-pdf`）：
    - 標題「PDF 記錄的字型」，每個字型一列（`.fi-row`）。
    - 名稱：本機對到時是 `fontLabel`，原名不同時括號附原名；`alias` 時寫「〔原名〕，以 〔字型〕 代替」。
    - 「100%」；標籤「已內嵌」／「未內嵌」。
    - 按鈕：本機 → 〔套用〕；Google → 〔下載〕；都沒有 → `.fi-none`「這台電腦沒有」。
    - `generic` 的列只寫「PDF 沒有記錄字型名稱」，沒有 % 和按鈕。
    - 列表下方是 `button[data-o="byshape"]`〔用字形比對找相似字型〕，按下去呼叫 `fontIdImage(OCR.job)`，結果畫進 `.fi-img`。
  - `fontIdStart`：`fonts` 不是空的就畫 PDF 區後停住，等使用者按〔用字形比對找相似字型〕；`fonts` 是空的而 `hidden > 0`，或框裡沒有文字，就直接 `fontIdImage(job)`。

- [ ] **Step 1: 寫失敗的測試。** 測試 PDF 由 Node 的 pdf-lib 產生，一行一種情況。改名的做法：先存檔，再用 pdf-lib 重新載入，改所有 `/BaseFont` 與 `/FontName` 後存檔。

```js
check('embedded DejaVu Serif', p[0].name.includes('DejaVu Serif') && p[0].pct === 100 && p[0].tags.includes('已內嵌') && p[0].action === 'apply', p);
// BaseFont 改成 Big5 位元組的「新細明體」→ name 含「新細明體」、action ''（這台電腦沒有）
// StandardFonts.Helvetica → name 含「Helvetica，以 Liberation Sans 代替」、tags 含「未內嵌」、action 'apply'
// BaseFont 'ABCDEF+LXGWWenKaiTC-Regular' → action 'download'
// BaseFont 'F1' → name === 'PDF 沒有記錄字型名稱'
// 掃描圖上疊 Tr 3（隱形）的 GlyphLessFont 文字 → pdf 區沒有列，直接出現影像比對，第一列 DejaVu Serif
// 第一行按〔用字形比對找相似字型〕→ 影像比對第一列 DejaVu Serif
```

- [ ] **Step 2: 跑測試，確認失敗。**
- [ ] **Step 3: 實作。** 先用測試確認 pdf.js 對 Helvetica 的 `missingFile` 是 `true`。如果不是，改看 PDF 字型描述有沒有 `FontFile`／`FontFile2`／`FontFile3`：用 pdf-lib 讀 `S.bytes`，依頁面資源找字型，只在這個函式內做。
- [ ] **Step 4: 跑測試通過；`ocr.mjs` 仍通過（`pickTextIn` 重構不改行為）。**
- [ ] **Step 5: Commit**（`Font identification: fonts recorded in the PDF`）

### Task 7: 套用、下載、字型選單「字型辨識結果」

**Files:**
- Modify: `app/index.html`：
  - 字型頁的點擊處理：`data-fa`。
  - 新函式 `applyIdentifiedFont`、`openFontPage`。
  - `fontMenuList`（約 4052 行）：「預設」之後加一區。
- Test: `tests/e2e/font-identify.mjs`（第 3 部分）

**Interfaces:**
- Consumes: Task 5／6 的列與按鈕（`data-family`、`data-gf`）、`FONTID.recent`、`TB_STYLE`、`saveTB`、`toast`、`fontLabel`、`fontInstalled`、`DESK.openExternal`。
- Produces:
  - `applyIdentifiedFont(family: string /* '' = 思源黑體 */): void`：`TB_STYLE.font = family; saveTB();` toast「已設為文字方塊的預設字型：〔名稱〕」。
  - `openFontPage(family: string, row: HTMLElement): void`：`DESK ? DESK.openExternal(url) : window.open(url, '_blank', 'noopener')`，`url = FontId.specimenUrl(family)`；該列加 `.fi-hint`「安裝後重新開啟 PDF 工作台，再比對一次就能套用」。
  - `fontMenuList`：`FONTID.recent` 中 `family === ''` 或 `fontInstalled(family)` 的項目 → `sec('字型辨識結果')`。每一項用 `item(family, `${名稱}　${pct}%`)`，名稱是 `fontLabel(family)`，`''` 時是「思源黑體」。
  - `FONTID.recent` 也收 PDF 區對到的本機字型（`pct: 100`），排在影像結果前面，合計最多 5 個、家族不重複。

- [ ] **Step 1: 寫失敗的測試**

```js
await win.click('#ocrPanel .fi-row [data-fa="apply"]');
check('套用 sets the default font', (await A(() => window.__pdfapp.tbStyle().font)) === 'DejaVu Serif');
// toast 文字含「已設為文字方塊的預設字型」
// 切到文字方塊工具、開字型選單 → .fm-sec 有「字型辨識結果」，其後第一項 data-f="DejaVu Serif"、文字含「%」
// 內建思源黑體那一列套用 → tbStyle().font === ''
// PDF 區 Helvetica（以 Liberation Sans 代替）套用 → 'Liberation Sans'
// 主行程 stub：app.evaluate(({shell}) => { shell.openExternal = async u => { globalThis.__opened = u; }; })
//   按 Gelasio 的〔下載〕→ __opened === 'https://fonts.google.com/specimen/Gelasio'，該列出現 .fi-hint
```

- [ ] **Step 2: 跑測試，確認失敗。**
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 跑 `font-identify.mjs`、`textbox-font.mjs`（字型選單不能壞）通過。**
- [ ] **Step 5: Commit**（`Font identification: apply, download and the font menu section`）

### Task 8: 文件、全部測試、最後檢查、發佈

**Files:**
- Modify: `HANDOFF.md`、`RELEASE_NOTES.md`、`package.json`、`package-lock.json`

- [ ] **Step 1: 更新 `HANDOFF.md`。**
  - 版本表加 1.0.28。
  - 新增「字型辨識」一節：`app/fontid.js` 的角色、空白字型、逐字框、兩階段比對、Google 清單與 `scripts/check-google-fonts.mjs`。
  - localStorage 加 `pdfeditor.fontid.v1`。
  - 測試表加兩個新檔。
  - 限制：
    - 新裝的字型要重開程式才讀得到。
    - 幾乎一樣的字型分數非常接近。
    - Google 清單會過時。
    - 送到 Google 的是排序過、不重複的字。
- [ ] **Step 2: 跑 `npm run check` 與 `npm run test:e2e`，讀每個檔的輸出（不只看 ✓），全部通過。**
- [ ] **Step 3: 最後檢查。** 派一個全新的 reviewer subagent，看 `main..wip/fontid` 的完整 diff，對照 spec。要修的項目先寫失敗的測試再修，修完重跑 Step 2。
- [ ] **Step 4: 預覽截圖**（亮色、暗色；掃描與 PDF 文字各一張）存到 scratchpad，傳給使用者。
- [ ] **Step 5: 發佈。**
  - 合併到 `main`（fast-forward）。
  - `package.json`／`package-lock.json` 版本改 1.0.28；`RELEASE_NOTES.md` 寫給使用者看的中文說明。
  - commit 後推 Forgejo `main`。
  - 輪詢 `https://forgejo.taiyopen.com/api/v1/repos/tsukiinuhibi/PDFEditor/releases/tags/v1.0.28`，直到出現 `latest.yml`。
  - 給使用者下載連結 `https://forgejo.taiyopen.com/tsukiinuhibi/PDFEditor/releases/download/v1.0.28/PDFEditor-Setup-1.0.28.exe`。
  - 刪除 `wip/fontid`（本機與遠端）。
