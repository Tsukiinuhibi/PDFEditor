# 上下層級、多選與對齊、圖片刪除與更換留下的小問題（v1.0.50）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 v1.0.37（物件的上下層級）、v1.0.36（多選與對齊）、v1.0.35（圖片刪除與更換）最後檢查留下的小問題。

**Architecture:** 都在 `app/index.html`：
- Task 1：圖層面板的物件清單、拖曳、選單（`LY_FOLD`、`keepPlace`、移到圖層）。
- Task 2：多選（`MS`、`toggleMulti`、群組拖曳、框選、對齊選單）。
- Task 3：圖片刪除／更換（`deletePageImage`、`replacePageImage`、`purgeImages`、`reachableRefs`）。

**Tech Stack:** pdf-lib 1.17.1、pdf.js 4.10.38、playwright-core e2e。

**Spec:** `docs/superpowers/deferred-minors.md` 的 v1.0.37、v1.0.36、v1.0.35 三段（使用者 2026-11-14：「接著修正再發佈」「接著做」）。

## Global Constraints
- 介面文字用繁體中文（台灣）；commit 用英文，結尾加兩行 attribution。
- 分支 `wip/stack-multi-image-minor`。全部測試與最後檢查通過後，直接發佈 v1.0.50；發佈時從 deferred-minors.md 刪掉這三段。
- 修改一律走 `mutate()`；新註解走 `addAnnot()`；可點的東西用 `getAnns()`；不覆蓋原檔。

## Review Focus
1. 鎖定的圖層：物件不能被拖進去、不能用選單移進去，也不能從裡面移出來；被拒絕時要說明。
2. 有簽章的文件：沒有真的改變時，不會問簽章的問題。
3. 多選：Esc 取消群組拖曳；部分在頁面外的物件也框得到；被拒絕的刪除不會放掉選取。
4. 圖片：刪除或更換時，不會刪掉註解外觀、圖樣（pattern）、Type3 字型還在用的資源。
5. 連按兩次〔刪除圖片〕／〔更換圖片…〕只做一次。

---

### Task 1: 上下層級（v1.0.37）
- 物件拖到鎖定圖層那一列：提示「這個圖層已鎖定」。
- 移到圖層：選單不列鎖定的圖層；鎖定圖層上的物件不能移出。
- 沒有圖層的物件在有圖層的文件裡：「已經在最上層／最下層」照整頁 /Annots 的順序判斷。
- 有簽章的文件：拖到原本的位置，不問、不改。
- `LY_FOLD`：依文件分開記。
- `keepPlace`：略過 null 與重複的參照。
- 用面板的選單或拖曳時，頁面上選取的其他物件（或群組）不放掉。
- 判斷：
  - 清單整個重建：效能，留著。
  - 計畫的名稱：已經在 v1.0.37 判斷過。

### Task 2: 多選與對齊（v1.0.36）
- 群組拖曳時按 Esc：回到原位。
- 框選：部分在頁面外的物件，以頁面內的部分判斷。
- Shift＋點：選取框底下沒被選的物件也能加入。
- 方向鍵微調還沒寫入時按 Shift＋點：先寫入。
- `deleteMulti`：使用者取消時保留選取。
- 關掉最後一個分頁：清掉 multi／objbar 狀態。
- 對齊到選單：選完或關掉後把焦點還給頁面。
- 判斷：
  - 群組拖曳不吸附：規格的文字過時。
  - 群組拖曳只顯示外框：留著。
  - 測試缺口：補框選一個物件、Shift＋框選、垂直平均分配。

### Task 3: 圖片刪除與更換（v1.0.35）
- `reachableRefs`：也走 trailer 的 /ID。
- 疊在一起的圖片：第一張完全被裁掉時，用看得到的那張決定範圍。
- `purgeImages`／`cloneChain`：註解外觀、圖樣、Type3 用到的資源視為還在使用。
- 〔刪除圖片〕／〔更換圖片…〕：不能重複執行；用完釋放 object URL；「同一張圖」要比對位元組。
- 判斷：
  - 效能（每次三次走訪）：留著。
  - BI…EI 的結尾判斷：留著（要完整的內容解析器）。
  - 測試缺口：補「更換時另存一份（copy-on-write）」與 ↻ 的方向。
