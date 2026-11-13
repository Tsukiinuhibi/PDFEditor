# 選到物件時工具列換成它的編輯功能（v1.0.33）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用選取工具選到本程式畫的圖形類物件時，上方提示列顯示那種工具的樣式設定（值是這個物件的），改了就套用到這個物件。

**Architecture:** 全部在 `app/index.html`。`styleBar(t)` 改成 `styleBar(t, st = STYLES[t])`；選到物件時在 `#hint` 畫「已選取：…」＋`styleBar(kind, 物件的樣式)`，`#hint` 的點擊／變更在物件模式下改呼叫 `restyleSelected(patch)`。`restyleAnnot` 在一次 `mutate` 裡寫回樣式欄位，再用調整大小時同一套幾何重畫外觀（把 `commitAnnotBox` 裡那段抽成 `regenAP`），旋轉過的照 `recolorShape` 的方式維持角度。

**Tech Stack:** Electron 45、`app/index.html`（pdf-lib、`mutate`、`readAnnStyle`、`geomBox`／`geomLine`／`geomPoly`／`geomInk`、`formAP`、`setTurn`）、playwright-core e2e。

**Spec:** `docs/superpowers/specs/2026-11-13-object-style-design.md`

## Global Constraints

- 介面文字繁體中文（台灣）；commit 英文＋專案規定的兩行 attribution；分支 `wip/objstyle`，給使用者看預覽後才發佈。
- 文件的每個變更走 `mutate()`（一次修改＝一個復原步驟，標籤「已變更樣式」）；改完仍選著這個物件。
- 只處理有 `PDFE` 標記的物件；只改這個物件，`STYLES`（工具預設）不變。
- 文案：提示列標題「已選取：<名稱>」（名稱用 `DRAW_TOOLS[kind].label` 去掉「工具」）。

## Review Focus

1. 旋轉過的矩形改顏色：角度不變。→ Task 2 測試。
2. 透明度改成 50% 再改回 100%：`CA` 加上再拿掉，外觀跟著。→ Task 2 測試。
3. 矩形粗細改成 14 pt：物件的外框位置大小不變（線往內長）。→ Task 2 測試。
4. 連續快速改兩次（粗細 3 → 6）：兩次都套用，最後是 6，仍選著它。→ Task 2 測試。
5. 改完樣式按 Delete：刪掉的是這個物件。→ Task 2 測試。

---

### Task 1: 選到物件時顯示它的樣式列

**Files:**
- Modify: `app/index.html`（`styleBar` 加參數；新增 `objKind`、`readObjStyle`、`paintObjBar`；`selectAnnot`／`deselectAnnot`／`setTool` 收放提示列；`__pdfapp.annStyle`）
- Test: `tests/e2e/object-style.mjs`（新檔，第 1 部分；`check()` 寫法同 `sticky-notes.mjs`）

**Interfaces:**
- Produces:
  - `styleBar(t: string, st = STYLES[t]): string`（原本的呼叫不變）。
  - `objKind(dict): string | null`：依設計第 1 點回傳工具鍵（`rect`、`ellipse`、`cloud`、`line`、`arrow`、`polygon`、`polyline`、`pen`、`hlText`、`underline`、`strike`、`fill`），沒有 `PDFE` 或不支援 → `null`。
  - `readObjStyle(dict): {color, fill, width, dash, opacity, head?}`（`readAnnStyle` 加上 Line 的 `head`：`LE` 起點不是 None → `both`，終點 `ClosedArrow` → `closed`，否則 `open`）。
  - `async paintObjBar(): void`：`S.tool === 'select'` 且 `AS` 的物件 `objKind` 不是 `null` → `#hint` 加 `objbar`、`styl`、`show`，內容 `<b class="sb-t">${icon(DRAW_TOOLS[kind].ic)}已選取：${名稱}</b><span class="sb-row">${styleBar(kind, 樣式)}</span>`（填色只放顏色與透明度）；否則若 `#hint` 是物件模式就收起。
  - `selectAnnot` 結尾、`deselectAnnot` 結尾呼叫 `paintObjBar()`；`setTool` 換工具時物件模式讓位給工具自己的提示列。
  - `__pdfapp.annStyle(i, id): {kind, color, fill, width, dash, opacity, head, deg}`（`deg`＝旋轉角度，沒轉是 0）。

- [ ] **Step 1: 寫失敗的測試**

```js
// 畫一個矩形（setTool('rect') 拖曳）→ setTool('select') 點它 → #hint 有 .objbar，標題含「已選取：矩形」
// 提示列的框線顏色按鈕 --c ＝ annStyle 的 color；粗細 <select data-s="width"> 的值 ＝ annStyle 的 width
// 取消選取（Esc）→ #hint 收起；畫筆工具時提示列是畫筆的（不是物件模式）
// 文字方塊（textbox 工具點一下輸入、Esc）選到 → 沒有 .objbar
// 另開一份測試用 PDF（pdf-lib 產生、Square 註解沒有 PDFE）→ 選到 → 沒有 .objbar
```

- [ ] **Step 2: 跑 `xvfb-run -a node tests/e2e/object-style.mjs`，確認失敗（`annStyle is not a function`）。**
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 測試通過。**
- [ ] **Step 5: Commit**（`Object style: the toolbar shows the selected object's style`）

### Task 2: 改樣式套用到物件（圖形、線條、多邊形、畫筆、填色）

**Files:**
- Modify: `app/index.html`（新增 `restyleAnnot`、`restyleSelected`、`regenAP`（從 `commitAnnotBox` 抽出，兩邊共用）；`#hint` 點擊／變更在物件模式下改成套用到物件；顏色選擇器在物件模式下 `onPick` 套用到物件）
- Test: `tests/e2e/object-style.mjs`（第 2 部分）

**Interfaces:**
- Consumes: Task 1 的 `objKind`、`readObjStyle`、`paintObjBar`、物件模式的 `#hint`。
- Produces:
  - `regenAP(doc, i, dict, map = p => p): void`：Line／Square／Circle／Polygon／PolyLine／Ink 依目前樣式重算幾何、寫回 `Rect`、`AP`（`map` 給調整大小用）；旋轉過的矩形類照 `recolorShape` 用 `boxTurn` 的 `baseRect` 重畫再 `setTurn` 同角度。
  - `async restyleAnnot(i, id, patch): Promise<boolean>`：`mutate('已變更樣式')`：`color`→`C`（封閉箭頭的 `IC` 也是）、`fill`→`IC`（空字串＝刪掉）、`width`／`dash`→`BS`、`opacity`→`CA`（1＝刪掉）、`head`→`LE`（同 `createLine`），`M` 更新，`regenAP`。
  - `async restyleSelected(patch): Promise<void>`：`holdSelection()`、`restyleAnnot`、重新選取同一個物件、`paintObjBar()`。
  - 預設樣式（`[data-p]`）：套用 `PRESETS[kind 的 kind][n]` 的欄位（同 `applyPreset`，但寫到物件）。

- [ ] **Step 1: 寫失敗的測試**

```js
// 矩形：粗細選 4 → annStyle.width === 4、sel().id 仍是它；框線顏色（色環選 #1c64d9）→ color；填色 #ffd43b → fill；填色選「無」→ fill === ''
// 虛線勾選 → dash；透明度 50% → opacity 0.5，再 100% → 1（Review Focus 2）
// Ctrl+Z 一次 → 回到上一個樣式；STYLES.rect 沒變（__pdfapp 讀 STYLES 或 localStorage styles.v1 比對）
// 粗細 14 → 物件外框 x/y/w/h 與改之前相同（±0.5，Review Focus 3）
// 粗細 3 再立刻 6 → width === 6、仍選著（Review Focus 4）；按 Delete → 這個矩形不見（Review Focus 5）
// 箭頭：箭頭樣式選 closed → head === 'closed'；線條：粗細 6；多邊形、畫筆：顏色；節點填色：顏色
// 預設樣式：點第 1 個 → 物件的 color／width 等於 PRESETS 那一組
// 旋轉過的矩形（↻ 拖 30°）→ 改顏色 → annStyle.deg 仍約 30（Review Focus 1）
```

- [ ] **Step 2: 跑測試，確認失敗（改了粗細物件沒變）。**
- [ ] **Step 3: 實作。**
- [ ] **Step 4: 測試通過（第 1、2 部分）。**
- [ ] **Step 5: Commit**（`Object style: changes apply to the selected object`）

### Task 3: 文字標記與區域螢光筆、文件

**Files:**
- Modify: `app/index.html`（新增 `markupGeom(sub, quads, st)`，`createTextMark` 與 `restyleAnnot` 共用；`addHighlight` 加 `PDFE`、`Subj:'區域螢光筆'`、`CA`；`objKind` 認得它）、`HANDOFF.md`（一節、測試表）
- Test: `tests/e2e/object-style.mjs`（第 3 部分）

**Interfaces:**
- Consumes: Task 2 的 `restyleAnnot`。
- Produces:
  - `markupGeom(sub, quads, st): {b, ops, res}`（quads 是畫面座標的四點組；Highlight 用 Multiply）。
  - `restyleAnnot` 對 Highlight／Underline／StrikeOut：從 `QuadPoints` 取回四點組，`markupGeom` 重畫。

- [ ] **Step 1: 寫失敗的測試**

```js
// 高亮文字（hlText 拖過 sample.pdf 的標題文字）→ 選到 → 提示列「已選取：高亮文字」→ 顏色換 #8ce99a → annStyle.color
// 底線文字 → 透明度 50% → opacity 0.5
// 區域螢光筆（highlight 工具拖一個框）→ 選到 → 有樣式列 → 顏色換 → color 改變
```

- [ ] **Step 2: 跑測試，確認失敗。**
- [ ] **Step 3: 實作；更新 `HANDOFF.md`。**
- [ ] **Step 4: 測試通過；`npm run check`、`npm run test:e2e` 全部通過。**
- [ ] **Step 5: Commit**（`Object style: text markup and area highlights`）
