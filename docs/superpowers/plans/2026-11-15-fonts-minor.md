# 字型相關與 v1.0.51 留下的小問題（v1.0.52）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 v1.0.26～v1.0.28（字型）與 v1.0.51 最後檢查留下的小問題。

**Architecture:** 都在 `app/index.html`（`app/fontid.js` 可能一處）：
- Task 1：v1.0.51 留下的（`usedElsewhere` 的 `own()`、列印／轉存前寫入微調、設定的內部值）。
- Task 2：文字方塊的字型選單（v1.0.26：`openFontMenu`、`renderTextBox`）。
- Task 3：嵌入系統字型（v1.0.27：fsType、CFF 的 .otf、字面選擇、讀檔）。
- Task 4：字型辨識（v1.0.28：`FONTID`、Google Fonts 批次、進度）。

**Tech Stack:** Electron 45、pdf-lib 1.17.1、fontkit、pdf.js 4.10.38、playwright-core e2e。

**Spec:** `docs/superpowers/deferred-minors.md` 的 v1.0.51、v1.0.28、v1.0.27、v1.0.26 四段（使用者 2026-11-14：「接著修正再發佈」「先繼續接著做／有問題先略過再回頭修」）。

## Global Constraints
- 介面文字用繁體中文（台灣）；commit 用英文，結尾加兩行 attribution。
- 分支 `wip/fonts-minor`。全部測試與最後檢查通過後，直接發佈 v1.0.52；發佈時從 deferred-minors.md 刪掉這四段。
- 修改一律走 `mutate()`；不覆蓋原檔。
- 卡住或要先量測的項目略過、記在 ledger（使用者 2026-11-14）。

## Review Focus
1. 字型選單：輸入法選字時按 Enter 不會選到字型；空白搜尋按 Enter 不會選字型。
2. 字型授權：fsType 同時有好幾個位元時，照 OpenType 規定以最寬鬆的為準。
3. 嵌入：整個嵌入的 CFF .otf 寫成 PDF 認得的格式。
4. 字型辨識：中途停止後不會卡在忙碌；Google Fonts 的錯誤（429／403）不會變成大量重試。
5. 列印與轉存：還沒寫入的微調會先寫入。

---

### Task 1: v1.0.51 留下的
- `own()`：沒有自己資源的內容以「內容＋所在資源」為準記住（兩頁共用同一個 Type3 字型、名稱對到不同圖）。
- 列印、轉存圖片／Word、在新分頁開啟：先寫入還沒寫入的微調。
- 設定檔：只檢查是物件的鍵（styles、view、textbox…）也檢查已知的內部值（數字、布林、字串）。

### Task 2: 文字方塊的字型選單（v1.0.26）
- 搜尋框 Enter：輸入法選字中（isComposing）不選；空白搜尋不選。
- 用字型按鈕關掉選單：焦點與選取範圍還給編輯器。
- 搜尋框有焦點時，編輯器裡選的文字仍看得到（CSS 自訂反白）。
- `.fm-list` 加 `overscroll-behavior:contain`。
- `renderTextBox` 等字型改用 `Promise.allSettled`。
- 判斷：混用字型的行的基線／行高（要每個字型的度量，留著）；HANDOFF 的版本說明（已過時）。

### Task 3: 嵌入系統字型（v1.0.27）
- fsType 好幾個位元：以最寬鬆的為準（OpenType 規定）。
- 整個嵌入的 CFF .otf：FontFile3 的 /Subtype 用 /OpenType。
- 字面選擇：沒有 Regular 時優先選正常寬度（不選 Condensed／Narrow）；粗體不選 Condensed。
- 第一次點頁面文字：同一個字型檔只讀一次（讀取中的 Promise 共用）。
- 判斷：斜體用真的 Italic 字面（要另外載入字面與寬度，留著）；'vert' 檢查（要直書的測試字型，留著）；清空的編輯器字型（細節要再查）；快取不釋放（效能）；測試慣例。

### Task 4: 字型辨識（v1.0.28）
- `FONTID.busy`：停止或被 文字 頁的框選打斷時一定放開。
- Google Fonts 批次：只有 400／404／413 才逐一重試，429／403 不重試。
- 字型不在 commonObjs：說明「讀不到這個字型」，不說「PDF 沒有記錄字型名稱」。
- 判斷：中值濾波的細線、相似度下限、Windows 時間、`glyphsFromImage` 讓出、`blocks:true`、GF 快取累積（要先量測或效能，留著）。
