# 尋找與取代、列印留下的小問題（v1.0.49）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 v1.0.39（尋找與取代）、v1.0.38（列印）最後檢查留下的小問題，以及 v1.0.48 留下的兩個。

**Architecture:**
- Task 1：`app/index.html` 的尋找列（`FIND`、`searchDoc`、`replaceNow`、`findLines`、掃描頁辨識）。
- Task 2：列印視窗（`PR`、`printPlan`、`openPrintDialog`）與主程式的列印 IPC。
- Task 3：`linkRef`、`open-url.mjs`。

**Tech Stack:** Electron 45、pdf.js 4.10.38、pdf-lib 1.17.1、Tesseract.js、playwright-core e2e。

**Spec:** `docs/superpowers/deferred-minors.md` 的 v1.0.48、v1.0.39、v1.0.38 三段（使用者 2026-11-14：「接著修正再發佈」）。

## Global Constraints
- 介面文字用繁體中文（台灣）；commit 用英文，結尾加兩行 attribution。
- 分支 `wip/find-print-minor`。全部測試與最後檢查通過後，直接發佈 v1.0.49。發佈時從 deferred-minors.md 刪掉這三段。
- 修改一律走 `mutate()`；不覆蓋原檔。

## Review Focus
1. 取代：真的改了幾處就說幾處；改不了的說是哪幾頁；一處都沒改就不留復原步驟。
2. 掃描頁辨識：旋轉或修改過的頁面重新辨識；空白頁不送辨識；可以停止。
3. 尋找列的輸入框不吃掉 Ctrl+S／Ctrl+O／Ctrl+P；取代框裡 Ctrl+F、F3 照常有用。
4. 列印：頁碼超出範圍說清楚；列印視窗只會有一個；印表機卡住時可以取消。
5. 列印設定：存回去的值都在範圍內（空白、太小、太大）。

---

### Task 1: 尋找與取代（v1.0.39）
- 取代：
  - 只算真的改了的行；改不了的列出頁碼。
  - 一行都沒改就不 `mutate`。
- 混合原文與本程式文字區塊的行：判斷（跟單擊編輯器一樣）。
- 每次修改後重讀：只重讀改過的頁；行快取的上限以頁數為準。
- 掃描頁辨識：
  - 快取鍵加上旋轉與內容版本。
  - 沒有圖片的頁不送辨識。
  - 〔停止〕按鈕；換上一筆／下一筆不蓋掉進度。
- 尋找列的輸入框：
  - Ctrl+S／O／P 交給程式。
  - 取代框裡 Ctrl+F、F3、Shift+F3 照常有用。
- 全形＝半形＋全字相符：全形英數字算字母。
- 「搜尋」分頁：尋找列關掉後清空，或修改後更新。
- 舊的自訂 Ctrl+F／F3：v1.0.48 的啟動檢查已經處理（判斷）。
- 字型替代的提示：一次取代只提示一次。

### Task 2: 列印（v1.0.38）
- 頁碼：
  - 超出範圍說「頁碼要在 1～N 之間」。
  - 剛選「自訂」還沒輸入時不顯示紅字。
- 列印視窗只開一個：載入印表機清單時再按 Ctrl+P 不開第二個，並顯示忙碌。
- 印表機卡住：「正在送到印表機…」可以按〔取消〕或 Esc 結束等待。
- 置中位置取整數像素，不重新取樣。
- 數字欄位：
  - 空白或小於下限時，欄位顯示實際使用的值。
  - 份數上限 999 也顯示在欄位。
- 讀進來的列印設定做範圍檢查。
- 雙面列印（不只手冊）顯示「第 K 張正面／背面」。
- 列印視窗開著時從檔案總管開啟的 PDF：等列印視窗關掉才開。
- 匯出的設定檔有印表機名稱：判斷（無害）。
- 瀏覽器版的列印按鈕：說明為什麼不能用（`title`）。

### Task 3: v1.0.48 留下的
- `linkRef`：同一個框有兩個直接寫在 /Annots 的連結時，選目的地相符的那個。
- `open-url.mjs`：Esc 測試後還原 `url:cancel`（改成那一段最後才換）。
