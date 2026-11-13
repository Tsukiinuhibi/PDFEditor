# 擷取圖片：刪除或更換＋另存時清掉用不到的資料（v1.0.35）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「擷取圖片」點選紅框的圖片後可以〔刪除圖片〕或〔更換圖片…〕（只這一張或全部 N 處），每次另存時清掉檔案裡用不到的資料。

**Architecture:** 全部在 `app/index.html`。紅框照舊由 pdf.js 的運算子清單找出（`detectImages`），加上裁切範圍，並多記不裁切的範圍 `full`。修改時用 pdf-lib 走頁面內容（含表單物件），找出每個畫圖指令的位元組範圍與矩陣（`imageDrawsIn`），以 `full` 範圍對到點選的紅框，再改寫那段內容：刪除＝拿掉，更換＝換成 `q T cm /新名稱 Do Q`。另存前用 `pruneUnused` 只保留從文件根找得到的物件。

**Tech Stack:** Electron 45、pdf-lib（`csTokens`、`pageContentBytes`、`decodePDFRawStream`、`MUL`／`MPT`）、pdf.js 4.10（`constructPath` 的 `minMax`、`clip`／`eoClip`、`endPath`）、playwright-core e2e。

**Spec:** `docs/superpowers/specs/2026-11-13-image-delete-replace-design.md`

## Global Constraints

- 介面文字繁體中文（台灣）；commit 英文＋專案規定的兩行 attribution；分支 `wip/imgedit`，給使用者看預覽後才發佈。
- 文件的每個變更走 `mutate()`：「已刪除圖片」／「已刪除 N 處圖片」／「已更換圖片」／「已更換 N 處圖片」，各一個復原步驟。
- 不覆蓋原檔（另存）；清理只作用在存出去的位元組，`S.bytes` 與復原記錄不變。
- 文案：鈕〔刪除圖片〕〔更換圖片…〕；詢問「這張圖片在文件裡出現 N 次」〔取消〕〔只刪這一張〕〔全部 N 處都刪〕；整頁「這張圖片幾乎佔滿整頁，刪除後這頁會變成空白。」〔取消〕〔刪除〕；更換視窗標題「更換圖片」、放法「保持比例，放在原本範圍的中間」／「填滿原本的範圍（可能變形）」、範圍「只有這一張」／「全部 N 處」、〔↺〕〔↻〕、〔取消〕〔更換〕；失敗「這張圖片無法刪除或更換」。
- 「幾乎佔滿整頁」＝看得到的範圍 ≥ 頁面面積 90%；「同一個紅框」＝`full` 範圍四邊差都 ≤ 1.5 pt；看不見的文字＝繪製模式 3、7。

## Review Focus

1. 頁面的 `/Contents` 是好幾段串流的陣列：刪改後畫面正確，其他段的內容還在。→ Task 2 測試（第 2 頁用陣列）。
2. 好幾頁共用同一個 `/Resources` 字典：「只刪這一張」後，另一頁的同一張圖仍正常顯示。→ Task 2 測試（第 1、2 頁共用）。
3. 刪除後立刻復原：圖片、看不見的文字、縮圖資料都回來（同一個復原步驟）。→ Task 2 測試。
4. 換上的圖片在 `/Rotate 90` 的頁面上、舊圖是轉 90° 存的：新圖在畫面上是正的（左紅右藍）。→ Task 3 測試。
5. 沒有任何修改就另存：清理後檔案仍然完整（頁數、表單、書籤、圖層）。→ Task 4 測試。

---

### Task 1: 找出圖片：看得到的範圍與內容裡的畫圖指令

**Files:**
- Modify: `app/index.html`（`csTokens` 多產生內嵌圖片的運算子；`detectImages` 追蹤裁切；新增 `imageDrawsIn`、`imageKey`；`__pdfapp.imageBoxes`、`__pdfapp.imageDraws`）
- Test: `tests/e2e/image-edit.mjs`（新檔，第 1 部分；測試 PDF 由 pdf-lib 產生，圖片物件直接寫像素：`ctx.flateStream(rgb, {Type:'XObject', Subtype:'Image', Width, Height, ColorSpace:'DeviceRGB', BitsPerComponent:8})`，每張圖尺寸不同以便辨認）

**測試 PDF（595×842）：**
- 第 1 頁：ImA 40×20（左半紅、右半藍）`200 0 0 100 100 650 cm`；ImB 42×20 在 `100 400 100 100 re W n` 裡、`200 0 0 100 100 400 cm`（只露出左半）；內嵌圖片 8×8 灰 `60 0 0 60 420 420 cm`；ImL1 44×20 與 ImL2 46×20 都在 `150 0 0 100 380 650 cm`（疊在一起）。第 1、2 頁的 `/Resources` 是同一個字典。
- 第 2 頁：`/Contents` 是兩段串流的陣列，第二段畫 ImA `200 0 0 100 100 650 cm`。
- 第 3、4 頁：都畫表單物件 F1（`/Matrix` 單位矩陣、BBox 0 0 595 842），F1 裡畫 ImD 48×20 `100 0 0 100 100 600 cm`。
- 第 5 頁：ImE 50×20 與內容完全相同的另一個物件 ImE2，各畫在 `100 0 0 50 100 600 cm`、`100 0 0 50 300 600 cm`。
- 第 6 頁：ImS 30×40 `595 0 0 842 0 0 cm`，上面有看不見的文字 `3 Tr (HIDDENOCR) Tj` 與看得見的 `(VISIBLE) Tj`；頁面有 `/Thumb`（任一小圖片物件）與 `/PieceInfo`（任一字典）。
- 第 7 頁：`/Rotate 90`，ImR 52×20 以 `0 100 -200 0 300 300 cm` 畫。
- 第 8 頁：ImT 54×20 斜放 20°（`cm` 為 200×100 的圖轉 20°，中心在 300 400）。

**Interfaces:**
- Produces:
  - `csTokens(b)`：遇到 `BI … EI` 時多產生 `{op:'BI', args:[], s, e}`（`s` 在 `BI`、`e` 在 `EI` 之後）。其他使用者（`locateTextOps`、`pdfeBlocksIn`、`writePageText` 的乾淨檢查）忽略或正確處理未知運算子。
  - `detectImages(i)` 的每個結果多 `full:{x, y, w, h}`（不裁切），`x, y, w, h` 改成與裁切範圍的交集（`constructPath` 的 `minMax` 經 CTM 轉到畫面；`clip`／`eoClip` 之後的 `endPath` 或繪製運算子才生效；`save`／`restore` 存回；表單物件的 BBox 也裁切）；交集太小（< 4 pt）就不列出。去重改用 `full` 比對。
  - `imageDrawsIn(doc, i): Draw[]`，`Draw = {i, holder, chain, s, e, name, ref, inline, M, clip, full, box, px}`：`holder` 是 `{page:i}` 或 `{form:PDFRef}`（指令所在的內容）；`chain` 是從頁面到 `holder` 經過的表單 `[{form, name, s, e, inHolder}]`；`M` 是圖片單位正方形到頁面座標的矩陣（含所有 `cm` 與表單 `/Matrix`，`MUL(local, ctm)` 的順序同 `locateTextOps`）；`clip` 是頁面座標的裁切外框 `[x0, y0, x1, y1]` 或 `null`；`full`／`box` 是畫面座標（`vp1`）；`px` 是像素寬高。
  - `imageKey(doc, d): string`：圖片物件依「原始位元組雜湊＋寬高」、內嵌圖片依 `BI…EI` 位元組雜湊；同一張圖（同物件或內容相同的副本）得到相同的鍵。
  - `__pdfapp.imageBoxes(i)`（`detectImages`）、`__pdfapp.imageDraws(i)`（`imageDrawsIn` 摘要：`{full, box, inline, key, px}`）。

- [ ] **Step 1: 寫失敗的測試**

```js
// imageBoxes(0)：ImB 的紅框寬 ≈ 100（只有露出的左半），full 寬 ≈ 200；ImL1／ImL2 只有一個紅框；共 4 個紅框（A、B、內嵌、疊圖）
// imageDraws(0)：5 個畫圖指令（A、B、內嵌、L1、L2），內嵌那個 inline === true；每個的 full 與某個紅框的 full 四邊差 ≤ 1.5
// imageDraws(2)：ImD 在表單裡也找得到（full 寬 ≈ 100）
// imageDraws(4)：ImE 與 ImE2 的 key 相同；與第 1 頁 ImA 的 key 不同
```

- [ ] **Step 2: 跑 `xvfb-run -a node tests/e2e/image-edit.mjs`，確認失敗（`imageDraws is not a function`）。**
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 測試通過；`object-style-2`、`export-images`（擷取用的紅框）也通過。**
- [ ] **Step 5: Commit**（`Image edit: find images, their visible area and their drawing commands`）

### Task 2: 刪除圖片

**Files:**
- Modify: `app/index.html`（`showXSel` 的小工具列；新增 `findImageGroup`、`editHolder`、`cloneChain`、`purgeImages`、`deletePageImage`；`removePageText` 加 `{invisibleOnly}`）
- Test: `tests/e2e/image-edit.mjs`（第 2 部分）

**Interfaces:**
- Consumes: Task 1 的 `imageDrawsIn`、`imageKey`、`detectImages` 的 `full`。
- Produces:
  - 小工具列：`meta.k >= 0` 時 `<button data-x="del">刪除圖片</button><button data-x="rep">更換圖片…</button>`（在〔取消〕之前）。
  - `findImageGroup(doc, i, full): {group: Draw[], places: Draw[][]}`：`group`＝第 i 頁 `full` 對得上的指令；`places`＝全文件同鍵的指令依「頁＋`full`」分組，`group` 那一處排第一；同一個表單裡的指令在每個畫它的頁面各算一處。
  - `editHolder(doc, holder, edits: {s, e, text}[])`：依位元組範圍改寫（頁面用 `pageContentBytes` 合併後寫回一段 `flateStream`，同 `removePageText`；表單換成新的串流、保留它的字典）。
  - `cloneChain(doc, d): Draw`：「只有這一張」而指令在表單裡時，從頁面那層起把 `chain` 上的表單各複製一份（新名稱 `PDFE_Fm<n>` 加進上一層的資源、改寫上一層的 `Do`），回傳指向複本的 `Draw`。
  - `purgeImages(doc, refs)`：文件裡已經沒有任何指令畫這些圖片物件時，從走過的頁面與表單的資源拿掉指向它們的名稱，並 `context.delete` 圖片與它的 `SMask`／`Mask`。
  - `removePageText(doc, i, U, {invisibleOnly = false} = {})`：`invisibleOnly` 時只刪繪製模式 3、7 的文字。
  - `__pdfapp.imageObjects()`：`S.bytes` 裡所有圖片物件的 `{w, h}`（測試用來確認資料真的移除）。
  - `async deletePageImage(i, full)`：詢問（多處、整頁）→ 一次 `mutate`：刪指令（每個 `holder` 一次 `editHolder`）、`purgeImages`、看不見的文字（範圍＝看得到的範圍轉成頁面座標）、改過的頁面拿掉 `/Thumb`、`/PieceInfo` → 提示。找不到指令：提示「這張圖片無法刪除或更換」。

- [ ] **Step 1: 寫失敗的測試**

```js
// 點第 1 頁 ImA 的紅框 → 小工具列有〔刪除圖片〕〔更換圖片…〕；自己拖曳框選一塊 → 沒有這兩個鈕
// 〔刪除圖片〕→ 視窗「這張圖片在文件裡出現 2 次」→〔只刪這一張〕→ 第 1 頁 ImA 的紅框不見、該處像素白；第 2 頁 ImA 仍在且畫面正常（Review Focus 1、2）
// 復原 → 第 1 頁 ImA 回來（Review Focus 3 的一部分）
// 再刪一次選〔全部 2 處都刪〕→ 兩頁都沒有；imageDraws 找不到 40×20 的圖；imageObjects() 沒有 40×20
// 疊圖（ImL1／ImL2）→ 刪除 → 兩張都不見、沒有詢問
// 第 3 頁 ImD（表單裡，第 4 頁也畫同一個表單）→〔只刪這一張〕→ 第 4 頁 ImD 還在
// 第 5 頁 ImE → 詢問「出現 2 次」（內容相同的副本也算）
// 第 6 頁整頁圖 → 先確認「幾乎佔滿整頁」→〔刪除〕→ 頁面文字不含 HIDDENOCR、仍含 VISIBLE；沒有 /Thumb、/PieceInfo；復原 → HIDDENOCR 回來（Review Focus 3）
// 內嵌圖片 → 刪除 → 不見
```

- [ ] **Step 2: 跑測試，確認失敗。**
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 測試通過（第 1、2 部分）。**
- [ ] **Step 5: Commit**（`Image edit: delete a picture (this one or every place)`）

### Task 3: 更換圖片

**Files:**
- Modify: `app/index.html`（新增 `replacePlacement`、`openReplaceDialog`、`replacePageImage`；小工具列的〔更換圖片…〕）
- Test: `tests/e2e/image-edit.mjs`（第 3 部分）

**Interfaces:**
- Consumes: Task 2 的 `findImageGroup`、`editHolder`、`cloneChain`、`purgeImages`；`pickImage()`（v1.0.34）。
- Produces:
  - `replacePlacement(i, d, img, {fit, turn}): number[]`：回傳 `T`，把 `d` 的 `Do`（或 `BI…EI`）換成 `q T cm /名稱 Do Q`。演算法：

```
V = pg.vp1.transform（頁面座標 → 畫面）；ex = V(M·(1,0)) − V(M·(0,0))，ey = V(M·(0,1)) − V(M·(0,0))
θ = atan2(ex.y, ex.x)；snap = round(θ / 90°)·90°；tilt = θ − snap（|tilt| < 1° 就當 0）——90° 倍數的轉向與翻轉不帶到新圖
範圍：tilt = 0 → d.box（看得到的範圍）；否則 → 以圖中心、寬 |ex|、高 |ey| 的斜放矩形
新圖大小：fill → 範圍大小；contain → 圖片寬高（turn 為 90／270 時對調）乘 min(範圍寬/w, 範圍高/h)，置中
N = 單位正方形 → 畫面（正放：(0,1) 是上緣），再繞範圍中心轉 tilt + turn
M_new = N · V⁻¹；T = M_new · M⁻¹（MUL 順序同 locateTextOps）
```

  - `openReplaceDialog(img, area, n): Promise<{fit:'contain'|'fill', turn:0|90|180|270, all:boolean} | null>`：`openModal`；預覽是新圖照目前選項放進 `area` 比例的框裡；〔↺〕〔↻〕各轉 90°；`n > 1` 才有範圍那一行。
  - `async replacePageImage(i, full)`：`pickImage()` → `findImageGroup` → `openReplaceDialog` → 一次 `mutate`：新圖片物件嵌一次（JPG 用 `embedJpg`），每個 `holder` 加資源名稱 `PDFE_Im<n>`、`editHolder` 換指令（「全部」時每個 `holder` 只改一次，`T` 用它的第一處算）、`purgeImages` 舊圖 → 提示。

- [ ] **Step 1: 寫失敗的測試**

```js
// 測試圖：寬圖 80×40（左紅右藍）、高圖 40×80
// 第 1 頁內嵌圖片 →〔更換圖片…〕選寬圖 → 視窗標題「更換圖片」、沒有範圍那一行 →〔更換〕→ imageDraws 該處 inline === false、px 80×40；在原範圍內置中（60×30，box 中心 ±1）
// 第 7 頁（/Rotate 90）ImR → 換成寬圖 → 畫面上新圖左邊的像素偏紅、右邊偏藍（Review Focus 4）
// 第 8 頁斜放 20° 的 ImT → 換成寬圖 → 新圖 M 的畫面角度 ≈ 20°（±1°）
// 第 5 頁 ImE → 換成高圖，選「填滿」「全部 2 處」→ 兩處都是 40×80 的圖、box 與原來相同（±1）；文件裡沒有 50×20 的圖片物件
// 第 3 頁 ImD（表單）→ 換成寬圖、按一次〔↻〕→ 新圖在畫面上轉 90°（box 寬高對調的比例）；第 4 頁 ImD 不變
// 裁切過的 ImB → 換成寬圖、保持比例 → 新圖在看得到的左半（box 寬 ≈ 100）裡置中
```

- [ ] **Step 2: 跑測試，確認失敗。**
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 測試通過（第 1～3 部分）。**
- [ ] **Step 5: Commit**（`Image edit: replace a picture (fit or fill, turn, this one or every place)`）

### Task 4: 另存時清掉用不到的資料、文件

**Files:**
- Modify: `app/index.html`（新增 `pruneUnused`；`saveAsNew(bytes, suffix, {clean = true} = {})`；簽署前先清、簽好的不清；`S.signed` 時不清）、`HANDOFF.md`（一節、測試表、第 7 節拿掉「刪掉的資料還在檔案裡」那條）
- Test: `tests/e2e/save-clean.mjs`（新檔；另存對話框在主程序由測試接管，同 `settings-file.mjs`）

**Interfaces:**
- Produces:
  - `async pruneUnused(bytes): Promise<Uint8Array>`：pdf-lib 讀入，從 `context.trailerInfo` 的 `Root`、`Info`、`Encrypt` 沿參照標記（字典的值、陣列的元素、串流的字典），沒標到的 `context.delete`，再 `save()`（設定同 `mutate`）。讀不進來就回傳原本的位元組。
  - `saveAsNew(bytes, suffix, {clean = true} = {})`：`clean && !S.signed` 時存 `await pruneUnused(bytes)`；簽署流程改成 `signPdf(await pruneUnused(S.bytes), …)` 後 `saveAsNew(out, '_已簽署', {clean:false})`。

- [ ] **Step 1: 寫失敗的測試**

```js
// 測試 PDF：兩頁、書籤一項、表單文字欄位一個、圖層一個（OCProperties，內容用到它）、一個便利貼 Contents (SECRET-NOTE-123)
// 沒有修改就另存 → 讀回：2 頁、書籤、欄位、圖層、便利貼都在（Review Focus 5）
// 刪掉便利貼（選取 → Delete）→ 另存 → 讀回的所有物件裡都找不到 SECRET-NOTE-123（對照：刪之前存的檔案找得到）
// 「全部刪除」第 1 頁 ImA 後另存（用 image-edit 的 PDF 也可以）→ 存出的檔案沒有 40×20 的圖片物件
// S.signed = true 時另存 → 存出的位元組和 S.bytes 完全相同
```

- [ ] **Step 2: 跑 `xvfb-run -a node tests/e2e/save-clean.mjs`，確認失敗（找得到 SECRET-NOTE-123）。**
- [ ] **Step 3: 實作；更新 `HANDOFF.md`。**
- [ ] **Step 4: 測試通過；`npm run check`、`npm run test:e2e` 全部通過。**
- [ ] **Step 5: Commit**（`Save: drop data nothing uses any more; image edit docs`）
