# 從網址開啟與連結工具留下的小問題（v1.0.48）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 v1.0.40（從網址開啟）、v1.0.41（連結工具）最後檢查留下的小問題，以及 v1.0.47 留下的兩個。

**Architecture:**
- Task 1 改 `main.js`（`url:fetch`、`urlFileName`、`app:clipboard-text`、`file:write`）與 `app/index.html` 的「從網址開啟」部分（`urlDialog`、`urlWhy`）。
- Task 2 改 `app/index.html` 的連結工具（`pageLinks`、`openLinkDialog`、Ctrl＋點、`setTool`）與轉存 Word 的一句提示。

**Tech Stack:** Electron 45（`net.fetch`）、pdf-lib 1.17.1、pdf.js 4.10.38、playwright-core e2e。

**Spec:** `docs/superpowers/deferred-minors.md` 的 v1.0.40、v1.0.41、v1.0.47 三段（使用者 2026-11-14：「接著修正再發佈」）。

## Global Constraints
- 介面文字用繁體中文（台灣）；commit 用英文，結尾加兩行 attribution。
- 分支 `wip/link-url-minor`。全部測試與最後檢查通過後，直接發佈 v1.0.48；發佈時把 deferred-minors.md 的這三段刪掉。
- 修改一律走 `mutate()`；新註解走 `addAnnot()`；可點的東西用 `getAnns()`；不覆蓋原檔。

## Review Focus
1. 伺服器給的檔名是 Latin-1 或 Big5 時，存檔名稱不是亂碼（無法判斷時用網址上的名稱）。
2. 按 Esc 關掉下載視窗後馬上再開，〔開啟〕仍然能用。
3. 錯誤訊息都是中文、不會顯示網址裡的帳號密碼；401／403 會說要先登入。
4. 別的程式做的連結（直接寫在 /Annots 裡的、紅色框的）可以修改、刪除，外框選項不會說錯。
5. Ctrl＋點網址會先問；Ctrl＋拖曳不會吃掉下一次點擊。

---

### Task 1: 從網址開啟（v1.0.40）
- 檔名：
  - UTF-8 → 用它。
  - 不是 UTF-8 → 試 Big5（至少兩個中文字才算）。
  - 都不是 → 照 Latin-1。
  - 伺服器給的名稱清理後是空的 → 用網址上的名稱。
- `url:fetch`：
  - 提早結束時關掉回應（`res.body.cancel()`）。
  - 轉址後的網址也要是 http(s)。
  - 知道大小又沒有壓縮時，預先配置一塊記憶體，不再 concat。
- 剪貼簿只回傳網址。
- 視窗：
  - Esc 關掉時清掉 `URLJOB`；舊的下載結束時只清自己的。
  - 錯誤對照表：ERR_NAME_NOT_RESOLVED、ERR_INTERNET_DISCONNECTED、連線、憑證、Proxy、轉址太多；401／403 說要先登入，404 說找不到。
  - 開啟大檔時顯示忙碌；要密碼的 PDF 說要密碼。
  - gzip 時進度只顯示已下載的量。
- 自訂的 Ctrl+Shift+O：啟動時發現跟內建的重複，就提示一次並取消那個自訂。
- `file:write` 寫暫存檔失敗時也刪掉它（v1.0.47）。
- 判斷：
  - 拖進來的文字是網址也下載：保留（方便）。
  - 測試的固定等待：保留。
  - 測試會蓋掉剪貼簿：改成測完還原。
  - 文件沒收尾：已不成立。

### Task 2: 連結工具（v1.0.41）
- 修改、刪除直接寫在 /Annots 裡的連結：用 Rect 找到那個字典，修改時先登記成間接物件。
- 外框：
  - 只有我們畫的藍框（/C 藍、有 /AP）才算「細藍框」。
  - 別的框顯示「維持原樣」，不會被改。
- 換目標時一起刪掉 /PA。
- 吃掉點擊：只吃同一次按下產生的那個 click，下一次按下就取消。
- 修改後重建覆蓋層前的 Ctrl＋點：先等 `pageLinks(i)`。
- 連結工具在既有連結裡：
  - 按下後拖曳超過 4 px → 畫新的連結。
  - 只點一下 → 開那個連結的視窗。
- Ctrl＋點網址：先問「要在瀏覽器開啟嗎？」（顯示網址）。
- 刪掉 `setTool` 裡 `insertImage` 的死碼。
- 轉存 Word 準備中按取消只顯示「取消中…」（v1.0.47）。
- 測試：
  - JavaScript 動作的連結（不開、說明）。
  - 頁面連結 Ctrl＋點前先確認畫面回到第 1 頁。
