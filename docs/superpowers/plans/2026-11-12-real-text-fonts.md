# 修改原文選系統字型（v1.0.27）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修改原文時可以選系統字型，存檔時把用到的字以子集嵌入 PDF，文字仍是真正的頁面文字。

**Architecture:** 全部在 `app/index.html`（專案慣例）。字型目錄（v1.0.26）多記授權、直書、檔案大小與每個字面；新的「字型取得」層把系統字型（含 .ttc 拆出的字面）交給 pdf-lib 嵌入，並修正 fontkit 子集化的短 `loca` 問題；`layoutReal`／`writePageText` 從「只用思源黑體」改成「每段 run 用自己的字型」；編輯器在修改原文時開放字型選單，並在存檔前檢查缺字。

**Tech Stack:** Electron 45（`queryLocalFonts`、`FontFace`、CSS）、pdf-lib 1.17 + `@pdf-lib/fontkit` 1.1.1、pdf.js 4.10、playwright-core 端對端測試、fonttools（只在開發時產生測試字型）。

**Spec:** `docs/superpowers/specs/2026-11-12-real-text-fonts-design.md`

## Global Constraints

- 介面文字繁體中文（台灣）；commit 訊息英文，結尾加專案規定的 Co-Authored-By／Claude-Session 兩行。
- 工作在 `wip/realfont`，**不要推 main**；預覽給使用者看、同意後才發佈。
- 文件的修改都經過 `mutate()`；修改原文的區塊格式（`/PDFE_Text` BDC、`PDFE_RT`、`PDFE_M`、`PDFE_Fonts`）不變，只是 `PDFE_Fonts` 可能列出更多字型資源。
- 授權判斷（OS/2 `fsType`）：Restricted（0x0002）或 Bitmap only（0x0200）→ `embed:'no'`；No subsetting（0x0100）→ `embed:'full'`；其他 → `embed:'ok'`。
- 直書資料：`vhea`、`vmtx`、GSUB 的 `vert` 三者都有才算 `vert:true`。
- 字型目錄快取鍵改為 `pdfeditor.fontcat.v2`。
- 假粗體：PDF 文字繪製模式 `2 Tr`，描邊寬 0.03 em（`w` = 0.03 × 字級），描邊色 = 填色。
- 逐字的文案：
  - 選單灰掉的原因：「授權不允許嵌入」「沒有直書資料」
  - 整個嵌入提醒：標題「整個字型會放進檔案」，內文「『〔字型名〕』的授權要求把整個字型放進 PDF，檔案會增加約 N MB。要使用嗎？」，按鈕〔取消〕〔使用〕（N 取一位小數）
  - 缺字提醒：標題「字型裡沒有這些字」，內文「『〔字型名〕』裡沒有這些字：〔字，最多 20 個，用「、」分隔〕」，按鈕〔回去修改〕〔這些字改用思源黑體〕
  - 讀不到字型：toast「讀不到字型〔字型名〕，這段文字改用思源黑體」
- 測試用的字型檔放在 `tests/e2e/fixtures/`，由 `tests/e2e/fixtures/make-test-fonts.py`（fonttools）產生並一起 commit；字型檔都從 `app/fonts/NotoSansTC-Regular.ttf` 取小子集（OFL）。

## Review Focus

1. **同一個區塊重複修改多次**：頁面的字型資源不應越積越多（舊區塊的字型要跟著區塊一起清掉）。→ Task 3 測試：同一段改三次後，頁面 `/Font` 資源數不變。
2. **一段文字混用多種字型＋粗體**：同一個（字型、粗細）只嵌入一次。→ Task 3 測試：數 `FontFile2`／`FontFile3` 的 BaseFont，每個（家族、粗細）各一個。
3. **把用某字型的字全部刪掉再存**：不該嵌入空的子集、不該出錯。→ Task 3 測試。
4. **字型檔讀不到**（被移除、權限）：不能卡住或寫壞，要 toast 並改用思源黑體。→ Task 3 測試（測試字型註冊後把它的檔案設成壞的）。
5. **自動對應到的系統字型和原文字型版本不同（字寬不同）**：整行用新字型重排，不能和原本的字重疊。→ Task 4 測試：改完後頁面上同一行的文字項目不重疊。

---

### Task 1: 字型目錄 v2 與測試字型

**Files:**
- Modify: `app/index.html`（System fonts 段落：`analyseFont`、`loadFontCatalog`、`FONTCAT_KEY`；`__pdfapp` hooks）
- Create: `tests/e2e/fixtures/make-test-fonts.py`、`tests/e2e/fixtures/{vert-test,nosubset-test,restricted-test,oddglyph-test}.ttf`
- Test: `tests/e2e/edit-page-text-fonts.mjs`（新檔，第 1 部分）

**Interfaces:**
- Produces:
  - `analyseFont(fam, face)` 回傳 `{name, cjk, embed:'ok'|'full'|'no', vert:boolean, bytes:number} | null`（`bytes` = 字型檔位元組數）。
  - `FontFam` 多 `embed`、`vert`、`bytes`，以及 `faces:[{ps, style, full}]`（這個家族在 `queryLocalFonts()` 裡的所有字面）。
  - `registerTestFont({family, b64, style = 'Regular'}): Promise<void>`（hook）：把位元組加進 `document.fonts`（`new FontFace(family, bytes, {weight})`）、加進 `FONTCAT.fams`（經過 `analyseFont`）、記在 `TEST_FONTS`（`Map<family|style, Uint8Array>`，Task 2 讀它）。
- 測試字型（`make-test-fonts.py` 產生）：
  - `vert-test.ttf`：家族「PDFE Vert Test」，字「直書測試字型，。「」ABC」，保留 GSUB `vert`、`vhea`、`vmtx`。
  - `nosubset-test.ttf`：家族「PDFE NoSubset Test」，`fsType = 0x0100`。
  - `restricted-test.ttf`：家族「PDFE Restricted Test」，`fsType = 0x0002`。
  - `oddglyph-test.ttf`：家族「PDFE Odd Test」，字「奇數長度測試ABC」，`glyf.padding = 1`（字形長度可為奇數、長格式 `loca`）。

- [ ] **Step 1: 產生測試字型，寫失敗的測試**

```js
const an = (family, file) => A(a => window.__pdfapp.fontAnalyse(a), {family, ps:'', b64:fs.readFileSync(file).toString('base64')});
check('ok font', (r => r.embed === 'ok' && r.vert === false)(await an('DejaVu Serif', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf')));
check('no-subsetting font', (await an('PDFE NoSubset Test', FIX + '/nosubset-test.ttf')).embed === 'full');
check('restricted font', (await an('PDFE Restricted Test', FIX + '/restricted-test.ttf')).embed === 'no');
check('vertical data', (await an('PDFE Vert Test', FIX + '/vert-test.ttf')).vert === true);
check('no vert feature', (await an('WenQuanYi Zen Hei', '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc')).vert === false);
check('bytes counted', (await an('DejaVu Serif', '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf')).bytes === fs.statSync('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf').size);
// faces of a family, cache v2
const dv = (await A(() => window.__pdfapp.fontCat())).fams.find(f => f.family === 'DejaVu Serif');
check('faces listed', dv.faces.some(x => /bold/i.test(x.style)) && dv.faces.some(x => /^(book|regular)$/i.test(x.style)));
check('cache v2', await A(() => !!localStorage.getItem('pdfeditor.fontcat.v2')));
// a test font can be registered
await A(b64 => window.__pdfapp.registerTestFont({family:'PDFE Vert Test', b64}), b64Of(FIX + '/vert-test.ttf'));
check('test font listed', (await A(() => window.__pdfapp.fontCat())).fams.some(f => f.family === 'PDFE Vert Test' && f.vert));
```

- [ ] **Step 2: 跑測試確認失敗** — Run: `node tests/e2e/run.mjs edit-page-text-fonts` → ✗（`embed` 為 undefined）。

- [ ] **Step 3: 實作** — `fsType` 用 fontkit 的 `font['OS/2'].fsType`（`noEmbedding`、`bitmapOnly`、`noSubsetting`）；`vert` 看 `font.directory.tables` 的 `vhea`、`vmtx` 與 `font.GSUB.featureList` 是否有 `vert`；`bytes` 是讀到的檔案長度；`faces` 在列出清單時就記下（不讀檔）。

- [ ] **Step 4: 跑測試確認通過**；再跑 `node tests/e2e/run.mjs textbox-font`（字型目錄的舊測試）也要 ✓。

- [ ] **Step 5: Commit** — `Font catalogue v2: embedding rights, vertical data, faces; test fonts`

### Task 2: 取得可嵌入的字型檔

**Files:**
- Modify: `app/index.html`（新段落 `/* Embedding system fonts */`，放在修改原文段落 `RF` 之前）
- Test: `tests/e2e/edit-page-text-fonts.mjs`（第 2 部分）

**Interfaces:**
- Consumes: `FONTCAT`、`FontFam.faces`、`TEST_FONTS`（Task 1）。
- Produces:
  - `systemFontBytes(family: string, bold: boolean): Promise<{bytes: Uint8Array, synthetic: boolean}>`：先找 `TEST_FONTS`，再找 `queryLocalFonts()` 的字面（粗體找 style 含 Bold 的字面；沒有就用一般字面並 `synthetic:true`）；.ttc 經 `sfntFromCollection` 拆出；同一次執行快取。讀不到就丟出錯誤。
  - `sfntFromCollection(bytes: Uint8Array, ps: string): Uint8Array`：用 fontkit 找出 PostScript 名稱相同（找不到用第一個）的字面在集合中的索引，從 TTC 標頭取它的表格目錄，複製用到的表格（4 位元組對齊）組成獨立 sfnt。
  - `patchFontkitSubset()`：只執行一次；包住 `TTFSubset.prototype._addGlyph`，原本的字形資料長度是奇數時補一個 0 位元組並把 `this.offset` 加 1。原型由 `Object.getPrototypeOf(<任一 TrueType 字型>.createSubset())` 取得。
  - hook `embedCheck({family, bold, text} | {b64, text}): Promise<{baseFont, glyphs, broken, empty}>`：建一個新的 pdf-lib 文件，`embedFont(bytes, {subset:true})` 寫入 `text`，存檔後重新讀出嵌入的字型，數字形（同 `edit-page-text-real.mjs` 的 glyphCheck）。

- [ ] **Step 1: 寫失敗的測試**

```js
const ec = a => A(a => window.__pdfapp.embedCheck(a), a);
let e = await ec({family:'WenQuanYi Zen Hei', bold:false, text:'文泉驛正黑測試'});
check('.ttc face embeds', e.broken === 0 && e.glyphs >= 7 && /WenQuanYi/.test(e.baseFont), e);
e = await ec({family:'DejaVu Serif', bold:true, text:'Bold Serif'});
check('bold face used', /DejaVuSerif-Bold/.test(e.baseFont) && e.broken === 0, e);
e = await ec({family:'Inter', bold:false, text:'Inter CFF'});
check('CFF (.otf) embeds', e.broken === 0 && e.glyphs >= 7, e);
e = await ec({b64:b64Of(FIX + '/oddglyph-test.ttf'), text:'奇數長度測試ABC'});
check('odd-length glyphs survive subsetting', e.broken === 0 && e.empty === 0, e);
```

- [ ] **Step 2: 跑測試確認失敗**（`embedCheck` 不存在；加上 hook 後，奇數字形那項在修正前應該 `broken > 0`，修正前先確認這點）。
- [ ] **Step 3: 實作** 上面三個函式與 hook；`patchFontkitSubset()` 在第一次嵌入前呼叫。
- [ ] **Step 4: 跑測試確認通過**；`node tests/e2e/run.mjs edit-page-text-real` 也要 ✓（思源黑體的子集不受影響）。
- [ ] **Step 5: Commit** — `Embed system fonts: collection faces, bold faces, fontkit odd-glyph fix`

### Task 3: 修改原文用每段自己的字型寫入（橫書）

**Files:**
- Modify: `app/index.html`：`realTextOK` → `realTextCheck`、`layoutReal`、`writePageText`（橫書部分）、`editPageText`／`editOwnText`（編輯器錨點）、`htmlToRuns`／`currentTBStyle`／`applyTextFormat`（修改原文也記 `font`）、`commitPageTextEdit`
- Test: `tests/e2e/edit-page-text-fonts.mjs`（第 3 部分）

**Interfaces:**
- Consumes: `systemFontBytes`（Task 2）、`fontStack`、`TB_LH`、`layoutRuns` 的量法（v1.0.26）。
- Produces:
  - `realFontInfo(font: string, bold: boolean): Promise<{fk, bytes, key: string, synthetic: boolean}>`：`font` 空字串 = 內建思源黑體（現有 `realFontBytes`）；`key` = `${font}|${bold ? 'b' : 'r'}`。讀不到系統字型時丟出錯誤。
  - `realTextCheck(lines): Promise<{image: boolean, missing: Array<{font: string, chars: string[]}>}>`：`image` = 有字連思源黑體都沒有（走圖片做法）；`missing` = 指定字型缺、思源黑體有的字（依字型分組、去重）。
  - `missingToDefault(lines): Promise<lines>`：把指定字型缺的字拆成 `font:''` 的 run。
  - `layoutReal(lines, strut)`：`rows[].items[]` 多 `a`、`d`、`fk`；`row.base` 依各字型的 ascent／descent 與 strut（同 v1.0.26 `layoutRuns` 的算法）；字寬用該 run 字型的 fontkit 排版前進寬。
  - `realStrut(edit)`：修改原文編輯器的 strut（字級 = 最小 run 字級，字型 = 編輯器根字型）。
  - `subsetIsSound(fk, text: string): boolean`：用 fontkit 對這些字做一次子集、編碼後重新讀入，每個字形的外框都讀得出來才算健全；不健全就改用 `{subset:false}` 整個嵌入（規格的錯誤處理表）。
  - 測試 hooks：`breakTestFont(family)`（把測試字型的位元組換成壞資料）、`fontkitPatch(on: boolean)`（暫時關掉 Task 2 的修正，用來驗證 `subsetIsSound` 的退路）。
- 寫入：每個 `key` 嵌入一次（`doc.embedFont(bytes, {subset:true})`，`embed:'full'` 的字型用 `{subset:false}`），資源名 `PDFE_F<n>`；假粗體的 run 前後加 `2 Tr` ＋ `w`／描邊色，之後回到 `0 Tr`。讀不到字型時 toast（見 Global Constraints）並以思源黑體寫入。

- [ ] **Step 1: 寫失敗的測試**（用 `sample.pdf` 第 1 頁的英文標題「Sample Report」；Chinese 部分用 `edit-page-text-real.mjs` 已有的中文段落做法）

```js
// DejaVu Serif on English page text
p = await at('Sample Report'); await win.mouse.click(p.x, p.y); await win.waitForTimeout(800);
await win.keyboard.press('Control+a'); await fmt('font', 'DejaVu Serif'); await win.keyboard.press('End'); await win.keyboard.type(' Serif');
const edW = await editorWidth(); await commit();
check('text readable', /Sample Report Serif/.test(await extract('f1.pdf')));
check('font embedded', /DejaVuSerif/.test(await fonts()) && (await glyphCheck()).every(g => g.broken === 0));
check('width page = editor', Math.abs(await itemWidth('Serif') - edW) <= 1);
// bold run uses the Bold face; WenQuanYi bold is synthetic (2 Tr)
// re-edit: the editor comes back in DejaVu Serif; undo restores
// Review Focus 1: edit the same block three times → the page's /Font count stays the same
// Review Focus 2: one block with DejaVu Serif, DejaVu Serif bold, 文泉驛, default → one FontFile per (family, weight)
// Review Focus 3: a run in DejaVu Serif deleted entirely → no DejaVu Serif font resource
// Review Focus 4: registerTestFont('PDFE Gone Test') then make its bytes unreadable (hook breakTestFont) → toast text exactly as specified, Noto used
// unsound subset: fontkitPatch(false), oddglyph-test font on page text → embedded whole (FontFile2 has all glyphs), glyphs intact; fontkitPatch(true)
```

（每一項寫成 `check(...)`；`fonts()`、`glyphCheck()`、`extract()` 沿用 `edit-page-text-real.mjs` 的寫法，複製到新檔。）

- [ ] **Step 2: 跑測試確認失敗**（現在修改原文不能選字型，PDF 裡只有 Noto）。
- [ ] **Step 3: 實作**（上面 Interfaces 的函式；`htmlToRuns`、`currentTBStyle` 在 `.tbed.real` 時改為記錄 `firstFamily(...)`；`applyTextFormat('font')` 在修改原文時不再直接 return；編輯器錨點改用 `layoutReal(lines, strut).rows[0].base` 取代 `realBaseline(size)`）。
- [ ] **Step 4: 跑測試確認通過**；`node tests/e2e/run.mjs edit-page-text` 與 `rotated-text` 也要 ✓。
- [ ] **Step 5: Commit** — `Edited page text keeps a system font per run, embedded as a subset`

### Task 4: 修改原文的字型選單、提醒與原文字型對應

**Files:**
- Modify: `app/index.html`：`textBarHTML`、`showTextMenu`、`fontMenuList`／`pickFont`、`commitTextEditor`、`editPageText`
- Test: `tests/e2e/edit-page-text-fonts.mjs`（第 4 部分）

**Interfaces:**
- Consumes: `FontFam.embed`／`vert`／`bytes`（Task 1）、`realTextCheck`／`missingToDefault`（Task 3）。
- Produces:
  - `fontBlockReason(fam: FontFam): string`：修改原文時 `embed === 'no'` → 「授權不允許嵌入」；直書編輯器且 `!vert` → 「沒有直書資料」；否則 `''`。文字方塊一律 `''`。
  - 灰掉的項目：`button.fm-it.off`、`aria-disabled="true"`、`title` 與項目右側小字為原因。點了沒有作用。
  - `confirmFullEmbed(fam): Promise<boolean>` 與 `missingGlyphDialog(font, chars): Promise<'back'|'default'>`（用 `openModal`，文案見 Global Constraints）。
  - 測試 hook `fontCatAdd(fams: FontFam[])`：把假的家族加進目錄並 `FONTCAT.gen++`。
  - 存檔流程：修改原文時 `commitTextEditor` 先在編輯器還開著時跑 `realTextCheck`；有 `missing` 就跳缺字提醒；`'back'` → 編輯器保持開著並取得焦點；`'default'` → `missingToDefault` 後照常存檔。檢查進行中再次觸發存檔要忽略。
  - `matchSystemFont(pdfFontName: string): string`：去掉 `/^[A-Z]{6}\+/` 子集前綴，比對各字面的 PostScript 名稱（完全相同優先），再比對去掉空白的家族名；唯一對上才回傳家族名，否則 `''`。`editPageText` 用它設定 run 的 `font` 與編輯器根字型。

- [ ] **Step 1: 寫失敗的測試**

```js
// menu in page-text mode: button present; a fake catalogue with embed 'no' / 'full' and vert false
await A(() => window.__pdfapp.fontCatFake(0)); await A(() => window.__pdfapp.fontCatAdd([
  {family:'Fake Restricted', name:'Fake Restricted', cjk:false, embed:'no', vert:false, bytes:1e6, faces:[]},
  {family:'Fake Full', name:'Fake Full', cjk:true, embed:'full', vert:true, bytes:23.4e6, faces:[]}]));
// open page text → font button exists → menu: 'Fake Restricted' has class off and reason 授權不允許嵌入
// pick 'Fake Full' → dialog text 『Fake Full』的授權要求把整個字型放進 PDF，檔案會增加約 22.3 MB。要使用嗎？ → 取消 → font unchanged; 使用 → applied
// vertical page text editor (rotated-text fixture): DejaVu Serif and 文泉驛正黑 are off with 沒有直書資料
// missing glyphs: DejaVu Serif + '中文' → dialog lists 中、文 → 回去修改 keeps the editor open → 這些字改用思源黑體 saves, two font subsets
// auto-match: a PDF made with pdf-lib embedding /usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf (subset) → click its text → the font button shows DejaVu Serif
// Review Focus 5: after editing that line in DejaVu Serif (installed version), no two text items on the line overlap
```

（`fontCatAdd` 是新 hook：把假的 `FontFam` 加進目錄並 `gen++`。）

- [ ] **Step 2: 跑測試確認失敗**（修改原文時沒有字型按鈕）。
- [ ] **Step 3: 實作**。
- [ ] **Step 4: 跑測試確認通過**；`textbox-font` 也要 ✓。
- [ ] **Step 5: Commit** — `Font menu for page text: blocked fonts, full-embed and missing-glyph prompts, original font matched`

### Task 5: 直書用系統字型

**Files:**
- Modify: `app/index.html`：`layoutRealV`、`writePageText` 的 `writeVertical`
- Test: `tests/e2e/edit-page-text-fonts.mjs`（第 5 部分）

**Interfaces:**
- Consumes: `realFontInfo`（Task 3）、`registerTestFont`（Task 1）。
- Produces:
  - `layoutRealV(lines, strut)`：每段 run 用自己字型的 `vert` 特性排版、直書前進量。
  - 寫入後在每個系統字型的 CIDFont 字典加 `W2`：`[gid [w1y vx vy] …]`，`w1y` = −advanceHeight、`vx` = 前進寬／2、`vy` = 原點 y；原點 y 照 HarfBuzz：有 `VORG` 用 `VORG`，否則 topSideBearing ＋ 字形 yMax；單位 1/1000 em。Encoding 照舊改 `/Identity-V`。

- [ ] **Step 1: 寫失敗的測試**：註冊「PDFE Vert Test」，在直書原文（`rotated-text.mjs` 的直書範例做法）選它，輸入「直書測試，」→ 存檔 → pdftotext（`-raw`）讀得到、CIDFont 有 `W2`、編輯器裡每個字的位置和頁面上的位置相差 ≤ 1 pt（逐字比對 `getTextContent` 的位置）。
- [ ] **Step 2: 跑測試確認失敗**。
- [ ] **Step 3: 實作**。
- [ ] **Step 4: 跑測試確認通過**；`rotated-text` 也要 ✓。
- [ ] **Step 5: Commit** — `Vertical page text in system fonts with per-glyph vertical metrics`

### Task 6: 發佈準備（不推 main）

**Files:** `HANDOFF.md`（3.8 修改原文、字型段落、測試表加 `edit-page-text-fonts`、版本表 1.0.27、待辦清單移除這項、localStorage 鍵 `fontcat.v2`）、`RELEASE_NOTES.md`（v1.0.27）、`package.json`／`package-lock.json`（1.0.27）

- [ ] **Step 1:** `npm run check && npm run test:e2e` → `all 24 ran cleanly`，逐一讀印出的結果（`edit-page-text-real` 的字形與寬度、`rotated-text` 的數值與先前相同）。
- [ ] **Step 2:** 改版本、寫說明、更新 HANDOFF。
- [ ] **Step 3:** Commit 並推 `wip/realfont`。
- [ ] **Step 4:** 預覽截圖（淺色／深色的字型選單含灰掉的項目、缺字提醒、改完的原文），給使用者看，同意後才合併發佈。
