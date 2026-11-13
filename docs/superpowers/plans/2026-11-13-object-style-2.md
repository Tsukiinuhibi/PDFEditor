# 選到物件時工具列：文字方塊、戳記、圖片、區塊填色（v1.0.34）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 選到文字方塊、戳記、圖片、點選區塊的填色時，`#hint` 顯示它的編輯功能，改了就套用到這個物件。

**Architecture:** 全部在 `app/index.html`，接在 v1.0.33 的物件模式上（`objKind`、`paintObjBar`、`OBJBAR`、`restyleSelected`、`restyleAnnot`）。`restyleAnnot` 依種類分派：文字方塊改 `PDFE_RT` 後用 `renderTextBox` 重畫；戳記／圖片換外觀圖或包一層透明度；區塊填色從外觀圖的透明遮罩（SMask）重新上色。旋轉過的都用 `setTurn` 以原角度包回去。

**Tech Stack:** Electron 45、pdf-lib（`decodePDFRawStream`、`formFrame`、`setTurn`、`imageAP`）、playwright-core e2e。

**Spec:** `docs/superpowers/specs/2026-11-13-object-style-2-design.md`

## Global Constraints

- 介面文字繁體中文（台灣）；commit 英文＋專案規定的兩行 attribution；分支 `wip/objstyle2`，給使用者看預覽後才發佈。
- 文件的每個變更走 `mutate()`：樣式「已變更樣式」、換戳記「已更換戳記」、換圖片「已更換圖片」；改完仍選著它。
- 工具預設不變：`TB_STYLE`（`pdfeditor.textbox.v1`）、`STAMP_SEL`（`pdfeditor.stamp.v1`）、`STYLES`。
- 文案：標題「已選取：文字方塊／修改的文字／戳記／圖片／填色」；〔更換戳記…〕〔更換圖片…〕；提示「套用到整個方塊・雙擊可修改文字」、「舊版蓋的戳記無法改顏色，可以更換戳記」。

## Review Focus

1. 兩段大小不一的文字改顏色：只改顏色，大小仍不一。→ Task 1 測試。
2. 粗體連按兩下（第二下在第一下套用完成前）：結果是沒有粗體。→ Task 1 測試。
3. 透明度 50% → 70% → 100%：外觀只包一層，100% 時回到原本的外觀（不會越包越多）。→ Task 2 測試。
4. 旋轉過的戳記改顏色／換戳記：角度不變。→ Task 2 測試。
5. 圖片先設 50% 再〔更換圖片…〕：新圖仍是 50%，在原框內置中、不變形。→ Task 2 測試。

---

### Task 1: 文字方塊

**Files:**
- Modify: `app/index.html`（`objKind` 認得文字方塊；`textBarHTML(st, obj)`；`openFontMenu` 可指定目前字型與選了之後做什麼；`restyleAnnot` 分派到 `restyleTextBox`；`#hint` 物件模式的點擊／變更處理文字方塊的控制項；字型目錄載入時不蓋掉物件模式的字型鈕；`annStyle` 加 `rt`）
- Modify: `tests/e2e/object-style.mjs`（「a text box selected: no style bar」改成有文字方塊的樣式列）
- Test: `tests/e2e/object-style-2.mjs`（新檔，第 1 部分）

**Interfaces:**
- Produces:
  - `objKind(dict)`：`FreeText`＋`PDFE`＋`PDFE_RT` → `'textbox'`。
  - `tbObjStyle(rt): {font, size, color, bg, bold, italic, underline, boxBg, border}`（第一段的值；粗斜底線＝每段都有）。
  - `textBarHTML(st = currentTBStyle(), obj = false)`：`obj` 時字級清單含 `st.size`、文字底色鈕顯示 `st.bg`、提示換成「套用到整個方塊・雙擊可修改文字」。
  - `openFontMenu(anchor, at, {cur, onPick} = {})`：`onPick(f)` 取代套用到編輯器。
  - `restyleTextBox(doc, i, dict, patch): Promise<boolean | undefined>`：patch 的 `font/size/color/bg/bold/italic/underline` 套到每段（值 `'toggle'`＝依目前每段是否都有而反轉；`font:''` 刪掉 `font`），`boxBg/border` 套到方塊；strut `{size:最小字級, font:'', bold:false}`；寫回 `Rect`（左上角不動）、`RC`、`DA`、`M`、`PDFE_RT`、`AP`。
  - `OBJBAR.st`：文字方塊的 `tbObjStyle`。
  - `__pdfapp.annStyle(i, id)` 多回傳 `rt`（`PDFE_RT` 解析後）。

- [ ] **Step 1: 寫失敗的測試**

```js
// 產生測試 PDF（pdf-lib）：一頁 595×842，畫一個封閉框（給 Task 3 的區塊填色）
// textbox 工具點一下打「Hello 世界」、Esc → 選到 → 標題含「已選取：文字方塊」、select[data-tb="size"] 的值 = rt 第一段 size
// 字級選 24 → rt 每段 size 24、方塊 h 變大、x/y 不變（±0.5）、Contents 不變、仍選著
// 顏色（.cpick[data-tbc="color"] → #cpMenu [data-v="#e03131"]）→ 每段 color
// 粗體按一下 → 每段 bold；再按 → 都不是；連按兩下（不等）→ 都不是（Review Focus 2）
// 方塊背景 #fff3bf → box.boxBg；框線勾選 → box.border
// 字型：[data-tbfont] → #fontMenu 第一個可用的 .fm-it → 每段 font === 它的 data-f
// Ctrl+Z 一次 → 回到上一步；localStorage pdfeditor.textbox.v1 沒變
// 兩段大小不一的方塊（編輯器裡反白後改字級）→ 改顏色 → 兩段 size 仍不同（Review Focus 1）
```

- [ ] **Step 2: 跑 `xvfb-run -a node tests/e2e/object-style-2.mjs`，確認失敗（沒有樣式列）。**
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 測試通過；`object-style.mjs` 也通過。**
- [ ] **Step 5: Commit**（`Object style 2: text boxes`）

### Task 2: 戳記與圖片

**Files:**
- Modify: `app/index.html`（`placeStamp` 存 `PDFE`、`PDFE_Stamp`；`openStampPicker({spec, pickOnly})`；`objKind`：主旨「戳記」→ `'stamp'`、主旨「圖片」＋`PDFE` → `'image'`；`objBarHTML` 的戳記／圖片列；`fadeAP`；`restyleStamp`；`replaceStamp`；`replaceImage`；`annStyle` 加 `spec`、`img`）
- Test: `tests/e2e/object-style-2.mjs`（第 2 部分）

**Interfaces:**
- Consumes: Task 1 的 `restyleAnnot` 分派。
- Produces:
  - `stampSpec(dict): object | null`（`PDFE_Stamp` 解析；`when` 是 ISO 字串）。
  - `uprightAP(dict): PDFRef`（旋轉過的取 `PDFE_Base`，否則 `AP.N`）；`setUpright(doc, i, dict, ap, rect)`（有角度就 `setTurn`，否則寫 `AP`／`Rect`）。
  - `fadeAP(doc, ref, op): PDFRef`：去掉舊的透明度層（`PDFE_Fade` 指向原外觀）再依 `op` 包一層 `q /GS0 gs /B Do Q`（`op >= 1` 回原外觀）。
  - `restyleStamp(doc, i, dict, kind, patch)`：`opacity` → `CA`＋`fadeAP`；戳記 `color`（有 `spec` 才行）→ 用原本的時間與姓名重畫、框不變。
  - `async openStampPicker({spec, pickOnly} = {}): Promise<spec | boolean>`：`pickOnly` 時回傳選到的設定、不改 `STAMP_SEL`、不換工具。
  - `replaceStamp(i, id, spec)`：mutate「已更換戳記」，中心不動、比例＝舊框寬／舊戳記原寬（沒有設定時 1）。
  - `replaceImage(i, id, img)`：mutate「已更換圖片」，新圖等比例放進舊框置中，`Contents`＝檔名。
  - 物件模式點擊：`[data-o="stamp"]`、`[data-o="image"]`。

- [ ] **Step 1: 寫失敗的測試**

```js
// localStorage pdfeditor.stamp.v1 = STAMPS.standard[0]（不跳出選擇視窗）→ stamp 工具點一下 → 選到
// 標題「已選取：戳記」、有 [data-o="stamp"]、顏色鈕、透明度；annStyle.spec.t === '核准'
// 顏色 #1c64d9 → spec.c、框 w/h 不變、spec.when 不變
// 透明度 50% → opacity .5、apText 有 '/GS0 gs'；70% → 只有一個 'gs'、外觀內的 /B 是原本的圖；100% → 沒有 CA、apText 是 '/Im0 Do'（Review Focus 3）
// 〔更換戳記…〕→ 選擇戳記視窗點第 2 個 → 使用此戳記 → spec.t 換了、中心不動（±1）、pdfeditor.stamp.v1 沒變
// 旋轉 30° 後改顏色、換戳記 → deg 仍約 30（Review Focus 4）
// 舊版戳記（測試 PDF 裡的 Stamp 主旨「戳記」沒有 PDFE）→ 有 [data-o="stamp"]、沒有顏色鈕
// 圖片：image 工具（filechooser 選 TMP 的寬圖 png）放上 → 選到 → 「已選取：圖片」；透明度 50%
//   〔更換圖片…〕選高圖 png → Contents 是新檔名、img 長寬比＝新圖、框在舊框內且中心不動、opacity 仍 .5（Review Focus 5）
```

- [ ] **Step 2: 跑測試，確認失敗。**
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 測試通過（第 1、2 部分）。**
- [ ] **Step 5: Commit**（`Object style 2: stamps and pictures`）

### Task 3: 區塊填色、文件

**Files:**
- Modify: `app/index.html`（`objKind`：`Stamp` 名稱 `Fill` → `'fill'`；`refillStamp(doc, i, dict, patch)`；`fillAt` 透明度不是 1 時寫 `CA`）、`HANDOFF.md`（一節、測試表）
- Test: `tests/e2e/object-style-2.mjs`（第 3 部分）

**Interfaces:**
- Consumes: Task 2 的 `uprightAP`、`setUpright`。
- Produces: `refillStamp`：從外觀圖 `/Im0` 的 SMask 取回遮罩，用新顏色（`C`）與透明度（patch 有 `opacity` 才換，否則沿用原本的 alpha）重做 PNG、`imageAP`，寫 `C`、`CA`。

- [ ] **Step 1: 寫失敗的測試**

```js
// fill 工具（點選區塊）點測試 PDF 的框內 → 選到 → 「已選取：填色」
// 顏色 #8ce99a → annStyle.color、畫面上框中心的像素接近 #8ce99a
// 透明度 50% → opacity .5、像素比原本淡（接近白色與 #8ce99a 的中間）
```

- [ ] **Step 2: 跑測試，確認失敗。**
- [ ] **Step 3: 實作；更新 `HANDOFF.md`。**
- [ ] **Step 4: 測試通過；`npm run check`、`npm run test:e2e` 全部通過。**
- [ ] **Step 5: Commit**（`Object style 2: area fills`）
