# 右鍵回到選取（v1.0.31）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 文件上按右鍵不再跳頁面選單；空白處按右鍵在任何工具下都回到選取工具；在物件上按右鍵就選到它。

**Architecture:** 全部在 `app/index.html`。把 `pagesEl` 的 contextmenu 換成 `viewer` 的（含頁面之間的灰色處）：便利貼照舊跳便利貼選單，其他情況呼叫 `backToSelect()`，點在物件上再 `selectAnnot()`。頁面選單只留在縮圖的右鍵。

**Tech Stack:** Electron 45、`app/index.html` 單檔渲染端（`setTool`、`selectAnnot`、`getAnns`）、playwright-core e2e。

**Spec:** `docs/superpowers/specs/2026-11-13-right-click-design.md`

## Global Constraints

- 介面文字繁體中文（台灣）；commit 英文＋專案規定的兩行 attribution；分支 `wip/rightclick`，給使用者看預覽後才發佈。
- 收尾規則和〔完成 (Esc)〕一樣（`setTool('select')`）：畫筆筆跡存好、文字方塊文字存好、擷取圖片的框取消、文字辨識結果視窗關閉。
- 可點的東西用 `getAnns()`（略過隱藏／鎖定圖層）。
- 文案：〔完成 (Esc)〕的 `title`＝「回到選取工具（Esc，或在頁面空白處按右鍵）」；文字方塊工具的按鈕提示、`HINTS.textbox`、文字列提示不再寫「左鍵或右鍵」／「或按右鍵」。

## Review Focus

1. 文字方塊正在打字時，在空白處按右鍵：文字存下來，回到選取。→ Task 1 測試。
2. 新便利貼正在打字時，在空白處按右鍵：便利貼存下來，回到選取。→ Task 1 測試。
3. 填色工具「節點」方式點了 3 個節點後按右鍵：填好，再回到選取。→ Task 1 測試。
4. 文字辨識結果視窗開著時按右鍵：視窗關掉、回到選取，不出錯。→ Task 1 測試。
5. 右鍵點在選取物件旁的工具列（`.abar`）上：不取消選取、不跳選單。→ Task 2 測試。

---

### Task 1: 空白處按右鍵回到選取

**Files:**
- Modify: `app/index.html`（`pagesEl.addEventListener('contextmenu', …)` 換成 `viewer` 的；新增 `backToSelect`；`HINTS.textbox`、文字方塊按鈕 `title`、`textBarHTML` 的提示、四個〔完成 (Esc)〕按鈕的 `title`）
- Test: `tests/e2e/right-click.mjs`（新檔，第 1 部分；`check()` 寫法同 `sticky-notes.mjs`）

**Interfaces:**
- Produces:
  - `viewer` contextmenu：目標在 `.npop` 裡 → `preventDefault`，不做別的；目標在 `.abar`、`.xbar` 裡 → `preventDefault`，不做別的；在 `.page` 上且 `noteAt()` 找到便利貼 → `showNoteMenu`（同 v1.0.30）；其他 → `await backToSelect()`。沒有開啟的文件時不處理。
  - `async backToSelect(): Promise<void>`：`POLY` 點數夠（`DRAW_TOOLS[S.tool].closed ? 3 : 2`）→ `await finishPoly()`，不夠 → `cancelPoly()`（不跳訊息）；`FPOLY` 有 3 個以上節點 → `finishFillPoly()`，不夠 → `cancelFillPoly()`；之後 `S.tool !== 'select'` → `setTool('select')`，否則 `deselectAnnot()`。

- [ ] **Step 1: 寫失敗的測試**

```js
// 選取工具：選到一個矩形 → 右鍵頁面空白處 → #ctx 沒顯示、S.tool === 'select'、sel() === null
// ['textbox','note','rect','pen','eraser','highlight','extract','ocr','stamp','hand','fill'] 逐一 setTool → 右鍵空白處 → S.tool === 'select'、#ctx 沒顯示
// 文字方塊工具：右鍵空白處 → FreeText 數量不變、沒有編輯框（TBE() === null）
// 文字方塊工具：點一下開始打字「右鍵前的字」→ 右鍵別處空白 → 有一個 FreeText 內容含「右鍵前的字」、S.tool === 'select'（Review Focus 1）
// 便利貼工具：點一下、輸入「右鍵前的便利貼」→ 右鍵別處空白 → Text 內容相同（Review Focus 2）
// 畫筆：拖一筆 → 右鍵 → Ink 多一個
// 多邊形：點 3 點 → 右鍵 → Polygon 多一個；只點 1 點 → 右鍵 → 不多、沒有 .toast.err
// 填色（方式＝節點）：點 3 個節點 → 右鍵 → 填色註解多一個（Review Focus 3）
// 文字辨識：框選一段 → 結果視窗出現 → 右鍵空白處 → 視窗不見、S.tool === 'select'（Review Focus 4）
// 頁面之間的灰色處右鍵 → S.tool === 'select'
// 縮圖右鍵 → #ctx 顯示頁面選單（有 data-c="del"）
// 右鍵便利貼 → 仍是便利貼選單（data-c="edit"）
```

- [ ] **Step 2: 跑 `xvfb-run -a node tests/e2e/right-click.mjs`，確認失敗（選取工具右鍵出現頁面選單）。**
- [ ] **Step 3: 實作 contextmenu 與 `backToSelect`，改提示文字。**
- [ ] **Step 4: 測試通過。**
- [ ] **Step 5: Commit**（`Right-click: no page menu on the document, back to the select tool`）

### Task 2: 在物件上按右鍵就選到它、文件

**Files:**
- Modify: `app/index.html`（contextmenu 在 `backToSelect()` 之後選物件；新增 `annAt`）、`HANDOFF.md`（右鍵一節、測試表）
- Test: `tests/e2e/right-click.mjs`（第 2 部分）

**Interfaces:**
- Consumes: Task 1 的 contextmenu、`backToSelect`。
- Produces:
  - `async annAt(i, cx, cy): Promise<Ann | null>`：`getAnns(i)` 裡最上面（清單最後）、框包含這一點、不是 `Text`（便利貼另外處理）也不是簽章欄位（`a.sig`）的註解。
  - contextmenu：`backToSelect()` 之後，點在頁面上且 `annAt` 找到 → `selectAnnot(i, a)`。

- [ ] **Step 1: 寫失敗的測試**

```js
// 畫筆工具下右鍵矩形 → S.tool === 'select'、sel().id === 矩形的 id
// 選取工具、選到別的物件時右鍵矩形 → sel().id === 矩形的 id
// 選到矩形後右鍵它的 .abar → sel().id 仍是矩形、#ctx 沒顯示（Review Focus 5）
```

- [ ] **Step 2: 跑測試，確認失敗（右鍵矩形後沒有選到）。**
- [ ] **Step 3: 實作；更新 `HANDOFF.md`。**
- [ ] **Step 4: 測試通過；`npm run check`、`npm run test:e2e` 全部通過。**
- [ ] **Step 5: Commit**（`Right-click on an object selects it`）
