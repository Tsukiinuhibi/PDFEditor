# Claude 增益集與轉存 Word 留下的小問題（v1.0.47）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 v1.0.43（Claude 增益集）與 v1.0.42（轉存 Word）最後檢查時留下的小問題。

**Architecture:**
- Task 1 改 `claude.js`、`main.js`、`app/claude/server/`、`app/index.html` 的 Claude 部分。
- Task 2 改 `word.js` 與 `app/index.html` 的轉存 Word 部分（`openWordDialog`、`flattenForExport`）。

**Tech Stack:** Electron、pdf-lib 1.17.1、playwright-core e2e。

**Spec:** v1.0.42、v1.0.43 最後檢查的 `Final: minor (deferred)` 清單（使用者 2026-11-14：「接著修正再發佈」）。

## Global Constraints
- 介面文字用繁體中文（台灣）；commit 用英文，結尾加兩行 attribution。
- 分支 `wip/claude-minor`。全部測試與最後檢查通過後，直接發佈 v1.0.47。
- 修改一律走 `mutate()`；不覆蓋原檔。

## Review Focus
1. Claude 的復原只復原 Claude 做的修改；使用者自己的修改，Claude 不會動。
2. 畫面重新載入或當掉時，等著的 Claude 呼叫立刻收到錯誤，不會等 170 秒。
3. 轉存 Word 進行中按 Esc 或點視窗外面：視窗不關、轉換繼續；只有〔取消〕會停。
4. 晚到的取消（Word 已經轉好）照實說；檔案被 Word 開著時說清楚，不改用內建轉換。
5. 只轉幾頁時，副本不帶沒選的頁面的資料。

---

### Task 1: Claude 增益集
**Files:**
- Modify：`claude.js`（`saveSettings` 用 0600）、`main.js`（重新載入或當掉時回覆等著的呼叫）、`app/claude/server/index.js`（batch → -32600）、`app/claude/server/tools.json`（annotations、`pdf_add_text` 的 `width`）、`app/index.html`
- Modify：`HANDOFF.md`（3.9.16）
- Test：`tests/e2e/claude.mjs` 第 5 部分

- [ ] **Step 1：寫測試。**
  - 權限與連線：
    - `claude.json` 權限 600。
    - Host 不是本機的請求回 403。
    - batch 回 -32600。
    - 工具有 annotations：讀取是 readOnly，取代與刪除頁是 destructive。
  - 設定窗格：開著時，Claude 呼叫後顯示「Claude 已連線」。
  - 取代：只列有取代的頁，說跳過掃描頁的幾處，提示以「Claude：」開頭。
  - 復原：
    - `pdf_undo` 只復原 Claude 的修改，並說復原了什麼。
    - 上一步是使用者做的，就不復原並說明原因。
  - 文字方塊：
    - 長的一行會換行，不超出頁面右邊。
    - 負的 x 或空字串回錯誤。
  - 跳頁：正在編輯文字方塊時，`pdf_go_to_page` 回忙碌。
  - `pdf_open`：
    - 要密碼的 PDF 說要密碼。
    - 跟目前文件同名、但壞掉的檔案回錯誤。
  - 呼叫等著時畫面重新載入：立刻回錯誤。
  - 測試丟出錯誤時，Electron 會被結束。
- [ ] **Step 2：執行，確認失敗。**
- [ ] **Step 3：實作。**
- [ ] **Step 4：執行，確認通過。**
- [ ] **Step 5：Commit。** 訊息：`Claude add-in: the deferred minors of v1.0.43`。

### Task 2: 轉存 Word
**Files:**
- Modify：`word.js`、`app/index.html`、`HANDOFF.md`（3.9.15）
- Test：`tests/e2e/word.mjs` 第 4 部分、`tests/e2e/word-main.mjs`

- [ ] **Step 1：寫測試。**
  - `word.mjs` 第 4 部分（主程式的 `word:*` 換成假的）：
    - Esc 與點視窗外面不會關閉轉換中的視窗。
    - 按〔取消〕立刻顯示「取消中」。
    - 晚到的取消（假的 Word 在取消後才回成功）：說「按取消時 Word 已經轉好了」。
    - 檔案被鎖（`why:'locked'`）：顯示那段說明，轉換方式不改成內建。
    - 內建轉換寫不進去（目標是資料夾）：說檔案被開著或不能寫入。
    - 有文字辨識的轉換做完、尋找列沒開：辨識程式已經釋放（`findWorker` 鉤子）。
    - `flatten`：
      - 沒有外觀的註解算進 `skipped`，完成訊息說有幾個沒轉。
      - 只選一頁時，沒選的頁上的大圖片不在副本裡。
  - `word-main.mjs`：
    - 目標檔被鎖（用資料夾當目標）→ `why:'locked'`，Word 不會被叫起來。
    - 超過一小時的 `pdfe-word-*` 暫存資料夾被清掉，新的留著。
- [ ] **Step 2：執行，確認失敗。**
- [ ] **Step 3：實作。**
  - `openWordDialog`：
    - 轉換中設 `S.exporting`。
    - 〔取消〕顯示「取消中…（等目前這一頁做完）」。
    - Word 回成功後再看一次取消。
    - 處理 `locked`。
    - 內建轉換寫檔錯誤（EBUSY／EPERM／EACCES／EISDIR／EROFS）給清楚的說明。
    - 尋找列沒開就釋放辨識程式（跟 `closeFind` 共用 `dropFindWorker()`）。
  - `flattenForExport`：
    - 回傳 `{bytes, boxes, skipped}`。
    - 沒選全部頁面、而且文件沒有讀不懂的物件時，刪掉 `reachableRefs` 以外的物件。
  - `word.js`：
    - `convertWithWord` 開始時清掉一小時以前的 `pdfe-word-*`。
    - `targetLocked(out)`。
- [ ] **Step 4：執行，確認通過。**
- [ ] **Step 5：Commit。** 訊息：`Word export: the deferred minors of v1.0.42`。
