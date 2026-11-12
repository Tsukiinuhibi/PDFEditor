# 文字方塊選字型（v1.0.25）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 文字方塊可以從系統安裝的字型中選字型，字型存進文字方塊的格式資料與外觀圖片。

**Architecture:** 全部寫在單檔 renderer `app/index.html`（專案慣例）。新增一段「系統字型目錄」（`queryLocalFonts()` + fontkit 讀名稱、分析結果快取在 localStorage），文字方塊的 run 多一個 `font` 欄位，格式列與右鍵選單加一個字型浮動選單 `#fontMenu`。

**Tech Stack:** Electron 45（Chromium `queryLocalFonts`）、`@pdf-lib/fontkit` 1.1.1（全域 `fontkit`）、playwright-core 端對端測試。

**Spec:** `docs/superpowers/specs/2026-11-12-font-picker-design.md`

## Global Constraints

- 介面文字一律繁體中文（台灣）；commit 訊息英文，結尾加專案規定的 Co-Authored-By／Claude-Session 兩行。
- 工作在 `wip/fonts` 分支，**不要推 main**（main 上 package.json 一改就會發佈）。使用者看過預覽、同意後才合併。
- 文件的每個修改都經過 `mutate()`；新註解經過 `addAnnot()`。
- 工具列按鈕全彩、滑過黃色；深色主題要看得清楚（字型選單也一樣用 CSS 變數 `--surface`、`--ink`、`--line2`）。
- 預設字型堆疊（逐字）：`TB_FONT = '"PDFE Sans","Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif'`。
- 顯示名稱語言優先順序：`zh-TW` → `zh-HK` → `zh-MO` → `zh` → `zh-SG` → `en`；家族名優先 nameID 16（typographic family），沒有再用 nameID 1。
- 中文字型判定：`中文字體` 四個字都有字形。
- localStorage 鍵：字型分析快取 `pdfeditor.fontcat.v1`（鍵 `family|postscriptName` → `{name, cjk}`）；最近用過 `pdfeditor.fonts.recent.v1`（最多 8 個）；預設字型記在既有的 `pdfeditor.textbox.v1` 的 `font`。
- 分組標題逐字：「預設」「最近用過」「中文字型」「其他字型」；預設項目文字「思源黑體（預設）」；缺字型後綴「（這台電腦沒有）」；分析中「正在讀取字型…」；讀不到「讀不到這台電腦的字型」；右鍵選單項目「字型…」；格式列標籤「字型」。
- 字型分析一次只做一個字型（不可並行讀多個大字型檔）。

## Review Focus

1. **字型很多（Windows 上 500 個家族以上）**：打開選單、搜尋都要即時（< 300 ms），不能每打一個字就卡住。→ Task 3 測試注入 600 個假家族量開啟與搜尋時間。
2. **家族名裡有引號、反斜線、逗號**（例如 `Font "X", Y`）：CSS 不能壞、存回去要一字不差。→ Task 2 測試用這種名稱來回存取。
3. **在搜尋框打字、點選單項目時，編輯器的反白不能消失**：只改原本反白的字，不能套到整個方塊或什麼都沒改。→ Task 3 測試走真正的 UI（點按鈕、打字搜尋、點項目）。
4. **最近用過的字型後來被移除了**：不能出現在「最近用過」裡讓人點了沒反應。→ Task 3 測試在 recent 放一個不存在的名稱。
5. **游標在文字中間、沒有反白時換字型**：之後打的字要是新字型，前面的字不變。→ Task 2 測試。

---

### Task 1: 系統字型目錄

**Files:**
- Modify: `app/index.html`（在 `/* Inline rich-text boxes */` 段落之前新增 `/* System fonts (字型清單) */` 段落；`window.__pdfapp` 加 hooks）
- Test: `tests/e2e/textbox-font.mjs`（新檔，本 task 先寫第 1 部分）

**Interfaces:**
- Produces:
  - `const FONTCAT = {ok:null|boolean, fams:FontFam[], busy:boolean, subs:Set<() => void>}`；`FontFam = {family:string, ps:string, name:string, cjk:boolean|null}`（`cjk:null` 表示還沒分析）。
  - `loadFontCatalog(): Promise<void>`：可重複呼叫（只做一次）；取得清單後立刻 resolve，背景開始分析；每批分析完呼叫所有 `FONTCAT.subs`。
  - `fontAnalysisDone(): Promise<void>`：全部分析完時 resolve。
  - `fontLabel(family: string): string`：顯示名稱（找不到就回傳 family 本身）。
  - `fontInstalled(family: string): boolean`。
  - hooks：`__pdfapp.fontCat = () => ({ok:FONTCAT.ok, fams:FONTCAT.fams.map(f => ({...f}))})`、`__pdfapp.fontReady = () => loadFontCatalog().then(fontAnalysisDone)`。

- [ ] **Step 1: 寫失敗的測試（textbox-font.mjs 第 1 部分）**

檔案開頭建立小工具 `check(name, ok, detail)`：印出 `✔/✘ name detail`，失敗時 `process.exitCode = 1`（run.mjs 會因此標成 ✗）。

```js
await A(() => window.__pdfapp.fontReady());
const cat = await A(() => window.__pdfapp.fontCat());
const wqy = cat.fams.find(f => f.family === 'WenQuanYi Zen Hei'), dv = cat.fams.find(f => f.family === 'DejaVu Serif');
check('catalog ok', cat.ok === true && cat.fams.length >= 10, cat.fams.length);
check('zh name from .ttc', wqy && wqy.name === '文泉驛正黑' && wqy.cjk === true, JSON.stringify(wqy));
check('latin font', dv && dv.name === 'DejaVu Serif' && dv.cjk === false, JSON.stringify(dv));
check('cache written', await A(() => Object.keys(JSON.parse(localStorage.getItem('pdfeditor.fontcat.v1') || '{}')).length) >= cat.fams.length);
```

第二次啟動 App（同一個 profile）後：`fontCat()` 在 `loadFontCatalog()` resolve 的當下（不等 `fontAnalysisDone`）就已經有 `name === '文泉驛正黑'` → `check('cache used on 2nd launch', …)`。

- [ ] **Step 2: 跑測試確認失敗**

Run: `node tests/e2e/run.mjs textbox-font`
Expected: ✗，`PAGEERR` 或 `window.__pdfapp.fontReady is not a function`。

- [ ] **Step 3: 實作字型目錄**

- `queryLocalFonts()` 不存在或丟錯 → `FONTCAT.ok = false`、`fams = []`。
- 依 `family` 分組，代表字面：`style` 為 Regular／Normal／Book／Roman 者優先，否則第一個；`fams` 依 `family` 排序。
- 讀快取填 `name`／`cjk`；沒快取的先 `name = family, cjk = null`，排進背景佇列。
- 背景佇列一次一個：`new Uint8Array(await (await face.blob()).arrayBuffer())` → `fontkit.create(bytes, ps)` → 名稱取 `font.name.records.preferredFamily || fontFamily` 依語言順序，`cjk = [...'中文字體'].every(ch => font.hasGlyphForCodePoint(ch.codePointAt(0)))`。失敗就 `{name:family, cjk:false}`。每個做完寫回快取、通知 `subs`（用 `requestAnimationFrame` 合併通知）。

- [ ] **Step 4: 跑測試確認通過**

Run: `node tests/e2e/run.mjs textbox-font`
Expected: ✓，所有 `✔`。

- [ ] **Step 5: Commit**

```bash
git add app/index.html tests/e2e/textbox-font.mjs
git commit -m "Font catalogue from the system fonts, with Chinese names and a cache"
```

### Task 2: 文字方塊的 `font` 格式與預設字型

**Files:**
- Modify: `app/index.html`：`TB_DEF`（加 `font:''`）、`.tbed` CSS font-family、`runsToHTML`、`htmlToRuns`、`runFont`、`renderTextBox`、`richTextXHTML`、`applyTextFormat`、`currentTBStyle`；新增 `TB_FONT`、`cssFamily()`；hooks
- Test: `tests/e2e/textbox-font.mjs`（第 2 部分）

**Interfaces:**
- Consumes: `fontInstalled(family)`（Task 1）。
- Produces:
  - run 物件多 `font?: string`（空字串或沒有 = 預設）。
  - `TB_FONT`（見 Global Constraints）。
  - `cssFamily(family: string): string`：回傳可放進 CSS／canvas 的家族字串（`"` 與 `\` 跳脫後加雙引號）。
  - `applyTextFormat('font', family: string)`：規則與字級相同；`currentTBStyle().font` 回傳游標處字型。
  - hook `__pdfapp.tbRT = async i => [{id, rt}]`：第 i 頁每個 FreeText 的 `PDFE_RT`（解析後的 JSON）。

- [ ] **Step 1: 寫失敗的測試（第 2 部分）**

用 hooks 操作（不經過 UI）：在新文字方塊打 `你好世界 Hello`，`Shift+ArrowLeft` ×5 反白 `Hello`，`applyTextFormat('font','DejaVu Serif')`，Esc 送出，等存檔：

```js
const rt = (await A(() => window.__pdfapp.tbRT(0))).pop().rt;
check('only the selection', JSON.stringify(rt.lines[0].map(r => [r.text, r.font || ''])) === JSON.stringify([['你好世界 ', ''], ['Hello', 'DejaVu Serif']]));
```

- 外觀不同：同樣文字、全部預設字型的另一個方塊，`renderRegion` 兩塊比對像素差異 > 0 → `check('appearance uses the font', …)`。
- 再次編輯（`textboxAt` 點同一位置）：`TBE().html` 含 `font-family` 與 `DejaVu Serif`；游標放在 Hello 裡，`currentTBStyle().font === 'DejaVu Serif'`。
- 怪名稱：`applyTextFormat('font', 'Font "X", Y\\Z')` 存回去 `rt` 的 `font` 一字不差（Review Focus 2）。
- 游標在中間：在 `你好` 後面放游標（無反白）、`applyTextFormat('font','DejaVu Serif')`、打 `AB` → `rt` 裡 `AB` 是 DejaVu Serif、`你好` 與後面的字仍是預設（Review Focus 5）。
- 沒反白、空方塊選字型 → `JSON.parse(localStorage['pdfeditor.textbox.v1']).font === 'DejaVu Serif'`，新方塊打字送出後 run 的 font 是 DejaVu Serif；最後 `applyTextFormat('font','')` 還原。
- 修改原文（`edit-page-text` 的方式點原文進編輯器、改一個字送出）：寫出的 `lines` 裡所有 run 的 `font` 都是空的。

- [ ] **Step 2: 跑測試確認失敗**

Run: `node tests/e2e/run.mjs textbox-font`
Expected: ✗（`tbRT is not a function` 或 `only the selection ✘`）。

- [ ] **Step 3: 實作**

- `.tbed` 的 font-family 改用和 `TB_FONT` 相同的堆疊；`runFont` 用 `r.font ? cssFamily(r.font) + ',' + TB_FONT : TB_FONT`。
- `htmlToRuns`：從計算後的 `font-family` 取第一個家族（處理引號與跳脫）；等於 `PDFE Sans` 或 root 是 `.real` 時記成 `''`；合併 run 的比較鍵加 `font`。
- `applyTextFormat('font', v)`：反白 → `execCommand('fontName', false, v || 'PDFE Sans')`；空方塊 → 改 `TBE.el.style.fontFamily`；只有游標 → 比照字級插入帶 `font-family` 的零寬 span。
- `renderTextBox`：畫之前 `document.fonts.load` 每個用到的家族（含 `PDFE Sans`），失敗忽略。
- `richTextXHTML`／`runsToHTML`：有 `font` 時加 `font-family`。

- [ ] **Step 4: 跑測試確認通過**

Run: `node tests/e2e/run.mjs textbox`
Expected: textbox-font、textbox-basic、textbox-image-drop 都 ✓。

- [ ] **Step 5: Commit**

```bash
git add app/index.html tests/e2e/textbox-font.mjs
git commit -m "Text box runs carry a font; the bundled Noto Sans TC is the default"
```

### Task 3: 字型選單 UI

**Files:**
- Modify: `app/index.html`：新增 `#fontMenu` 元素與 CSS；`textBarHTML`（「字型」按鈕放在字級前）；`#hint` click handler；`showTextMenu`（加「字型…」）；`document` 的 pointerdown 提交判斷加上 `#fontMenu`；修改原文（`TBE.el.classList.contains('real')`）時不顯示字型項目
- Test: `tests/e2e/textbox-font.mjs`（第 3 部分）

**Interfaces:**
- Consumes: `FONTCAT`、`loadFontCatalog()`、`fontLabel()`、`fontInstalled()`（Task 1）；`applyTextFormat('font', v)`、`currentTBStyle().font`、`cssFamily()`（Task 2）。
- Produces:
  - `openFontMenu(anchor: HTMLElement|null, at?: {left, top, bottom})`：打開選單；`closeFontMenu()`。
  - 選單 DOM：`#fontMenu input.fm-q`（搜尋）、`.fm-sec`（分組標題）、`button.fm-it[data-f="<family>"]`（預設項目 `data-f=""`）、`.fm-busy`、`.fm-none`。
  - `noteRecentFont(family: string)`：寫入 `pdfeditor.fonts.recent.v1`（去重、最新在前、最多 8 個）。
  - 格式列按鈕 `#hint button[data-tbfont]`，文字是游標處字型的顯示名稱（缺字型時加「（這台電腦沒有）」）。
  - 測試 hooks：`__pdfapp.fontCatFake(n: number, ok = true)` 把目錄換成 n 個假家族 `Fake Font 000…`（`ok:false` 模擬讀不到系統字型）；`__pdfapp.fontCatReload()` 重新讀真目錄。

- [ ] **Step 1: 寫失敗的測試（第 3 部分）**

全部走 UI：
- 打字 `中文 Latin`，`Shift+ArrowLeft` ×5 反白 `Latin`，點 `#hint [data-tbfont]` → `#fontMenu` 出現，分組依序為 `預設、中文字型、其他字型`（`最近用過` 此時只在 recent 有已安裝字型時出現），`button[data-f="WenQuanYi Zen Hei"]` 的文字是 `文泉驛正黑`、在「中文字型」之下。
- 在 `.fm-q` 打 `文泉` → 可見項目全都是文泉驛家族；清空後打 `dejavu serif` → 看得到 DejaVu Serif。
- 點 `DejaVu Serif` → 選單關閉，編輯器仍開著；送出後 `rt` 只有 `Latin` 帶 font（Review Focus 3）；`#hint [data-tbfont]` 在游標位於 Latin 時顯示 `DejaVu Serif`。
- 「最近用過」：`localStorage['pdfeditor.fonts.recent.v1']` 設 `["No Such Font 123","DejaVu Serif"]`，打開選單 → 「最近用過」只有 DejaVu Serif（Review Focus 4）。
- 缺字型：用 hook 讓某個方塊 run 的 font 為 `No Such Font 123`（`applyTextFormat` 寫入後存檔），再次編輯、游標放在那段 → 按鈕文字 `No Such Font 123（這台電腦沒有）`；不換字型直接送出 → `rt` 仍是 `No Such Font 123`。
- 右鍵編輯器 → `#ctx` 有 `字型…`，點了打開 `#fontMenu`。
- 修改原文時 `#hint [data-tbfont]` 不存在、右鍵選單沒有 `字型…`。
- 大量字型：`A(() => { FONTCAT.fams = …600 個假家族… })`（`fontCatFake(600)`），量 `openFontMenu` 到畫完的時間 < 300 ms、在搜尋框打一個字到更新完 < 300 ms（Review Focus 1）；測完重新載入真目錄。
- 讀不到系統字型：`fontCatFake(0, false)` 後打開選單 → 只有預設項目，並顯示「讀不到這台電腦的字型」；接著 `fontCatReload()`。
- 截圖 `font_menu.png`（淺色）與切深色主題後 `font_menu_dark.png` 給預覽用。

- [ ] **Step 2: 跑測試確認失敗**

Run: `node tests/e2e/run.mjs textbox-font`
Expected: ✗（找不到 `#hint [data-tbfont]`）。

- [ ] **Step 3: 實作**

- 選單做成和 `#cpMenu` 同樣的浮動視窗（定位在按鈕下方、保持在視窗內）；Esc 或點選單外面關閉；`pointerdown` 在選單上 `preventDefault`（搜尋框除外），讓編輯器的反白保留。
- 清單一次產生 HTML 字串、`innerHTML` 一次寫入；搜尋只切換項目的 `hidden`（比對 `name` 與 `family`，不分大小寫）。
- 選單開著時訂閱 `FONTCAT.subs`：分析有進度就重畫清單，但保留捲動位置與搜尋字。
- 每個項目 `style="font-family:${cssFamily(f.family)},${TB_FONT}"`；預設項目用 `TB_FONT`。
- 點項目：`applyTextFormat('font', family)`、`noteRecentFont(family)`（預設不記）、關閉選單。

- [ ] **Step 4: 跑測試確認通過**

Run: `node tests/e2e/run.mjs textbox`
Expected: 三個 textbox 測試都 ✓；看一眼兩張截圖（淺色、深色都清楚）。

- [ ] **Step 5: Commit**

```bash
git add app/index.html tests/e2e/textbox-font.mjs
git commit -m "Font menu in the text box format bar and the right-click menu"
```

### Task 4: 發佈準備（不推 main）

**Files:**
- Modify: `HANDOFF.md`（文字方塊段落加字型說明、localStorage 鍵、測試表加 textbox-font、版本表 1.0.25、待辦清單）、`RELEASE_NOTES.md`（v1.0.25，給使用者看的繁中說明）、`package.json`／`package-lock.json`（1.0.25）

- [ ] **Step 1: 全部檢查**

Run: `npm run check && npm run test:e2e`
Expected: `ok app/index.html`；`all 21 ran cleanly`，逐一讀印出的結果（特別是 textbox-basic、edit-page-text、edit-page-text-real 的數值與先前相同）。

- [ ] **Step 2: 改版本、寫說明、更新 HANDOFF**

- [ ] **Step 3: Commit 並推 `wip/fonts`**

```bash
git add -A && git commit -m "v1.0.25: choose a font for text boxes (preview)"
git push -u origin wip/fonts
```

- [ ] **Step 4: 給使用者看預覽**（字型選單淺色／深色截圖、選了字型的文字方塊），等同意後才合併 main 發佈。
